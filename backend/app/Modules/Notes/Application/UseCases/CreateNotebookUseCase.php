<?php

namespace App\Modules\Notes\Application\UseCases;

use App\Modules\Notes\Application\Commands\CreateNotebookCommand;
use App\Modules\Notes\Domain\Exceptions\IdempotencyKeyReusedException;
use App\Modules\Notes\Domain\Exceptions\InvalidNotebookNameException;
use App\Modules\Notes\Domain\Exceptions\StaleDataEpochException;
use App\Modules\Notes\Domain\Exceptions\WriteFenceActiveException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use LogicException;

/**
 * @phpstan-import-type NotebookView from GetNotebookListQuery
 */
final readonly class CreateNotebookUseCase
{
    /**
     * @return array{notebook: NotebookView, account_revision: int, data_epoch: int}
     */
    public function execute(CreateNotebookCommand $command): array
    {
        return DB::transaction(function () use ($command): array {
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

            $trimmedName = trim($command->name);
            $requestHash = hash('sha256', (string) json_encode(['name' => $trimmedName], JSON_THROW_ON_ERROR));

            $existingCommand = DB::table('mutation_commands')
                ->where('owner_id', $command->ownerId)
                ->where('data_epoch', $command->dataEpoch)
                ->where('command_id', $command->commandId)
                ->first();

            if ($existingCommand !== null) {
                if ($existingCommand->request_hash === $requestHash) {
                    /** @var array{notebook: NotebookView, account_revision: int, data_epoch: int} */
                    return json_decode((string) $existingCommand->response_payload, true, 512, JSON_THROW_ON_ERROR);
                }

                throw new IdempotencyKeyReusedException;
            }

            if ($trimmedName === '' || mb_strlen($trimmedName) > 255) {
                throw new InvalidNotebookNameException;
            }

            $notebookId = (string) Str::uuid();
            $now = now();
            $nextRevision = (int) $accountState->account_revision + 1;

            DB::table('notebooks')->insert([
                'id' => $notebookId,
                'owner_id' => $command->ownerId,
                'name' => $trimmedName,
                'is_default' => false,
                'row_version' => 1,
                'created_at' => $now,
                'updated_at' => $now,
            ]);

            DB::table('account_states')
                ->where('owner_id', $command->ownerId)
                ->update(['account_revision' => $nextRevision]);

            $responsePayload = [
                'notebook' => [
                    'id' => $notebookId,
                    'name' => $trimmedName,
                    'is_default' => false,
                    'row_version' => 1,
                    'note_count' => 0,
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
                'command_type' => 'create_notebook',
                'request_hash' => $requestHash,
                'resource_id' => $notebookId,
                'response_payload' => json_encode($responsePayload, JSON_THROW_ON_ERROR),
                'response_status' => 201,
                'created_at' => $now,
            ]);

            return $responsePayload;
        });
    }
}
