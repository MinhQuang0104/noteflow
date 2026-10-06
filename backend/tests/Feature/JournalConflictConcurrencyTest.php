<?php

use App\Models\User;
use App\Modules\Challenges\Application\Commands\SaveJournalCommand;
use App\Modules\Challenges\Application\UseCases\SaveJournalUseCase;
use App\Modules\Challenges\Domain\Exceptions\VersionConflictException;
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
    DB::table('challenges')->delete();
    DB::table('account_states')->delete();
    DB::table('users')->delete();
});

function journalConcurrencyOwner(): User
{
    $owner = User::create([
        'id' => (string) Str::uuid(),
        'email' => 'journal-concurrency-'.Str::uuid().'@example.com',
        'name' => 'Journal Owner',
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

function journalConcurrencyChallenge(User $owner): string
{
    $id = (string) Str::uuid();
    DB::table('challenges')->insert([
        'id' => $id,
        'owner_id' => $owner->id,
        'name' => 'Concurrent journal challenge',
        'start_date' => '2026-09-19',
        'row_version' => 1,
        'created_at' => now(),
        'updated_at' => now(),
    ]);

    return $id;
}

function journalConcurrencyCommand(User $owner, string $challengeId, string $text, int $baseVersion = 0): SaveJournalCommand
{
    return new SaveJournalCommand(
        ownerId: $owner->id,
        challengeId: $challengeId,
        localDate: '2026-09-20',
        commandId: (string) Str::uuid(),
        dataEpoch: 1,
        baseVersion: $baseVersion,
        journal: $text,
    );
}

test('two PostgreSQL journal writers sharing one base cannot both commit different content', function () {
    $owner = journalConcurrencyOwner();
    $challengeId = journalConcurrencyChallenge($owner);
    $conn1 = DB::connection('pgsql');
    $conn2 = DB::connection('pgsql_second');

    $conn1->beginTransaction();
    DB::setDefaultConnection('pgsql');
    app(SaveJournalUseCase::class)->execute(journalConcurrencyCommand($owner, $challengeId, 'Device A'));

    $conn2->statement("SET lock_timeout = '200ms'");
    DB::setDefaultConnection('pgsql_second');
    try {
        app(SaveJournalUseCase::class)->execute(journalConcurrencyCommand($owner, $challengeId, 'Device B'));
        $this->fail('Expected the second writer to wait on the account-row lock');
    } catch (QueryException $exception) {
        expect($exception->getCode())->toBe('55P03')
            ->and($exception->getMessage())->toContain('lock timeout');
    }

    $conn1->commit();

    try {
        app(SaveJournalUseCase::class)->execute(journalConcurrencyCommand($owner, $challengeId, 'Device B'));
        $this->fail('Expected the second writer to observe the committed journal version');
    } catch (VersionConflictException $exception) {
        expect($exception->resourceId)->toBe($challengeId)
            ->and($exception->currentVersion)->toBe(1)
            ->and($exception->currentSnapshot['journal'])->toBe('Device A');
    }

    expect(DB::connection('pgsql_second')->table('challenge_daily_records')->where('challenge_id', $challengeId)->value('journal'))->toBe('Device A')
        ->and((int) DB::connection('pgsql_second')->table('account_states')->where('owner_id', $owner->id)->value('account_revision'))->toBe(1)
        ->and(DB::connection('pgsql_second')->table('mutation_commands')->where('owner_id', $owner->id)->count())->toBe(1);
});
