<?php

use App\Models\User;
use App\Modules\Challenges\Application\Commands\SaveJournalCommand;
use App\Modules\Challenges\Application\UseCases\SaveJournalUseCase;
use App\Modules\Challenges\Domain\Exceptions\IdempotencyKeyReusedException;
use App\Modules\Challenges\Domain\Exceptions\InvalidJournalDayException;
use App\Modules\Challenges\Domain\Exceptions\InvalidJournalTextException;
use App\Modules\Challenges\Domain\Exceptions\StaleDataEpochException;
use App\Modules\Challenges\Domain\Exceptions\VersionConflictException;
use App\Modules\Challenges\Domain\Exceptions\WriteFenceActiveException;
use App\Modules\Identity\Contracts\Clock;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->app->instance(Clock::class, new class implements Clock
    {
        public function now(): DateTimeImmutable
        {
            // 2026-09-21 in the account's UTC+7 timezone.
            return new DateTimeImmutable('2026-09-20T20:00:00+00:00');
        }
    });
});

function journalOwner(string $timezone = 'Asia/Ho_Chi_Minh', int $epoch = 1, string $writeState = 'open'): User
{
    $owner = User::factory()->owner()->create();
    DB::table('account_states')->updateOrInsert(['owner_id' => $owner->id], [
        'timezone' => $timezone,
        'account_revision' => 0,
        'data_epoch' => $epoch,
        'write_state' => $writeState,
    ]);

    return $owner;
}

function journalChallenge(User $owner, string $startDate = '2026-09-19'): string
{
    $id = (string) Str::uuid();
    DB::table('challenges')->insert([
        'id' => $id,
        'owner_id' => $owner->id,
        'name' => 'Read each day',
        'start_date' => $startDate,
        'row_version' => 1,
        'created_at' => now(),
        'updated_at' => now(),
    ]);

    return $id;
}

function journalCommand(User $owner, string $challengeId, string $date, string $text, int $baseVersion = 0, ?string $commandId = null): SaveJournalCommand
{
    return new SaveJournalCommand(
        ownerId: $owner->id,
        challengeId: $challengeId,
        localDate: $date,
        commandId: $commandId ?? (string) Str::uuid(),
        dataEpoch: 1,
        baseVersion: $baseVersion,
        journal: $text,
    );
}

test('journal save creates one day record without marking Done or changing challenge progress facts', function () {
    $owner = journalOwner();
    $challengeId = journalChallenge($owner);

    $result = app(SaveJournalUseCase::class)->execute(journalCommand($owner, $challengeId, '2026-09-20', 'A useful day'));

    $row = DB::table('challenge_daily_records')->where('challenge_id', $challengeId)->where('local_date', '2026-09-20')->first();
    expect($row)->not->toBeNull()
        ->and($row->owner_id)->toBe($owner->id)
        ->and($row->journal)->toBe('A useful day')
        ->and((bool) $row->is_done)->toBeFalse()
        ->and((int) $row->completion_version)->toBe(0)
        ->and((int) $row->journal_version)->toBe(1)
        ->and($result['journal']['local_date'])->toBe('2026-09-20')
        ->and($result['account_revision'])->toBe(1)
        ->and((int) DB::table('challenges')->where('id', $challengeId)->value('row_version'))->toBe(1)
        ->and(DB::table('challenge_daily_records')->where('challenge_id', $challengeId)->where('is_done', true)->count())->toBe(0);
});

test('journal edit advances only journal and row versions while preserving completion state', function () {
    $owner = journalOwner();
    $challengeId = journalChallenge($owner);
    DB::table('challenge_daily_records')->insert([
        'owner_id' => $owner->id,
        'challenge_id' => $challengeId,
        'local_date' => '2026-09-19',
        'is_done' => true,
        'completion_version' => 4,
        'journal' => 'Before',
        'journal_version' => 2,
        'row_version' => 6,
        'created_at' => now(),
        'updated_at' => now(),
    ]);

    $result = app(SaveJournalUseCase::class)->execute(journalCommand($owner, $challengeId, '2026-09-19', 'After', 2));
    $row = DB::table('challenge_daily_records')->where('challenge_id', $challengeId)->first();
    expect($row->journal)->toBe('After')
        ->and((int) $row->journal_version)->toBe(3)
        ->and((int) $row->row_version)->toBe(7)
        ->and((bool) $row->is_done)->toBeTrue()
        ->and((int) $row->completion_version)->toBe(4)
        ->and($result['account_revision'])->toBe(1);
});

test('completion-only changes do not create a false journal conflict', function () {
    $owner = journalOwner();
    $challengeId = journalChallenge($owner);
    $useCase = app(SaveJournalUseCase::class);
    $useCase->execute(journalCommand($owner, $challengeId, '2026-09-19', 'First'));
    DB::table('challenge_daily_records')->where('challenge_id', $challengeId)->update([
        'is_done' => true,
        'completion_version' => 1,
        'row_version' => 2,
    ]);

    $result = $useCase->execute(journalCommand($owner, $challengeId, '2026-09-19', 'Edited', 1));
    $row = DB::table('challenge_daily_records')->where('challenge_id', $challengeId)->first();
    expect($result['journal']['journal_version'])->toBe(2)
        ->and($row->journal)->toBe('Edited')
        ->and((bool) $row->is_done)->toBeTrue()
        ->and((int) $row->completion_version)->toBe(1)
        ->and((int) $row->row_version)->toBe(3);
});

test('journal day must be canonical and within start date through account-today', function () {
    $owner = journalOwner();
    $challengeId = journalChallenge($owner, '2026-09-20');
    $useCase = app(SaveJournalUseCase::class);

    foreach (['2026-09-19', '2026-09-22', '2026-02-30', '2026-9-20', "2026-09-20\0"] as $date) {
        expect(fn () => $useCase->execute(journalCommand($owner, $challengeId, $date, 'Rejected')))
            ->toThrow(InvalidJournalDayException::class);
    }

    $result = $useCase->execute(journalCommand($owner, $challengeId, '2026-09-21', 'Account today'));
    expect($result['journal']['local_date'])->toBe('2026-09-21')
        ->and(DB::table('challenge_daily_records')->where('challenge_id', $challengeId)->count())->toBe(1);
});

test('owner cannot write another owner challenge or create a daily record for it', function () {
    $owner = journalOwner();
    $other = User::factory()->create(['is_owner' => false]);
    DB::table('account_states')->insert([
        'owner_id' => $other->id,
        'timezone' => 'Asia/Ho_Chi_Minh',
        'account_revision' => 0,
        'data_epoch' => 1,
        'write_state' => 'open',
    ]);
    $challengeId = journalChallenge($owner);

    $result = app(SaveJournalUseCase::class)->execute(journalCommand($other, $challengeId, '2026-09-20', 'Forbidden'));
    expect($result)->toBeNull()
        ->and(DB::table('challenge_daily_records')->count())->toBe(0)
        ->and((int) DB::table('account_states')->where('owner_id', $other->id)->value('account_revision'))->toBe(0);
});

test('stale journal version returns saved text and leaves saved state unchanged', function () {
    $owner = journalOwner();
    $challengeId = journalChallenge($owner);
    $useCase = app(SaveJournalUseCase::class);
    $useCase->execute(journalCommand($owner, $challengeId, '2026-09-20', 'Saved first'));
    DB::table('challenge_daily_records')->where('challenge_id', $challengeId)->update([
        'is_done' => true,
        'completion_version' => 7,
        'row_version' => 2,
    ]);

    try {
        $useCase->execute(journalCommand($owner, $challengeId, '2026-09-20', 'Stale draft'));
        $this->fail('Expected a journal version conflict');
    } catch (VersionConflictException $exception) {
        expect($exception->resourceId)->toBe($challengeId)
            ->and($exception->currentVersion)->toBe(1)
            ->and($exception->currentSnapshot['challenge_id'])->toBe($challengeId)
            ->and($exception->currentSnapshot['journal'])->toBe('Saved first')
            ->and($exception->currentSnapshot['local_date'])->toBe('2026-09-20')
            ->and($exception->currentSnapshot['journal_version'])->toBe(1);
    }

    $row = DB::table('challenge_daily_records')->where('challenge_id', $challengeId)->sole();
    expect($row->journal)->toBe('Saved first')
        ->and((bool) $row->is_done)->toBeTrue()
        ->and((int) $row->completion_version)->toBe(7)
        ->and((int) $row->row_version)->toBe(2)
        ->and((int) DB::table('account_states')->where('owner_id', $owner->id)->value('account_revision'))->toBe(1)
        ->and(DB::table('mutation_commands')->where('owner_id', $owner->id)->count())->toBe(1);
});

test('journal conflict reports a newer server snapshot when it changes before resolution', function () {
    $owner = journalOwner();
    $challengeId = journalChallenge($owner);
    $useCase = app(SaveJournalUseCase::class);

    $useCase->execute(journalCommand($owner, $challengeId, '2026-09-20', 'First server version'));
    $useCase->execute(journalCommand($owner, $challengeId, '2026-09-20', 'Second server version', 1));

    try {
        $useCase->execute(journalCommand($owner, $challengeId, '2026-09-20', 'Resolution from stale snapshot', 1));
        $this->fail('Expected a conflict against the newer server version');
    } catch (VersionConflictException $exception) {
        expect($exception->resourceId)->toBe($challengeId)
            ->and($exception->currentVersion)->toBe(2)
            ->and($exception->currentSnapshot)->toMatchArray([
                'challenge_id' => $challengeId,
                'local_date' => '2026-09-20',
                'journal' => 'Second server version',
                'journal_version' => 2,
            ]);
    }

    expect(DB::table('challenge_daily_records')->where('challenge_id', $challengeId)->value('journal'))->toBe('Second server version')
        ->and((int) DB::table('account_states')->where('owner_id', $owner->id)->value('account_revision'))->toBe(2)
        ->and(DB::table('mutation_commands')->where('owner_id', $owner->id)->count())->toBe(2);
});

test('same journal command replays its acknowledgement and a different payload rejects key reuse', function () {
    $owner = journalOwner();
    $challengeId = journalChallenge($owner);
    $useCase = app(SaveJournalUseCase::class);
    $commandId = (string) Str::uuid();
    $command = journalCommand($owner, $challengeId, '2026-09-20', 'Original', 0, $commandId);

    $first = $useCase->execute($command);
    expect($useCase->execute($command))->toEqual($first)
        ->and((int) DB::table('account_states')->where('owner_id', $owner->id)->value('account_revision'))->toBe(1)
        ->and(DB::table('mutation_commands')->where('command_id', $commandId)->count())->toBe(1);

    expect(fn () => $useCase->execute(journalCommand($owner, $challengeId, '2026-09-20', 'Different', 0, $commandId)))
        ->toThrow(IdempotencyKeyReusedException::class);
    expect(DB::table('challenge_daily_records')->where('challenge_id', $challengeId)->value('journal'))->toBe('Original');
});

test('same-value journal save with current version is a no-op for versions and account revision', function () {
    $owner = journalOwner();
    $challengeId = journalChallenge($owner);
    $useCase = app(SaveJournalUseCase::class);
    $useCase->execute(journalCommand($owner, $challengeId, '2026-09-20', 'Same'));
    $result = $useCase->execute(journalCommand($owner, $challengeId, '2026-09-20', 'Same', 1));

    expect($result['journal']['journal_version'])->toBe(1)
        ->and($result['account_revision'])->toBe(1)
        ->and((int) DB::table('challenge_daily_records')->where('challenge_id', $challengeId)->value('row_version'))->toBe(1);
});

test('blank journal draft rejects without changing saved journal', function () {
    $owner = journalOwner();
    $challengeId = journalChallenge($owner);
    $useCase = app(SaveJournalUseCase::class);
    $useCase->execute(journalCommand($owner, $challengeId, '2026-09-20', 'Keep this'));

    expect(fn () => $useCase->execute(journalCommand($owner, $challengeId, '2026-09-20', " \n ", 1)))
        ->toThrow(InvalidJournalTextException::class);
    expect(DB::table('challenge_daily_records')->where('challenge_id', $challengeId)->value('journal'))->toBe('Keep this');
});

test('locked write state and stale epoch reject journal writes without state changes', function () {
    $owner = journalOwner(writeState: 'locked_for_import');
    $challengeId = journalChallenge($owner);
    $useCase = app(SaveJournalUseCase::class);

    expect(fn () => $useCase->execute(journalCommand($owner, $challengeId, '2026-09-20', 'Blocked')))
        ->toThrow(WriteFenceActiveException::class);
    DB::table('account_states')->where('owner_id', $owner->id)->update(['write_state' => 'open', 'data_epoch' => 2]);
    expect(fn () => $useCase->execute(journalCommand($owner, $challengeId, '2026-09-20', 'Stale epoch')))
        ->toThrow(StaleDataEpochException::class);
    expect(DB::table('challenge_daily_records')->count())->toBe(0);
});
