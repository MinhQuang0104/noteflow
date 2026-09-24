<?php

namespace App\Modules\Challenges\Application\UseCases;

use App\Modules\Challenges\Application\Commands\SaveJournalCommand;
use App\Modules\Challenges\Domain\Exceptions\IdempotencyKeyReusedException;
use App\Modules\Challenges\Domain\Exceptions\InvalidJournalDayException;
use App\Modules\Challenges\Domain\Exceptions\InvalidJournalTextException;
use App\Modules\Challenges\Domain\Exceptions\StaleDataEpochException;
use App\Modules\Challenges\Domain\Exceptions\VersionConflictException;
use App\Modules\Challenges\Domain\Exceptions\WriteFenceActiveException;
use App\Modules\Identity\Application\AccountTimeContextFactory;
use DateTimeImmutable;
use Illuminate\Support\Facades\DB;
use LogicException;

final readonly class SaveJournalUseCase
{
    public function __construct(private AccountTimeContextFactory $timeContextFactory) {}

    /**
     * @return array{journal: array{challenge_id: string, local_date: string, journal: string, journal_version: int}, account_revision: int, data_epoch: int}|null
     */
    public function execute(SaveJournalCommand $command): ?array
    {
        return DB::transaction(function () use ($command): ?array {
            $accountState = DB::table('account_states')
                ->where('owner_id', $command->ownerId)
                ->lockForUpdate()
                ->first();

            if ($accountState === null) {
                throw new LogicException('The owner is missing account state.');
            }
            if ($accountState->write_state !== 'open') {
                throw new WriteFenceActiveException;
            }
            if ($command->dataEpoch !== (int) $accountState->data_epoch) {
                throw new StaleDataEpochException;
            }

            $canonicalData = [
                'base_version' => $command->baseVersion,
                'challenge_id' => $command->challengeId,
                'journal' => $command->journal,
                'local_date' => $command->localDate,
            ];
            ksort($canonicalData);
            $requestHash = hash('sha256', (string) json_encode($canonicalData, JSON_THROW_ON_ERROR));

            $existingCommand = DB::table('mutation_commands')
                ->where('owner_id', $command->ownerId)
                ->where('data_epoch', $command->dataEpoch)
                ->where('command_id', $command->commandId)
                ->first();
            if ($existingCommand !== null) {
                if ($existingCommand->command_type === 'save_challenge_journal'
                    && $existingCommand->request_hash === $requestHash) {
                    /** @var array{journal: array{challenge_id: string, local_date: string, journal: string, journal_version: int}, account_revision: int, data_epoch: int} */
                    return json_decode((string) $existingCommand->response_payload, true, 512, JSON_THROW_ON_ERROR);
                }

                throw new IdempotencyKeyReusedException;
            }

            $challenge = DB::table('challenges')
                ->where('id', $command->challengeId)
                ->where('owner_id', $command->ownerId)
                ->first();
            if ($challenge === null) {
                return null;
            }

            $accountToday = $this->timeContextFactory->capture((string) $accountState->timezone)->accountDate;
            if (preg_match('/^\d{4}-\d{2}-\d{2}$/D', $command->localDate) !== 1) {
                throw new InvalidJournalDayException;
            }
            $date = DateTimeImmutable::createFromFormat('!Y-m-d', $command->localDate);
            if ($date === false || $date->format('Y-m-d') !== $command->localDate
                || $command->localDate < (string) $challenge->start_date
                || $command->localDate > $accountToday) {
                throw new InvalidJournalDayException;
            }
            if (trim($command->journal) === '') {
                throw new InvalidJournalTextException;
            }

            $record = DB::table('challenge_daily_records')
                ->where('owner_id', $command->ownerId)
                ->where('challenge_id', $command->challengeId)
                ->where('local_date', $command->localDate)
                ->first();
            $currentVersion = $record !== null ? (int) $record->journal_version : 0;
            if ($command->baseVersion !== $currentVersion) {
                throw new VersionConflictException(
                    resourceId: $command->challengeId,
                    currentVersion: $currentVersion,
                    currentSnapshot: [
                        'challenge_id' => $command->challengeId,
                        'local_date' => $command->localDate,
                        'journal' => $record?->journal,
                        'journal_version' => $currentVersion,
                    ],
                );
            }

            $isChanged = $record === null || $record->journal !== $command->journal;
            $nextVersion = $currentVersion + ($isChanged ? 1 : 0);
            $nextRevision = (int) $accountState->account_revision + ($isChanged ? 1 : 0);
            $now = now();

            if ($record === null) {
                DB::table('challenge_daily_records')->insert([
                    'owner_id' => $command->ownerId,
                    'challenge_id' => $command->challengeId,
                    'local_date' => $command->localDate,
                    'journal' => $command->journal,
                    'journal_version' => $nextVersion,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            } elseif ($isChanged) {
                DB::table('challenge_daily_records')
                    ->where('owner_id', $command->ownerId)
                    ->where('challenge_id', $command->challengeId)
                    ->where('local_date', $command->localDate)
                    ->update([
                        'journal' => $command->journal,
                        'journal_version' => $nextVersion,
                        'row_version' => (int) $record->row_version + 1,
                        'updated_at' => $now,
                    ]);
            }

            if ($isChanged) {
                DB::table('account_states')
                    ->where('owner_id', $command->ownerId)
                    ->update(['account_revision' => $nextRevision]);
            }

            $responsePayload = [
                'journal' => [
                    'challenge_id' => $command->challengeId,
                    'local_date' => $command->localDate,
                    'journal' => $command->journal,
                    'journal_version' => $nextVersion,
                ],
                'account_revision' => $nextRevision,
                'data_epoch' => (int) $accountState->data_epoch,
            ];
            DB::table('mutation_commands')->insert([
                'owner_id' => $command->ownerId,
                'data_epoch' => (int) $accountState->data_epoch,
                'command_id' => $command->commandId,
                'command_type' => 'save_challenge_journal',
                'request_hash' => $requestHash,
                'resource_id' => $command->challengeId,
                'response_payload' => json_encode($responsePayload, JSON_THROW_ON_ERROR),
                'response_status' => 200,
                'created_at' => $now,
            ]);

            return $responsePayload;
        });
    }
}
