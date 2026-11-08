<?php

use App\Models\User;
use App\Modules\Challenges\Application\UseCases\GetCurrentWeekProgressQuery;
use App\Modules\Identity\Contracts\Clock;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

uses(RefreshDatabase::class);

function weekProgressClock(string $instant): void
{
    app()->instance(Clock::class, new class($instant) implements Clock
    {
        public function __construct(private string $instant) {}

        public function now(): DateTimeImmutable
        {
            return new DateTimeImmutable($this->instant);
        }
    });
}

function weekProgressOwner(bool $isOwner = true): User
{
    $owner = $isOwner ? User::factory()->owner()->create() : User::factory()->create(['is_owner' => false]);
    DB::table('account_states')->updateOrInsert(['owner_id' => $owner->id], [
        'timezone' => 'Asia/Ho_Chi_Minh',
        'account_revision' => 0,
        'data_epoch' => 1,
        'write_state' => 'open',
    ]);

    return $owner;
}

/** @param  array<string, int>  $targets  effective_from => target_days */
function weekProgressChallenge(User $owner, string $startDate, array $targets = []): string
{
    $id = (string) Str::uuid();
    DB::table('challenges')->insert([
        'id' => $id,
        'owner_id' => $owner->id,
        'name' => 'Walk each day',
        'start_date' => $startDate,
        'row_version' => 1,
        'created_at' => now(),
        'updated_at' => now(),
    ]);
    foreach ($targets === [] ? [$startDate => 3] : $targets as $effectiveFrom => $targetDays) {
        DB::table('challenge_target_periods')->insert([
            'owner_id' => $owner->id,
            'challenge_id' => $id,
            'target_days' => $targetDays,
            'effective_from' => $effectiveFrom,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    return $id;
}

function weekProgressRecord(User $owner, string $challengeId, string $date, bool $isDone, int $completionVersion = 1): void
{
    DB::table('challenge_daily_records')->insert([
        'owner_id' => $owner->id,
        'challenge_id' => $challengeId,
        'local_date' => $date,
        'is_done' => $isDone,
        'completion_version' => $completionVersion,
        'journal' => $isDone ? null : 'Journal only',
        'journal_version' => $isDone ? 0 : 1,
        'created_at' => now(),
        'updated_at' => now(),
    ]);
}

test('week progress counts Done days of the current Monday to Sunday week only', function () {
    // Thursday 2026-09-24 in UTC+7; the week runs 2026-09-21 through 2026-09-27.
    weekProgressClock('2026-09-23T20:00:00+00:00');
    $owner = weekProgressOwner();
    $challengeId = weekProgressChallenge($owner, '2026-09-01');
    weekProgressRecord($owner, $challengeId, '2026-09-20', true);
    weekProgressRecord($owner, $challengeId, '2026-09-21', true);
    weekProgressRecord($owner, $challengeId, '2026-09-22', false, 0);
    weekProgressRecord($owner, $challengeId, '2026-09-23', true);
    weekProgressRecord($owner, $challengeId, '2026-09-24', true, 2);

    $progress = app(GetCurrentWeekProgressQuery::class)->execute($owner->id, [$challengeId]);

    expect($progress)->toBe([
        $challengeId => [
            'week_progress' => [
                'start_date' => '2026-09-21',
                'end_date' => '2026-09-27',
                'done_days' => 3,
                'target_days' => 3,
            ],
            'today' => [
                'local_date' => '2026-09-24',
                'is_done' => true,
                'completion_version' => 2,
            ],
        ],
    ]);
});

test('week boundaries follow the account timezone around Sunday midnight', function () {
    $owner = weekProgressOwner();
    $challengeId = weekProgressChallenge($owner, '2026-09-14');
    foreach (['2026-09-14', '2026-09-20'] as $date) {
        weekProgressRecord($owner, $challengeId, $date, true);
    }

    // Sunday 2026-09-20 23:59 in UTC+7, although UTC is still mid-afternoon.
    weekProgressClock('2026-09-20T16:59:59+00:00');
    $sunday = app(GetCurrentWeekProgressQuery::class)->execute($owner->id, [$challengeId])[$challengeId];

    // Monday 2026-09-21 00:00 in UTC+7, although UTC is still Sunday.
    weekProgressClock('2026-09-20T17:00:00+00:00');
    $monday = app(GetCurrentWeekProgressQuery::class)->execute($owner->id, [$challengeId])[$challengeId];

    expect($sunday['week_progress'])->toMatchArray(['start_date' => '2026-09-14', 'end_date' => '2026-09-20', 'done_days' => 2])
        ->and($sunday['today'])->toBe(['local_date' => '2026-09-20', 'is_done' => true, 'completion_version' => 1])
        ->and($monday['week_progress'])->toMatchArray(['start_date' => '2026-09-21', 'end_date' => '2026-09-27', 'done_days' => 0])
        ->and($monday['today'])->toBe(['local_date' => '2026-09-21', 'is_done' => false, 'completion_version' => 0]);
});

test('week progress ignores days before the challenge start date inside the week', function () {
    weekProgressClock('2026-09-23T20:00:00+00:00');
    $owner = weekProgressOwner();
    $challengeId = weekProgressChallenge($owner, '2026-09-23');
    weekProgressRecord($owner, $challengeId, '2026-09-22', true);
    weekProgressRecord($owner, $challengeId, '2026-09-23', true);

    $progress = app(GetCurrentWeekProgressQuery::class)->execute($owner->id, [$challengeId])[$challengeId];

    expect($progress['week_progress']['done_days'])->toBe(1)
        ->and($progress['today'])->toBe(['local_date' => '2026-09-24', 'is_done' => false, 'completion_version' => 0]);
});

test('week progress reports the target period in effect on account-today', function () {
    weekProgressClock('2026-09-23T20:00:00+00:00');
    $owner = weekProgressOwner();
    $current = weekProgressChallenge($owner, '2026-09-01', ['2026-09-01' => 2, '2026-09-21' => 4, '2026-09-28' => 6]);
    $future = weekProgressChallenge($owner, '2026-09-01', ['2026-09-01' => 5, '2026-09-25' => 1]);

    $progress = app(GetCurrentWeekProgressQuery::class)->execute($owner->id, [$current, $future]);

    expect($progress[$current]['week_progress']['target_days'])->toBe(4)
        ->and($progress[$future]['week_progress']['target_days'])->toBe(5);
});

test('week progress is owner scoped and omits challenges of another owner', function () {
    weekProgressClock('2026-09-23T20:00:00+00:00');
    $owner = weekProgressOwner();
    $other = weekProgressOwner(false);
    $own = weekProgressChallenge($owner, '2026-09-01');
    $foreign = weekProgressChallenge($other, '2026-09-01');
    weekProgressRecord($other, $foreign, '2026-09-23', true);

    $query = app(GetCurrentWeekProgressQuery::class);

    expect(array_keys($query->execute($owner->id, [$own, $foreign])))->toBe([$own])
        ->and($query->execute($owner->id, [$foreign]))->toBe([])
        ->and($query->execute($owner->id, []))->toBe([]);
});
