<?php

use App\Models\User;
use App\Modules\Challenges\Application\Commands\MarkCompletionCommand;
use App\Modules\Challenges\Application\UseCases\MarkCompletionUseCase;
use App\Modules\Identity\Contracts\Clock;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

beforeEach(function () {
    config(['database.connections.pgsql_second' => config('database.connections.pgsql')]);
    TestCase::assertSafeTestDatabase('pgsql_second');

    $this->app->instance(Clock::class, new class implements Clock
    {
        public function now(): DateTimeImmutable
        {
            return new DateTimeImmutable('2026-09-20T20:00:00+00:00');
        }
    });

    DB::setDefaultConnection('pgsql');
    DB::table('mutation_commands')->delete();
    DB::table('challenge_daily_records')->delete();
    DB::table('challenge_target_periods')->delete();
    DB::table('challenges')->delete();
    DB::table('account_states')->delete();
    DB::table('users')->delete();
});

afterEach(function () {
    TestCase::assertSafeTestDatabase('pgsql_second');

    try {
        DB::connection('pgsql')->rollBack();
    } catch (Throwable) {
    }
    try {
        DB::connection('pgsql_second')->rollBack();
    } catch (Throwable) {
    }

    DB::setDefaultConnection('pgsql');
    DB::disconnect('pgsql_second');

    DB::table('mutation_commands')->delete();
    DB::table('challenge_daily_records')->delete();
    DB::table('challenge_target_periods')->delete();
    DB::table('challenges')->delete();
    DB::table('account_states')->delete();
    DB::table('users')->delete();
});

function completionConcurrencyOwner(): User
{
    $owner = User::create([
        'id' => (string) Str::uuid(),
        'email' => 'completion-concurrency-'.Str::uuid().'@example.com',
        'name' => 'Completion Owner',
        'is_owner' => true,
        'password' => bcrypt('secret'),
    ]);

    DB::table('account_states')->insert([
        'owner_id' => $owner->id,
        'timezone' => 'Asia/Ho_Chi_Minh',
        'account_revision' => 0,
        'data_epoch' => 1,
        'write_state' => 'open',
    ]);

    return $owner;
}

function completionConcurrencyChallenge(User $owner): string
{
    $id = (string) Str::uuid();
    DB::table('challenges')->insert([
        'id' => $id,
        'owner_id' => $owner->id,
        'name' => 'Concurrent Done challenge',
        'start_date' => '2026-09-19',
        'row_version' => 1,
        'created_at' => now(),
        'updated_at' => now(),
    ]);
    DB::table('challenge_target_periods')->insert([
        'owner_id' => $owner->id,
        'challenge_id' => $id,
        'target_days' => 3,
        'effective_from' => '2026-09-19',
        'created_at' => now(),
        'updated_at' => now(),
    ]);

    return $id;
}

function completionConcurrencyCommand(User $owner, string $challengeId): MarkCompletionCommand
{
    return new MarkCompletionCommand(
        ownerId: $owner->id,
        challengeId: $challengeId,
        localDate: '2026-09-21',
        commandId: (string) Str::uuid(),
        dataEpoch: 1,
        isDone: true,
    );
}

test('two PostgreSQL Done writers for the same day leave one completion, one version step and one revision step', function () {
    $owner = completionConcurrencyOwner();
    $challengeId = completionConcurrencyChallenge($owner);
    $conn1 = DB::connection('pgsql');
    $conn2 = DB::connection('pgsql_second');
    $secondDevice = completionConcurrencyCommand($owner, $challengeId);

    $conn1->beginTransaction();
    DB::setDefaultConnection('pgsql');
    $first = app(MarkCompletionUseCase::class)->execute(completionConcurrencyCommand($owner, $challengeId));

    $conn2->statement("SET lock_timeout = '200ms'");
    DB::setDefaultConnection('pgsql_second');
    try {
        app(MarkCompletionUseCase::class)->execute($secondDevice);
        $this->fail('Expected the second writer to wait on the account-row lock');
    } catch (QueryException $exception) {
        expect($exception->getCode())->toBe('55P03')
            ->and($exception->getMessage())->toContain('lock timeout');
    }

    $conn1->commit();

    $second = app(MarkCompletionUseCase::class)->execute($secondDevice);

    $rows = $conn2->table('challenge_daily_records')->where('challenge_id', $challengeId)->get();
    expect($first['completion']['completion_version'])->toBe(1)
        ->and($second)->toBe($first)
        ->and($rows)->toHaveCount(1)
        ->and((bool) $rows[0]->is_done)->toBeTrue()
        ->and((int) $rows[0]->completion_version)->toBe(1)
        ->and((int) $rows[0]->row_version)->toBe(1)
        ->and((int) $conn2->table('account_states')->where('owner_id', $owner->id)->value('account_revision'))->toBe(1)
        ->and($conn2->table('mutation_commands')->where('owner_id', $owner->id)->count())->toBe(2);
});
