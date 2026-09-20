<?php

use App\Models\User;
use App\Modules\Challenges\Application\Commands\CreateChallengeCommand;
use App\Modules\Challenges\Application\Commands\UpdateChallengeMetadataCommand;
use App\Modules\Challenges\Application\UseCases\CreateChallengeUseCase;
use App\Modules\Challenges\Application\UseCases\UpdateChallengeMetadataUseCase;
use App\Modules\Challenges\Domain\Exceptions\IdempotencyKeyReusedException;
use App\Modules\Challenges\Domain\Exceptions\VersionConflictException;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

beforeEach(function () {
    config(['database.connections.pgsql_second' => config('database.connections.pgsql')]);

    DB::table('mutation_commands')->delete();
    DB::table('challenge_target_periods')->delete();
    DB::table('challenges')->delete();
    DB::table('account_states')->delete();
    DB::table('users')->delete();
});

afterEach(function () {
    try {
        DB::connection('pgsql')->rollBack();
    } catch (Throwable) {
    }
    try {
        DB::connection('pgsql_second')->rollBack();
    } catch (Throwable) {
    }

    DB::disconnect('pgsql_second');

    DB::table('mutation_commands')->delete();
    DB::table('challenge_target_periods')->delete();
    DB::table('challenges')->delete();
    DB::table('account_states')->delete();
    DB::table('users')->delete();
});

function createCommittedOwner(string $email = 'owner@example.com'): User
{
    $user = User::create([
        'id' => (string) Str::uuid(),
        'email' => $email,
        'name' => 'Owner',
        'is_owner' => true,
        'password' => bcrypt('secret'),
    ]);

    DB::table('account_states')->insert([
        'owner_id' => $user->id,
        'timezone' => 'Asia/Ho_Chi_Minh',
        'account_revision' => 0,
        'data_epoch' => 1,
        'write_state' => 'open',
    ]);

    return $user;
}

test('AD-6: account-row FOR UPDATE serializes concurrent transactions on the same account via PostgreSQL lock timeout', function () {
    $owner = createCommittedOwner();
    $conn1 = DB::connection('pgsql');
    $conn2 = DB::connection('pgsql_second');

    // Connection 1 begins transaction and acquires exclusive row lock on account_states
    $conn1->beginTransaction();
    $lockedRow = $conn1->table('account_states')
        ->where('owner_id', $owner->id)
        ->lockForUpdate()
        ->first();
    expect($lockedRow)->not->toBeNull();

    // Connection 2 sets a 200ms lock timeout. Attempting to acquire lockForUpdate on the same row must fail.
    $conn2->statement("SET lock_timeout = '200ms'");

    $timeoutThrown = false;
    try {
        $conn2->beginTransaction();
        $conn2->table('account_states')
            ->where('owner_id', $owner->id)
            ->lockForUpdate()
            ->first();
    } catch (QueryException $e) {
        $timeoutThrown = true;
        // PostgreSQL error code 55P03 indicates lock_not_available due to lock timeout
        expect($e->getCode())->toBe('55P03')
            ->and($e->getMessage())->toContain('canceling statement due to lock timeout');
    } finally {
        $conn2->rollBack();
    }

    expect($timeoutThrown)->toBeTrue();

    // Now Connection 1 commits its transaction, releasing the lock
    $conn1->commit();

    // Connection 2 can now acquire the lock immediately
    $conn2->statement("SET lock_timeout = '2000ms'");
    $conn2->beginTransaction();
    $acquiredRow = $conn2->table('account_states')
        ->where('owner_id', $owner->id)
        ->lockForUpdate()
        ->first();
    expect($acquiredRow)->not->toBeNull();
    $conn2->commit();
});

test('AD-6: row locks on account_states do not block concurrent transactions for different owners', function () {
    $owner1 = createCommittedOwner('owner1@example.com');

    $owner2 = User::create([
        'id' => (string) Str::uuid(),
        'email' => 'other@example.com',
        'name' => 'Other',
        'is_owner' => false,
        'password' => bcrypt('secret'),
    ]);
    DB::table('account_states')->insert([
        'owner_id' => $owner2->id,
        'timezone' => 'Asia/Ho_Chi_Minh',
        'account_revision' => 0,
        'data_epoch' => 1,
        'write_state' => 'open',
    ]);

    $conn1 = DB::connection('pgsql');
    $conn2 = DB::connection('pgsql_second');

    // Connection 1 locks Owner 1's row
    $conn1->beginTransaction();
    $conn1->table('account_states')->where('owner_id', $owner1->id)->lockForUpdate()->first();

    // Connection 2 attempts to lock Owner 2's row with short timeout - must succeed without blocking
    $conn2->statement("SET lock_timeout = '200ms'");
    $conn2->beginTransaction();
    $owner2Row = $conn2->table('account_states')->where('owner_id', $owner2->id)->lockForUpdate()->first();
    expect($owner2Row)->not->toBeNull()
        ->and($owner2Row->owner_id)->toBe($owner2->id);

    $conn2->commit();
    $conn1->commit();
});

test('AD-6: serialized concurrent updates prevent lost updates and throw VersionConflictException for stale baseVersion', function () {
    $owner = createCommittedOwner();
    $createUseCase = app(CreateChallengeUseCase::class);
    $updateUseCase = app(UpdateChallengeMetadataUseCase::class);

    // Initial challenge created at version 1
    $createResult = $createUseCase->execute(new CreateChallengeCommand(
        ownerId: $owner->id,
        commandId: (string) Str::uuid(),
        dataEpoch: 1,
        name: 'Initial Name',
        description: 'Initial Description',
        targetDays: 4,
    ));
    $challengeId = $createResult['challenge']['id'];
    expect($createResult['challenge']['row_version'])->toBe(1);

    // Two concurrent clients both read challenge at version 1
    $clientABaseVersion = 1;
    $clientBBaseVersion = 1;

    // Client A executes update first, advancing version to 2
    $clientAResult = $updateUseCase->execute(new UpdateChallengeMetadataCommand(
        ownerId: $owner->id,
        challengeId: $challengeId,
        commandId: (string) Str::uuid(),
        dataEpoch: 1,
        baseVersion: $clientABaseVersion,
        name: 'Name by Client A',
        description: 'Description by Client A',
    ));
    expect($clientAResult['challenge']['row_version'])->toBe(2);

    // Client B executes update second with stale base_version=1
    // The use case locks account_states FOR UPDATE, sees challenge is now at row_version=2, and rejects with VersionConflictException
    try {
        $updateUseCase->execute(new UpdateChallengeMetadataCommand(
            ownerId: $owner->id,
            challengeId: $challengeId,
            commandId: (string) Str::uuid(),
            dataEpoch: 1,
            baseVersion: $clientBBaseVersion,
            name: 'Name by Client B (Lost Update Attempt)',
            description: 'Description by Client B',
        ));
        $this->fail('Expected VersionConflictException was not thrown');
    } catch (VersionConflictException $e) {
        expect($e->resourceId)->toBe($challengeId)
            ->and($e->currentVersion)->toBe(2)
            ->and($e->currentSnapshot['name'])->toBe('Name by Client A')
            ->and($e->currentSnapshot['row_version'])->toBe(2);
    }

    // Confirm database still contains Client A's update and row_version is 2
    $persisted = DB::table('challenges')->where('id', $challengeId)->first();
    expect($persisted->name)->toBe('Name by Client A')
        ->and((int) $persisted->row_version)->toBe(2);

    // Confirm account revision was incremented exactly twice (once for create, once for Client A)
    $revision = DB::table('account_states')->where('owner_id', $owner->id)->value('account_revision');
    expect((int) $revision)->toBe(2);
});

test('AD-6: serialized concurrent duplicate commands replay idempotent result without duplicating records', function () {
    $owner = createCommittedOwner();
    $createUseCase = app(CreateChallengeUseCase::class);

    $commandId = (string) Str::uuid();
    $cmd = new CreateChallengeCommand(
        ownerId: $owner->id,
        commandId: $commandId,
        dataEpoch: 1,
        name: 'Concurrent Idempotent Challenge',
        description: 'Testing duplicate submissions',
        targetDays: 5,
    );

    // First execution
    $res1 = $createUseCase->execute($cmd);
    expect($res1['challenge']['name'])->toBe('Concurrent Idempotent Challenge')
        ->and($res1['account_revision'])->toBe(1);

    // Second execution with identical command_id and payload
    $res2 = $createUseCase->execute($cmd);
    expect($res2['challenge']['id'])->toBe($res1['challenge']['id'])
        ->and($res2['challenge']['name'])->toBe($res1['challenge']['name'])
        ->and($res2['account_revision'])->toBe(1);

    // Ensure database records were not duplicated
    expect(DB::table('challenges')->where('owner_id', $owner->id)->count())->toBe(1)
        ->and(DB::table('challenge_target_periods')->where('owner_id', $owner->id)->count())->toBe(1)
        ->and(DB::table('mutation_commands')->where('command_id', $commandId)->count())->toBe(1);

    // Third execution with same command_id but DIFFERENT payload throws IdempotencyKeyReusedException
    $diffCmd = new CreateChallengeCommand(
        ownerId: $owner->id,
        commandId: $commandId,
        dataEpoch: 1,
        name: 'Different Name with Reused Key',
        description: null,
        targetDays: 3,
    );

    expect(fn () => $createUseCase->execute($diffCmd))->toThrow(IdempotencyKeyReusedException::class);
});
