<?php

namespace App\Modules\Challenges\Application\UseCases;

use App\Modules\Identity\Application\AccountTimeContextFactory;
use App\Modules\Identity\Domain\AccountTimeContext;
use Illuminate\Support\Facades\DB;

/**
 * The single source of current-week progress: clients render these fields and
 * never derive counts themselves.
 */
final readonly class GetCurrentWeekProgressQuery
{
    public function __construct(private AccountTimeContextFactory $timeContextFactory) {}

    /**
     * Challenges the owner does not own are omitted. Pass the context captured by a
     * write so the projection uses the same account day as that write.
     *
     * @param  list<string>  $challengeIds
     * @return array<string, array{
     *     week_progress: array{start_date: string, end_date: string, done_days: int, target_days: int},
     *     today: array{local_date: string, is_done: bool, completion_version: int},
     * }>
     */
    public function execute(int $ownerId, array $challengeIds, ?AccountTimeContext $context = null): array
    {
        if ($challengeIds === []) {
            return [];
        }

        $challenges = DB::table('challenges')
            ->where('owner_id', $ownerId)
            ->whereIn('id', $challengeIds)
            ->pluck('start_date', 'id');
        if ($challenges->isEmpty()) {
            return [];
        }

        if ($context === null) {
            $timezone = DB::table('account_states')->where('owner_id', $ownerId)->value('timezone');
            $context = $this->timeContextFactory->capture((string) $timezone);
        }
        $ownedIds = $challenges->keys()->map(fn ($id): string => (string) $id)->all();
        $lastCountedDay = min($context->weekEnd, $context->accountDate);

        $weekRecords = DB::table('challenge_daily_records')
            ->where('owner_id', $ownerId)
            ->whereIn('challenge_id', $ownedIds)
            ->whereBetween('local_date', [$context->weekStart, $lastCountedDay])
            ->get(['challenge_id', 'local_date', 'is_done', 'completion_version'])
            ->groupBy('challenge_id');

        // Ascending order: the last period that started by account-today is in effect.
        $targetPeriods = DB::table('challenge_target_periods')
            ->where('owner_id', $ownerId)
            ->whereIn('challenge_id', $ownedIds)
            ->orderBy('effective_from')
            ->get(['challenge_id', 'effective_from', 'target_days'])
            ->groupBy('challenge_id');

        $result = [];
        foreach ($challenges as $id => $startDate) {
            $records = $weekRecords->get((string) $id, collect());
            $doneDays = $records
                ->filter(fn ($record): bool => (bool) $record->is_done && (string) $record->local_date >= (string) $startDate)
                ->count();
            $today = $records->first(fn ($record): bool => (string) $record->local_date === $context->accountDate);

            $periods = $targetPeriods->get((string) $id, collect());
            $inEffect = $periods->last(fn ($period): bool => (string) $period->effective_from <= $context->accountDate)
                ?? $periods->first();

            $result[(string) $id] = [
                'week_progress' => [
                    'start_date' => $context->weekStart,
                    'end_date' => $context->weekEnd,
                    'done_days' => $doneDays,
                    'target_days' => $inEffect !== null ? (int) $inEffect->target_days : 1,
                ],
                'today' => [
                    'local_date' => $context->accountDate,
                    'is_done' => $today !== null && (bool) $today->is_done,
                    'completion_version' => $today !== null ? (int) $today->completion_version : 0,
                ],
            ];
        }

        return $result;
    }
}
