<?php

namespace App\Modules\Challenges\Application\UseCases;

use App\Modules\Challenges\Domain\Exceptions\InvalidJournalDayException;
use App\Modules\Identity\Application\AccountTimeContextFactory;
use DateTimeImmutable;
use Illuminate\Support\Facades\DB;

final readonly class GetJournalQuery
{
    public function __construct(private AccountTimeContextFactory $timeContextFactory) {}

    /** @return array{challenge_id: string, local_date: string, journal: ?string, journal_version: int}|null */
    public function execute(int $ownerId, string $challengeId, string $localDate): ?array
    {
        $challenge = DB::table('challenges')
            ->where('owner_id', $ownerId)
            ->where('id', $challengeId)
            ->first();
        if ($challenge === null) {
            return null;
        }

        $timezone = DB::table('account_states')->where('owner_id', $ownerId)->value('timezone');
        $accountToday = $this->timeContextFactory->capture((string) $timezone)->accountDate;
        $date = DateTimeImmutable::createFromFormat('!Y-m-d', $localDate);
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/D', $localDate) !== 1
            || $date === false || $date->format('Y-m-d') !== $localDate
            || $localDate < (string) $challenge->start_date || $localDate > $accountToday) {
            throw new InvalidJournalDayException;
        }

        $record = DB::table('challenge_daily_records')
            ->where('owner_id', $ownerId)
            ->where('challenge_id', $challengeId)
            ->where('local_date', $localDate)
            ->first();

        return [
            'challenge_id' => $challengeId,
            'local_date' => $localDate,
            'journal' => $record?->journal,
            'journal_version' => $record !== null ? (int) $record->journal_version : 0,
        ];
    }
}
