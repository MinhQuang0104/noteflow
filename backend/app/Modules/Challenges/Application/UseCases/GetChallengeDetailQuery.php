<?php

namespace App\Modules\Challenges\Application\UseCases;

use DateTimeImmutable;
use Illuminate\Support\Facades\DB;

final readonly class GetChallengeDetailQuery
{
    /**
     * @return array{
     *     id: string,
     *     name: string,
     *     description: ?string,
     *     start_date: string,
     *     target_days: int,
     *     row_version: int,
     *     created_at: string,
     *     updated_at: string,
     * }|null
     */
    public function execute(int $ownerId, string $challengeId): ?array
    {
        $challenge = DB::table('challenges')
            ->where('id', $challengeId)
            ->where('owner_id', $ownerId)
            ->first();

        if ($challenge === null) {
            return null;
        }

        $targetPeriod = DB::table('challenge_target_periods')
            ->where('owner_id', $ownerId)
            ->where('challenge_id', $challengeId)
            ->orderBy('effective_from', 'desc')
            ->first();

        $targetDays = $targetPeriod !== null ? (int) $targetPeriod->target_days : 1;

        return [
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
}
