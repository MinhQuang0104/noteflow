<?php

use App\Models\User;
use App\Modules\Challenges\Application\Commands\CreateChallengeCommand;
use App\Modules\Challenges\Application\Commands\UpdateChallengeMetadataCommand;
use App\Modules\Challenges\Application\UseCases\CreateChallengeUseCase;
use App\Modules\Challenges\Application\UseCases\GetChallengeDetailQuery;
use App\Modules\Challenges\Application\UseCases\GetChallengeListQuery;
use App\Modules\Challenges\Application\UseCases\UpdateChallengeMetadataUseCase;
use App\Modules\Challenges\Domain\Exceptions\IdempotencyKeyReusedException;
use App\Modules\Challenges\Domain\Exceptions\InvalidChallengeNameException;
use App\Modules\Challenges\Domain\Exceptions\InvalidTargetDaysException;
use App\Modules\Challenges\Domain\Exceptions\StaleDataEpochException;
use App\Modules\Challenges\Domain\Exceptions\VersionConflictException;
use App\Modules\Challenges\Domain\Exceptions\WriteFenceActiveException;
use App\Modules\Identity\Contracts\Clock;
use DateTimeImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

uses(RefreshDatabase::class);

function createTestOwner(string $timezone = 'Asia/Ho_Chi_Minh', int $epoch = 1, string $writeState = 'open'): User
{
    $owner = User::factory()->owner()->create();
    DB::table('account_states')->updateOrInsert(
        ['owner_id' => $owner->id],
        [
            'timezone' => $timezone,
            'account_revision' => 0,
            'data_epoch' => $epoch,
            'write_state' => $writeState,
        ]
    );

    return $owner;
}

test('create challenge captures account-today, sets initial target, and increments account_revision exactly once', function () {
    $clock = new class implements Clock
    {
        public function now(): DateTimeImmutable
        {
            return new DateTimeImmutable('2026-09-19T10:00:00+00:00'); // in Asia/Ho_Chi_Minh (UTC+7) -> 2026-09-19 17:00
        }
    };
    $this->app->instance(Clock::class, $clock);

    $owner = createTestOwner();
    $useCase = app(CreateChallengeUseCase::class);

    $commandId = (string) Str::uuid();
    $result = $useCase->execute(new CreateChallengeCommand(
        ownerId: $owner->id,
        commandId: $commandId,
        dataEpoch: 1,
        name: 'Đọc sách 30 phút',
        description: 'Đọc sách mỗi ngày',
        targetDays: 5,
    ));

    expect($result['challenge']['name'])->toBe('Đọc sách 30 phút')
        ->and($result['challenge']['description'])->toBe('Đọc sách mỗi ngày')
        ->and($result['challenge']['start_date'])->toBe('2026-09-19')
        ->and($result['challenge']['target_days'])->toBe(5)
        ->and($result['challenge']['row_version'])->toBe(1)
        ->and($result['account_revision'])->toBe(1)
        ->and($result['data_epoch'])->toBe(1);

    // Verify persisted in challenges table
    $persisted = DB::table('challenges')->where('id', $result['challenge']['id'])->first();
    expect($persisted)->not->toBeNull()
        ->and($persisted->owner_id)->toBe($owner->id)
        ->and($persisted->start_date)->toBe('2026-09-19')
        ->and((int) $persisted->row_version)->toBe(1);

    // Verify initial target period in challenge_target_periods table
    $period = DB::table('challenge_target_periods')->where('challenge_id', $result['challenge']['id'])->first();
    expect($period)->not->toBeNull()
        ->and($period->owner_id)->toBe($owner->id)
        ->and((int) $period->target_days)->toBe(5)
        ->and($period->effective_from)->toBe('2026-09-19');

    // Verify account_revision on account_states incremented once
    $revision = DB::table('account_states')->where('owner_id', $owner->id)->value('account_revision');
    expect((int) $revision)->toBe(1);

    // Verify command ledger entry in mutation_commands
    $ledger = DB::table('mutation_commands')->where('command_id', $commandId)->first();
    expect($ledger)->not->toBeNull()
        ->and($ledger->owner_id)->toBe($owner->id)
        ->and($ledger->command_type)->toBe('create_challenge')
        ->and((int) $ledger->response_status)->toBe(201);
});

test('create challenge rejects target outside 1-7 or empty name without changing state', function () {
    $owner = createTestOwner();
    $useCase = app(CreateChallengeUseCase::class);

    // Invalid target < 1
    expect(fn () => $useCase->execute(new CreateChallengeCommand(
        ownerId: $owner->id,
        commandId: (string) Str::uuid(),
        dataEpoch: 1,
        name: 'Valid Name',
        description: null,
        targetDays: 0,
    )))->toThrow(InvalidTargetDaysException::class);

    // Invalid target > 7
    expect(fn () => $useCase->execute(new CreateChallengeCommand(
        ownerId: $owner->id,
        commandId: (string) Str::uuid(),
        dataEpoch: 1,
        name: 'Valid Name',
        description: null,
        targetDays: 8,
    )))->toThrow(InvalidTargetDaysException::class);

    // Empty name
    expect(fn () => $useCase->execute(new CreateChallengeCommand(
        ownerId: $owner->id,
        commandId: (string) Str::uuid(),
        dataEpoch: 1,
        name: '   ',
        description: null,
        targetDays: 3,
    )))->toThrow(InvalidChallengeNameException::class);

    // account_revision remains 0
    $revision = DB::table('account_states')->where('owner_id', $owner->id)->value('account_revision');
    expect((int) $revision)->toBe(0);
});

test('replaying create command returns original response without mutating again or incrementing revision', function () {
    $owner = createTestOwner();
    $useCase = app(CreateChallengeUseCase::class);
    $commandId = (string) Str::uuid();

    $command = new CreateChallengeCommand(
        ownerId: $owner->id,
        commandId: $commandId,
        dataEpoch: 1,
        name: 'Tập thể dục',
        description: 'Chạy buổi sáng',
        targetDays: 4,
    );

    $res1 = $useCase->execute($command);
    expect($res1['account_revision'])->toBe(1);

    // Replay exact same command
    $res2 = $useCase->execute($command);
    expect($res2['challenge']['id'])->toBe($res1['challenge']['id'])
        ->and($res2['account_revision'])->toBe(1);

    // account_revision in DB is still 1
    $revision = DB::table('account_states')->where('owner_id', $owner->id)->value('account_revision');
    expect((int) $revision)->toBe(1);

    // challenges count is still 1
    expect(DB::table('challenges')->where('owner_id', $owner->id)->count())->toBe(1);
});

test('reusing command_id with different payload throws IdempotencyKeyReusedException', function () {
    $owner = createTestOwner();
    $useCase = app(CreateChallengeUseCase::class);
    $commandId = (string) Str::uuid();

    $useCase->execute(new CreateChallengeCommand(
        ownerId: $owner->id,
        commandId: $commandId,
        dataEpoch: 1,
        name: 'Tập thể dục',
        description: null,
        targetDays: 4,
    ));

    expect(fn () => $useCase->execute(new CreateChallengeCommand(
        ownerId: $owner->id,
        commandId: $commandId,
        dataEpoch: 1,
        name: 'Tập thể dục khác',
        description: null,
        targetDays: 4,
    )))->toThrow(IdempotencyKeyReusedException::class);
});

test('update challenge metadata modifies only name/description and increments row_version and account_revision once', function () {
    $owner = createTestOwner();
    $createUseCase = app(CreateChallengeUseCase::class);
    $updateUseCase = app(UpdateChallengeMetadataUseCase::class);

    $createRes = $createUseCase->execute(new CreateChallengeCommand(
        ownerId: $owner->id,
        commandId: (string) Str::uuid(),
        dataEpoch: 1,
        name: 'Tên ban đầu',
        description: 'Mô tả ban đầu',
        targetDays: 3,
    ));

    $challengeId = $createRes['challenge']['id'];
    $startDate = $createRes['challenge']['start_date'];

    $updateCmdId = (string) Str::uuid();
    $updateRes = $updateUseCase->execute(new UpdateChallengeMetadataCommand(
        ownerId: $owner->id,
        challengeId: $challengeId,
        commandId: $updateCmdId,
        dataEpoch: 1,
        baseVersion: 1,
        name: 'Tên mới đã sửa',
        description: 'Mô tả mới đã sửa',
    ));

    expect($updateRes['challenge']['name'])->toBe('Tên mới đã sửa')
        ->and($updateRes['challenge']['description'])->toBe('Mô tả mới đã sửa')
        ->and($updateRes['challenge']['start_date'])->toBe($startDate)
        ->and($updateRes['challenge']['target_days'])->toBe(3)
        ->and($updateRes['challenge']['row_version'])->toBe(2)
        ->and($updateRes['account_revision'])->toBe(2);

    // Verify DB
    $persisted = DB::table('challenges')->where('id', $challengeId)->first();
    expect($persisted->name)->toBe('Tên mới đã sửa')
        ->and($persisted->description)->toBe('Mô tả mới đã sửa')
        ->and($persisted->start_date)->toBe($startDate)
        ->and((int) $persisted->row_version)->toBe(2);

    // Target periods untouched
    $periods = DB::table('challenge_target_periods')->where('challenge_id', $challengeId)->get();
    expect($periods)->toHaveCount(1)
        ->and((int) $periods[0]->target_days)->toBe(3);

    // account_revision is 2
    $revision = DB::table('account_states')->where('owner_id', $owner->id)->value('account_revision');
    expect((int) $revision)->toBe(2);
});

test('no-op update preserves state and does not increment row_version or account_revision', function () {
    $owner = createTestOwner();
    $createUseCase = app(CreateChallengeUseCase::class);
    $updateUseCase = app(UpdateChallengeMetadataUseCase::class);

    $createRes = $createUseCase->execute(new CreateChallengeCommand(
        ownerId: $owner->id,
        commandId: (string) Str::uuid(),
        dataEpoch: 1,
        name: 'Tên giữ nguyên',
        description: 'Mô tả giữ nguyên',
        targetDays: 4,
    ));

    $challengeId = $createRes['challenge']['id'];

    $updateRes = $updateUseCase->execute(new UpdateChallengeMetadataCommand(
        ownerId: $owner->id,
        challengeId: $challengeId,
        commandId: (string) Str::uuid(),
        dataEpoch: 1,
        baseVersion: 1,
        name: 'Tên giữ nguyên',
        description: 'Mô tả giữ nguyên',
    ));

    expect($updateRes['challenge']['row_version'])->toBe(1)
        ->and($updateRes['account_revision'])->toBe(1);

    // Persisted revision still 1
    $revision = DB::table('account_states')->where('owner_id', $owner->id)->value('account_revision');
    expect((int) $revision)->toBe(1);
});

test('stale base_version throws VersionConflictException containing current snapshot', function () {
    $owner = createTestOwner();
    $createUseCase = app(CreateChallengeUseCase::class);
    $updateUseCase = app(UpdateChallengeMetadataUseCase::class);

    $createRes = $createUseCase->execute(new CreateChallengeCommand(
        ownerId: $owner->id,
        commandId: (string) Str::uuid(),
        dataEpoch: 1,
        name: 'Tên v1',
        description: null,
        targetDays: 2,
    ));

    $challengeId = $createRes['challenge']['id'];

    // Advance to version 2
    $updateUseCase->execute(new UpdateChallengeMetadataCommand(
        ownerId: $owner->id,
        challengeId: $challengeId,
        commandId: (string) Str::uuid(),
        dataEpoch: 1,
        baseVersion: 1,
        name: 'Tên v2',
        description: null,
    ));

    // Try updating with stale baseVersion = 1
    try {
        $updateUseCase->execute(new UpdateChallengeMetadataCommand(
            ownerId: $owner->id,
            challengeId: $challengeId,
            commandId: (string) Str::uuid(),
            dataEpoch: 1,
            baseVersion: 1,
            name: 'Tên stale',
            description: null,
        ));
        $this->fail('Expected VersionConflictException was not thrown');
    } catch (VersionConflictException $e) {
        expect($e->resourceId)->toBe($challengeId)
            ->and($e->currentVersion)->toBe(2)
            ->and($e->currentSnapshot['name'])->toBe('Tên v2')
            ->and($e->currentSnapshot['row_version'])->toBe(2);
    }
});

test('mutation is rejected when write_state is not open', function () {
    $owner = createTestOwner(writeState: 'locked_for_import');
    $useCase = app(CreateChallengeUseCase::class);

    expect(fn () => $useCase->execute(new CreateChallengeCommand(
        ownerId: $owner->id,
        commandId: (string) Str::uuid(),
        dataEpoch: 1,
        name: 'Locked write',
        description: null,
        targetDays: 3,
    )))->toThrow(WriteFenceActiveException::class);
});

test('mutation is rejected when data_epoch does not match account_state', function () {
    $owner = createTestOwner(epoch: 2);
    $useCase = app(CreateChallengeUseCase::class);

    expect(fn () => $useCase->execute(new CreateChallengeCommand(
        ownerId: $owner->id,
        commandId: (string) Str::uuid(),
        dataEpoch: 1, // stale epoch
        name: 'Stale epoch write',
        description: null,
        targetDays: 3,
    )))->toThrow(StaleDataEpochException::class);
});

test('owner isolation: owner cannot query or update another owners challenge', function () {
    $owner1 = createTestOwner();
    $owner2 = User::factory()->create(['is_owner' => false]);
    DB::table('account_states')->insert([
        'owner_id' => $owner2->id,
        'timezone' => 'Asia/Ho_Chi_Minh',
        'account_revision' => 0,
        'data_epoch' => 1,
        'write_state' => 'open',
    ]);

    $createUseCase = app(CreateChallengeUseCase::class);
    $res = $createUseCase->execute(new CreateChallengeCommand(
        ownerId: $owner1->id,
        commandId: (string) Str::uuid(),
        dataEpoch: 1,
        name: 'Challenge of Owner 1',
        description: null,
        targetDays: 4,
    ));

    $challengeId = $res['challenge']['id'];

    $listQuery = app(GetChallengeListQuery::class);
    $detailQuery = app(GetChallengeDetailQuery::class);
    $updateUseCase = app(UpdateChallengeMetadataUseCase::class);

    // Owner 2 queries list -> empty
    $owner2List = $listQuery->execute($owner2->id);
    expect($owner2List)->toBeEmpty();

    // Owner 2 queries detail -> null
    $owner2Detail = $detailQuery->execute($owner2->id, $challengeId);
    expect($owner2Detail)->toBeNull();

    // Owner 2 tries to update owner 1's challenge -> null or not found
    $updateResult = $updateUseCase->execute(new UpdateChallengeMetadataCommand(
        ownerId: $owner2->id,
        challengeId: $challengeId,
        commandId: (string) Str::uuid(),
        dataEpoch: 1,
        baseVersion: 1,
        name: 'Hacked name',
        description: null,
    ));
    expect($updateResult)->toBeNull();

    // Ensure challenge was not modified
    $persisted = DB::table('challenges')->where('id', $challengeId)->first();
    expect($persisted->name)->toBe('Challenge of Owner 1');
});
