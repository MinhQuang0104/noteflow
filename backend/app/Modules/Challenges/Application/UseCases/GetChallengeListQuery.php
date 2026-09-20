<?php

namespace App\Modules\Challenges\Application\UseCases;

use DateTimeImmutable;
use Illuminate\Support\Facades\DB;

final readonly class GetChallengeListQuery
{
    /**
     * @return array<int, array{
     *     id: string,
     *     name: string,
     *     description: ?string,
     *     start_date: string,
     *     target_days: int,
     *     row_version: int,
     *     created_at: string,
     *     updated_at: string,
     * }>
     */
    public function execute(int $ownerId): array
    {
        $challenges = DB::table('challenges')
            ->where('owner_id', $ownerId)
            ->orderBy('created_at', 'asc')
            ->get();

        if ($challenges->isEmpty()) {
            return [];
        }

        $challengeIds = $challenges->pluck('id')->all();

        // Get latest effective target period for each challenge, scoped by owner
        $targetPeriods = DB::table('challenge_target_periods')
            ->where('owner_id', $ownerId)
            ->whereIn('challenge_id', $challengeIds)
            ->orderBy('effective_from', 'desc')
            ->get()
            ->groupBy('challenge_id');

        $result = [];
        foreach ($challenges as $challenge) {
            $periods = $targetPeriods->get((string) $challenge->id);
            $targetDays = ($periods !== null && $periods->isNotEmpty())
                ? (int) $periods->first()->target_days
                : 1;

            $result[] = [
                'id' => (string) $challenge->id,
                'name' => (string) $challenge->name,
                'description' => $challenge->description !== null ? (string) $challenge->description : null,
                'start_date' => (string) $challenge->start_date,
                'target_days' => $targetDays,
                'row_version' => (int) $challenge->row_version,
                'created_at' => (new DateTimeImmutable((string) $challenge->created_at))->format('c'),
                'updated_at' => (new DateTimeImmutable((string) $challenge->updated_at))->format('c'),
            ];
        }

        return $result;
    }
}
