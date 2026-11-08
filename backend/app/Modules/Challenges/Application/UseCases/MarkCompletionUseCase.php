<?php

namespace App\Modules\Challenges\Application\UseCases;

use App\Modules\Challenges\Application\Commands\MarkCompletionCommand;
use App\Modules\Challenges\Domain\Exceptions\IdempotencyKeyReusedException;
use App\Modules\Challenges\Domain\Exceptions\InvalidCompletionDayException;
use App\Modules\Challenges\Domain\Exceptions\StaleDataEpochException;
use App\Modules\Challenges\Domain\Exceptions\WriteFenceActiveException;
use App\Modules\Identity\Application\AccountTimeContextFactory;
use Illuminate\Support\Facades\DB;
use LogicException;

final readonly class MarkCompletionUseCase
{
    public function __construct(
        private AccountTimeContextFactory $timeContextFactory,
        private GetCurrentWeekProgressQuery $weekProgressQuery,
    ) {}

    /**
     * Done is accepted for account-today only; marking an already Done day converges
     * without a new completion, version step or account revision.
     *
     * @return array{
     *     completion: array{challenge_id: string, local_date: string, is_done: bool, completion_version: int},
     *     week_progress: array{start_date: string, end_date: string, done_days: int, target_days: int},
     *     account_revision: int,
     *     data_epoch: int,
     * }|null
     */
    public function execute(MarkCompletionCommand $command): ?array
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
                'challenge_id' => $command->challengeId,
                'is_done' => $command->isDone,
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
                if ($existingCommand->command_type === 'mark_challenge_completion'
                    && $existingCommand->request_hash === $requestHash) {
                    /** @var array{completion: array{challenge_id: string, local_date: string, is_done: bool, completion_version: int}, week_progress: array{start_date: string, end_date: string, done_days: int, target_days: int}, account_revision: int, data_epoch: int} */
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

            $timeContext = $this->timeContextFactory->capture((string) $accountState->timezone);
            if ($command->localDate !== $timeContext->accountDate
                || $timeContext->accountDate < (string) $challenge->start_date) {
                throw new InvalidCompletionDayException('local_date');
            }
            if (! $command->isDone) {
                throw new InvalidCompletionDayException('is_done');
            }

            $record = DB::table('challenge_daily_records')
                ->where('owner_id', $command->ownerId)
                ->where('challenge_id', $command->challengeId)
                ->where('local_date', $command->localDate)
                ->first();
            $currentVersion = $record !== null ? (int) $record->completion_version : 0;
            $isChanged = $record === null || ! (bool) $record->is_done;
            $nextVersion = $currentVersion + ($isChanged ? 1 : 0);
            $nextRevision = (int) $accountState->account_revision + ($isChanged ? 1 : 0);
            $now = now();

            // Only completion fields are written; journal text and journal_version stay as they are.
            if ($record === null) {
                DB::table('challenge_daily_records')->insert([
                    'owner_id' => $command->ownerId,
                    'challenge_id' => $command->challengeId,
                    'local_date' => $command->localDate,
                    'is_done' => true,
                    'completion_version' => $nextVersion,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            } elseif ($isChanged) {
                DB::table('challenge_daily_records')
                    ->where('owner_id', $command->ownerId)
                    ->where('challenge_id', $command->challengeId)
                    ->where('local_date', $command->localDate)
                    ->update([
                        'is_done' => true,
                        'completion_version' => $nextVersion,
                        'row_version' => (int) $record->row_version + 1,
                        'updated_at' => $now,
                    ]);
            }

            if ($isChanged) {
                DB::table('account_states')
                    ->where('owner_id', $command->ownerId)
                    ->update(['account_revision' => $nextRevision]);
            }

            $projection = $this->weekProgressQuery->execute($command->ownerId, [$command->challengeId], $timeContext);
            $responsePayload = [
                'completion' => [
                    'challenge_id' => $command->challengeId,
                    'local_date' => $command->localDate,
                    'is_done' => true,
                    'completion_version' => $nextVersion,
                ],
                'week_progress' => $projection[$command->challengeId]['week_progress'],
                'account_revision' => $nextRevision,
                'data_epoch' => (int) $accountState->data_epoch,
            ];
            DB::table('mutation_commands')->insert([
                'owner_id' => $command->ownerId,
                'data_epoch' => (int) $accountState->data_epoch,
                'command_id' => $command->commandId,
                'command_type' => 'mark_challenge_completion',
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
