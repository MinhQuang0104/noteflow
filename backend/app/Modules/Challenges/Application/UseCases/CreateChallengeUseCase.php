<?php

namespace App\Modules\Challenges\Application\UseCases;

use App\Modules\Challenges\Application\Commands\CreateChallengeCommand;
use App\Modules\Challenges\Domain\Exceptions\IdempotencyKeyReusedException;
use App\Modules\Challenges\Domain\Exceptions\InvalidChallengeNameException;
use App\Modules\Challenges\Domain\Exceptions\InvalidTargetDaysException;
use App\Modules\Challenges\Domain\Exceptions\StaleDataEpochException;
use App\Modules\Challenges\Domain\Exceptions\WriteFenceActiveException;
use App\Modules\Identity\Application\AccountTimeContextFactory;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use LogicException;

final readonly class CreateChallengeUseCase
{
    public function __construct(
        private AccountTimeContextFactory $timeContextFactory,
    ) {}

    /**
     * @return array{
     *     challenge: array{
     *         id: string,
     *         name: string,
     *         description: ?string,
     *         start_date: string,
     *         target_days: int,
     *         row_version: int,
     *         created_at: string,
     *         updated_at: string,
     *     },
     *     account_revision: int,
     *     data_epoch: int,
     * }
     */
    public function execute(CreateChallengeCommand $command): array
    {
        return DB::transaction(function () use ($command) {
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

            // Normalize optional blank description to null before canonical hashing (Item 7)
            $trimmedDescription = $command->description !== null ? trim($command->description) : null;
            if ($trimmedDescription === '') {
                $trimmedDescription = null;
            }

            $trimmedName = trim($command->name);

            $canonicalData = [
                'name' => $trimmedName,
                'description' => $trimmedDescription,
                'target_days' => $command->targetDays,
            ];
            ksort($canonicalData);
            $requestHash = hash('sha256', (string) json_encode($canonicalData, JSON_THROW_ON_ERROR));

            $existingCommand = DB::table('mutation_commands')
                ->where('owner_id', $command->ownerId)
                ->where('data_epoch', $command->dataEpoch)
                ->where('command_id', $command->commandId)
                ->first();

            if ($existingCommand !== null) {
                if ($existingCommand->request_hash === $requestHash) {
                    /** @var array{challenge: array{id: string, name: string, description: ?string, start_date: string, target_days: int, row_version: int, created_at: string, updated_at: string}, account_revision: int, data_epoch: int} */
                    return json_decode((string) $existingCommand->response_payload, true, 512, JSON_THROW_ON_ERROR);
                }

                throw new IdempotencyKeyReusedException;
            }

            if ($command->targetDays < 1 || $command->targetDays > 7) {
                throw new InvalidTargetDaysException($command->targetDays);
            }

            if ($trimmedName === '' || mb_strlen($trimmedName) > 255) {
                throw new InvalidChallengeNameException;
            }

            $timeContext = $this->timeContextFactory->capture((string) $accountState->timezone);
            $startDate = $timeContext->accountDate;

            $challengeId = (string) Str::uuid();
            $now = now();
            $nextRevision = (int) $accountState->account_revision + 1;

            DB::table('challenges')->insert([
                'id' => $challengeId,
                'owner_id' => $command->ownerId,
                'name' => $trimmedName,
                'description' => $trimmedDescription,
                'start_date' => $startDate,
                'row_version' => 1,
                'created_at' => $now,
                'updated_at' => $now,
            ]);

            DB::table('challenge_target_periods')->insert([
                'owner_id' => $command->ownerId,
                'challenge_id' => $challengeId,
                'target_days' => $command->targetDays,
                'effective_from' => $startDate,
                'created_at' => $now,
                'updated_at' => $now,
            ]);

            DB::table('account_states')
                ->where('owner_id', $command->ownerId)
                ->update(['account_revision' => $nextRevision]);

            $responsePayload = [
                'challenge' => [
                    'id' => $challengeId,
                    'name' => $trimmedName,
                    'description' => $trimmedDescription,
                    'start_date' => $startDate,
                    'target_days' => $command->targetDays,
                    'row_version' => 1,
                    'created_at' => $now->toIso8601String(),
                    'updated_at' => $now->toIso8601String(),
                ],
                'account_revision' => $nextRevision,
                'data_epoch' => (int) $accountState->data_epoch,
            ];

            DB::table('mutation_commands')->insert([
                'owner_id' => $command->ownerId,
                'data_epoch' => (int) $accountState->data_epoch,
                'command_id' => $command->commandId,
                'command_type' => 'create_challenge',
                'request_hash' => $requestHash,
                'resource_id' => $challengeId,
                'response_payload' => json_encode($responsePayload, JSON_THROW_ON_ERROR),
                'response_status' => 201,
                'created_at' => $now,
            ]);

            return $responsePayload;
        });
    }
}
