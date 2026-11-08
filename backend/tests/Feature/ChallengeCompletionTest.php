<?php

use App\Models\User;
use App\Modules\Challenges\Application\Commands\MarkCompletionCommand;
use App\Modules\Challenges\Application\UseCases\MarkCompletionUseCase;
use App\Modules\Challenges\Domain\Exceptions\IdempotencyKeyReusedException;
use App\Modules\Challenges\Domain\Exceptions\InvalidCompletionDayException;
use App\Modules\Challenges\Domain\Exceptions\StaleDataEpochException;
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
            // Monday 2026-09-21 in the account's UTC+7 timezone.
            return new DateTimeImmutable('2026-09-20T20:00:00+00:00');
        }
    });
});

function completionOwner(int $epoch = 1, string $writeState = 'open', bool $isOwner = true): User
{
    $owner = $isOwner ? User::factory()->owner()->create() : User::factory()->create(['is_owner' => false]);
    DB::table('account_states')->updateOrInsert(['owner_id' => $owner->id], [
        'timezone' => 'Asia/Ho_Chi_Minh',
        'account_revision' => 0,
        'data_epoch' => $epoch,
        'write_state' => $writeState,
    ]);

    return $owner;
}

function completionChallenge(User $owner, string $startDate = '2026-09-19'): string
{
    $id = (string) Str::uuid();
    DB::table('challenges')->insert([
        'id' => $id,
        'owner_id' => $owner->id,
        'name' => 'Stretch each day',
        'start_date' => $startDate,
        'row_version' => 1,
        'created_at' => now(),
        'updated_at' => now(),
    ]);
    DB::table('challenge_target_periods')->insert([
        'owner_id' => $owner->id,
        'challenge_id' => $id,
        'target_days' => 4,
        'effective_from' => $startDate,
        'created_at' => now(),
        'updated_at' => now(),
    ]);

    return $id;
}

function completionCommand(User $owner, string $challengeId, string $date = '2026-09-21', bool $isDone = true, ?string $commandId = null, int $dataEpoch = 1): MarkCompletionCommand
{
    return new MarkCompletionCommand(
        ownerId: $owner->id,
        challengeId: $challengeId,
        localDate: $date,
        commandId: $commandId ?? (string) Str::uuid(),
        dataEpoch: $dataEpoch,
        isDone: $isDone,
    );
}

function completionRevision(User $owner): int
{
    return (int) DB::table('account_states')->where('owner_id', $owner->id)->value('account_revision');
}

test('Done for account-today records one completion without a journal and returns the shared projection', function () {
    $owner = completionOwner();
    $challengeId = completionChallenge($owner);

    $result = app(MarkCompletionUseCase::class)->execute(completionCommand($owner, $challengeId));

    $row = DB::table('challenge_daily_records')->where('challenge_id', $challengeId)->sole();
    expect($row->local_date)->toBe('2026-09-21')
        ->and((bool) $row->is_done)->toBeTrue()
        ->and((int) $row->completion_version)->toBe(1)
        ->and($row->journal)->toBeNull()
        ->and((int) $row->journal_version)->toBe(0)
        ->and((int) $row->row_version)->toBe(1)
        ->and(completionRevision($owner))->toBe(1)
        ->and($result)->toBe([
            'completion' => [
                'challenge_id' => $challengeId,
                'local_date' => '2026-09-21',
                'is_done' => true,
                'completion_version' => 1,
            ],
            'week_progress' => [
                'start_date' => '2026-09-21',
                'end_date' => '2026-09-27',
                'done_days' => 1,
                'target_days' => 4,
            ],
            'account_revision' => 1,
            'data_epoch' => 1,
        ]);
});

test('Done on a journaled day changes only completion fields and keeps journal text and version', function () {
    $owner = completionOwner();
    $challengeId = completionChallenge($owner);
    DB::table('challenge_daily_records')->insert([
        'owner_id' => $owner->id,
        'challenge_id' => $challengeId,
        'local_date' => '2026-09-21',
        'is_done' => false,
        'completion_version' => 0,
        'journal' => 'Wrote first',
        'journal_version' => 3,
        'row_version' => 3,
        'created_at' => now(),
        'updated_at' => now(),
    ]);

    $result = app(MarkCompletionUseCase::class)->execute(completionCommand($owner, $challengeId));

    $row = DB::table('challenge_daily_records')->where('challenge_id', $challengeId)->sole();
    expect((bool) $row->is_done)->toBeTrue()
        ->and((int) $row->completion_version)->toBe(1)
        ->and((int) $row->row_version)->toBe(4)
        ->and($row->journal)->toBe('Wrote first')
        ->and((int) $row->journal_version)->toBe(3)
        ->and($result['completion']['completion_version'])->toBe(1)
        ->and($result['account_revision'])->toBe(1);
});

test('repeated Done with a new command converges without another completion, version or revision', function () {
    $owner = completionOwner();
    $challengeId = completionChallenge($owner);
    $useCase = app(MarkCompletionUseCase::class);

    $first = $useCase->execute(completionCommand($owner, $challengeId));
    $second = $useCase->execute(completionCommand($owner, $challengeId));

    $row = DB::table('challenge_daily_records')->where('challenge_id', $challengeId)->sole();
    expect($second)->toBe($first)
        ->and((int) $row->completion_version)->toBe(1)
        ->and((int) $row->row_version)->toBe(1)
        ->and(completionRevision($owner))->toBe(1)
        ->and($second['week_progress']['done_days'])->toBe(1)
        ->and(DB::table('mutation_commands')->where('owner_id', $owner->id)->count())->toBe(2);
});

test('Done is accepted only for a canonical account-today date', function () {
    $owner = completionOwner();
    $challengeId = completionChallenge($owner);
    $useCase = app(MarkCompletionUseCase::class);

    foreach (['2026-09-20', '2026-09-22', '2026-02-30', '2026-9-21', "2026-09-21\0", 'today'] as $date) {
        try {
            $useCase->execute(completionCommand($owner, $challengeId, $date));
            $this->fail("Expected {$date} to be rejected");
        } catch (InvalidCompletionDayException $exception) {
            expect($exception->field)->toBe('local_date');
        }
    }

    expect(DB::table('challenge_daily_records')->count())->toBe(0)
        ->and(DB::table('mutation_commands')->count())->toBe(0)
        ->and(completionRevision($owner))->toBe(0);
});

test('Done is rejected when account-today is before the challenge start date', function () {
    $owner = completionOwner();
    $challengeId = completionChallenge($owner, '2026-09-22');

    try {
        app(MarkCompletionUseCase::class)->execute(completionCommand($owner, $challengeId));
        $this->fail('Expected a day before the start date to be rejected');
    } catch (InvalidCompletionDayException $exception) {
        expect($exception->field)->toBe('local_date');
    }

    expect(DB::table('challenge_daily_records')->count())->toBe(0);
});

test('is_done false is rejected and leaves an existing completion untouched', function () {
    $owner = completionOwner();
    $challengeId = completionChallenge($owner);
    $useCase = app(MarkCompletionUseCase::class);
    $useCase->execute(completionCommand($owner, $challengeId));

    try {
        $useCase->execute(completionCommand($owner, $challengeId, isDone: false));
        $this->fail('Expected undo to be rejected');
    } catch (InvalidCompletionDayException $exception) {
        expect($exception->field)->toBe('is_done');
    }

    $row = DB::table('challenge_daily_records')->where('challenge_id', $challengeId)->sole();
    expect((bool) $row->is_done)->toBeTrue()
        ->and((int) $row->completion_version)->toBe(1)
        ->and(completionRevision($owner))->toBe(1)
        ->and(DB::table('mutation_commands')->where('owner_id', $owner->id)->count())->toBe(1);
});

test('an identical command replays its acknowledgement and a reused command ID with another payload is rejected', function () {
    $owner = completionOwner();
    $challengeId = completionChallenge($owner);
    $otherChallengeId = completionChallenge($owner);
    $useCase = app(MarkCompletionUseCase::class);
    $commandId = (string) Str::uuid();

    $first = $useCase->execute(completionCommand($owner, $challengeId, commandId: $commandId));
    // The ledger stores jsonb, so the replay keeps values but not key order.
    expect($useCase->execute(completionCommand($owner, $challengeId, commandId: $commandId)))->toEqual($first)
        ->and(DB::table('mutation_commands')->where('command_id', $commandId)->count())->toBe(1);

    expect(fn () => $useCase->execute(completionCommand($owner, $otherChallengeId, commandId: $commandId)))
        ->toThrow(IdempotencyKeyReusedException::class);
    expect(DB::table('challenge_daily_records')->where('challenge_id', $otherChallengeId)->count())->toBe(0)
        ->and(completionRevision($owner))->toBe(1);
});

test('a journal command ID cannot be replayed as a Done command', function () {
    $owner = completionOwner();
    $challengeId = completionChallenge($owner);
    $commandId = (string) Str::uuid();
    DB::table('mutation_commands')->insert([
        'owner_id' => $owner->id,
        'data_epoch' => 1,
        'command_id' => $commandId,
        'command_type' => 'save_challenge_journal',
        'request_hash' => hash('sha256', 'journal'),
        'resource_id' => $challengeId,
        'response_payload' => '{}',
        'response_status' => 200,
        'created_at' => now(),
    ]);

    expect(fn () => app(MarkCompletionUseCase::class)->execute(completionCommand($owner, $challengeId, commandId: $commandId)))
        ->toThrow(IdempotencyKeyReusedException::class);
    expect(DB::table('challenge_daily_records')->count())->toBe(0);
});

test('stale data epoch and closed write state reject Done without state changes', function () {
    $owner = completionOwner(writeState: 'locked_for_import');
    $challengeId = completionChallenge($owner);
    $useCase = app(MarkCompletionUseCase::class);

    expect(fn () => $useCase->execute(completionCommand($owner, $challengeId)))
        ->toThrow(WriteFenceActiveException::class);
    DB::table('account_states')->where('owner_id', $owner->id)->update(['write_state' => 'open', 'data_epoch' => 2]);
    expect(fn () => $useCase->execute(completionCommand($owner, $challengeId)))
        ->toThrow(StaleDataEpochException::class);

    expect(DB::table('challenge_daily_records')->count())->toBe(0)
        ->and(DB::table('mutation_commands')->count())->toBe(0)
        ->and(completionRevision($owner))->toBe(0);
});

test('an owner cannot mark Done on another owner challenge', function () {
    $owner = completionOwner();
    $other = completionOwner(isOwner: false);
    $challengeId = completionChallenge($owner);

    expect(app(MarkCompletionUseCase::class)->execute(completionCommand($other, $challengeId)))->toBeNull()
        ->and(DB::table('challenge_daily_records')->count())->toBe(0)
        ->and(DB::table('mutation_commands')->count())->toBe(0)
        ->and(completionRevision($other))->toBe(0);
});
