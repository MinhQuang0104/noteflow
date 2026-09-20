<?php

namespace App\Modules\Challenges\Application\UseCases;

use App\Modules\Challenges\Application\Commands\UpdateChallengeMetadataCommand;
use App\Modules\Challenges\Domain\Exceptions\IdempotencyKeyReusedException;
use App\Modules\Challenges\Domain\Exceptions\InvalidChallengeNameException;
use App\Modules\Challenges\Domain\Exceptions\StaleDataEpochException;
use App\Modules\Challenges\Domain\Exceptions\VersionConflictException;
use App\Modules\Challenges\Domain\Exceptions\WriteFenceActiveException;
use DateTimeImmutable;
use Illuminate\Support\Facades\DB;
use LogicException;

final readonly class UpdateChallengeMetadataUseCase
{
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
     * }|null
     */
    public function execute(UpdateChallengeMetadataCommand $command): ?array
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

            // Normalize optional blank description to null before canonical request hashing (Item 7)
            $trimmedDescription = $command->description !== null ? trim($command->description) : null;
            if ($trimmedDescription === '') {
                $trimmedDescription = null;
            }

            $trimmedName = trim($command->name);

            $canonicalData = [
                'base_version' => $command->baseVersion,
                'challenge_id' => $command->challengeId,
                'description' => $trimmedDescription,
                'name' => $trimmedName,
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

            $challenge = DB::table('challenges')
                ->where('id', $command->challengeId)
                ->where('owner_id', $command->ownerId)
                ->first();

            if ($challenge === null) {
                return null;
            }

            // Scope target period query by owner_id (Item 1)
            $targetPeriod = DB::table('challenge_target_periods')
                ->where('owner_id', $command->ownerId)
                ->where('challenge_id', $challenge->id)
                ->orderBy('effective_from', 'desc')
                ->first();
            $targetDays = $targetPeriod !== null ? (int) $targetPeriod->target_days : 1;

            if ($command->baseVersion !== (int) $challenge->row_version) {
                throw new VersionConflictException(
                    resourceId: (string) $challenge->id,
                    currentVersion: (int) $challenge->row_version,
                    currentSnapshot: [
                        'id' => (string) $challenge->id,
                        'name' => (string) $challenge->name,
                        'description' => $challenge->description !== null ? (string) $challenge->description : null,
                        'start_date' => (string) $challenge->start_date,
                        'target_days' => $targetDays,
                        'row_version' => (int) $challenge->row_version,
                    ],
                );
            }

            if ($trimmedName === '' || mb_strlen($trimmedName) > 255) {
                throw new InvalidChallengeNameException;
            }

            $isNoOp = $trimmedName === (string) $challenge->name
                && $trimmedDescription === ($challenge->description !== null ? (string) $challenge->description : null);

            $createdAt = (new DateTimeImmutable((string) $challenge->created_at))->format('c');

            if ($isNoOp) {
                $updatedAt = (new DateTimeImmutable((string) $challenge->updated_at))->format('c');
                $responsePayload = [
                    'challenge' => [
                        'id' => (string) $challenge->id,
                        'name' => (string) $challenge->name,
                        'description' => $challenge->description !== null ? (string) $challenge->description : null,
                        'start_date' => (string) $challenge->start_date,
                        'target_days' => $targetDays,
                        'row_version' => (int) $challenge->row_version,
                        'created_at' => $createdAt,
                        'updated_at' => $updatedAt,
                    ],
                    'account_revision' => (int) $accountState->account_revision,
                    'data_epoch' => (int) $accountState->data_epoch,
                ];

                DB::table('mutation_commands')->insert([
                    'owner_id' => $command->ownerId,
                    'data_epoch' => (int) $accountState->data_epoch,
                    'command_id' => $command->commandId,
                    'command_type' => 'update_challenge_metadata',
                    'request_hash' => $requestHash,
                    'resource_id' => (string) $challenge->id,
                    'response_payload' => json_encode($responsePayload, JSON_THROW_ON_ERROR),
                    'response_status' => 200,
                    'created_at' => now(),
                ]);

                return $responsePayload;
            }

            $now = now();
            $newVersion = (int) $challenge->row_version + 1;
            $nextRevision = (int) $accountState->account_revision + 1;

            DB::table('challenges')
                ->where('id', $challenge->id)
                ->update([
                    'name' => $trimmedName,
                    'description' => $trimmedDescription,
                    'row_version' => $newVersion,
                    'updated_at' => $now,
                ]);

            DB::table('account_states')
                ->where('owner_id', $command->ownerId)
                ->update(['account_revision' => $nextRevision]);

            $responsePayload = [
                'challenge' => [
                    'id' => (string) $challenge->id,
                    'name' => $trimmedName,
                    'description' => $trimmedDescription,
                    'start_date' => (string) $challenge->start_date,
                    'target_days' => $targetDays,
                    'row_version' => $newVersion,
                    'created_at' => $createdAt,
                    'updated_at' => $now->toIso8601String(),
                ],
                'account_revision' => $nextRevision,
                'data_epoch' => (int) $accountState->data_epoch,
            ];

            DB::table('mutation_commands')->insert([
                'owner_id' => $command->ownerId,
                'data_epoch' => (int) $accountState->data_epoch,
                'command_id' => $command->commandId,
                'command_type' => 'update_challenge_metadata',
                'request_hash' => $requestHash,
                'resource_id' => (string) $challenge->id,
                'response_payload' => json_encode($responsePayload, JSON_THROW_ON_ERROR),
                'response_status' => 200,
                'created_at' => $now,
            ]);

            return $responsePayload;
        });
    }
}
