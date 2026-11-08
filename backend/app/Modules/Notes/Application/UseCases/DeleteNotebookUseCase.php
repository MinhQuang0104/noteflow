<?php

namespace App\Modules\Notes\Application\UseCases;

use App\Modules\Notes\Application\Commands\DeleteNotebookCommand;
use App\Modules\Notes\Domain\Exceptions\IdempotencyKeyReusedException;
use App\Modules\Notes\Domain\Exceptions\NotebookNotDeletableException;
use App\Modules\Notes\Domain\Exceptions\StaleDataEpochException;
use App\Modules\Notes\Domain\Exceptions\VersionConflictException;
use App\Modules\Notes\Domain\Exceptions\WriteFenceActiveException;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use LogicException;

final readonly class DeleteNotebookUseCase
{
    private const FOREIGN_KEY_VIOLATION = '23503';

    public function __construct(private GetNotebookListQuery $notebooks) {}

    /**
     * Deletes an empty, non-default notebook. Returns null when the owner has
     * no such notebook.
     *
     * @return array{deleted_notebook_id: string, account_revision: int, data_epoch: int}|null
     */
    public function execute(DeleteNotebookCommand $command): ?array
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
                'notebook_id' => $command->notebookId,
            ];
            $requestHash = hash('sha256', (string) json_encode($canonicalData, JSON_THROW_ON_ERROR));

            $existingCommand = DB::table('mutation_commands')
                ->where('owner_id', $command->ownerId)
                ->where('data_epoch', $command->dataEpoch)
                ->where('command_id', $command->commandId)
                ->first();

            if ($existingCommand !== null) {
                if ($existingCommand->request_hash === $requestHash) {
                    /** @var array{deleted_notebook_id: string, account_revision: int, data_epoch: int} */
                    return json_decode((string) $existingCommand->response_payload, true, 512, JSON_THROW_ON_ERROR);
                }

                throw new IdempotencyKeyReusedException;
            }

            $current = $this->notebooks->find($command->ownerId, $command->notebookId);
            if ($current === null) {
                return null;
            }

            if ($command->baseVersion !== $current['row_version']) {
                throw new VersionConflictException(
                    resourceId: $current['id'],
                    currentVersion: $current['row_version'],
                    currentSnapshot: $current,
                );
            }

            if ($current['is_default']) {
                throw NotebookNotDeletableException::isDefault();
            }

            if ($current['note_count'] > 0) {
                throw NotebookNotDeletableException::notEmpty();
            }

            try {
                DB::table('notebooks')
                    ->where('owner_id', $command->ownerId)
                    ->where('id', $current['id'])
                    ->where('is_default', false)
                    ->delete();
            } catch (QueryException $exception) {
                // The notes foreign key is the final guard against a note that
                // arrived without the account lock.
                if ($exception->getCode() === self::FOREIGN_KEY_VIOLATION) {
                    throw NotebookNotDeletableException::notEmpty();
                }

                throw $exception;
            }

            $nextRevision = (int) $accountState->account_revision + 1;
            DB::table('account_states')
                ->where('owner_id', $command->ownerId)
                ->update(['account_revision' => $nextRevision]);

            $responsePayload = [
                'deleted_notebook_id' => $current['id'],
                'account_revision' => $nextRevision,
                'data_epoch' => (int) $accountState->data_epoch,
            ];

            DB::table('mutation_commands')->insert([
                'owner_id' => $command->ownerId,
                'data_epoch' => (int) $accountState->data_epoch,
                'command_id' => $command->commandId,
                'command_type' => 'delete_notebook',
                'request_hash' => $requestHash,
                'resource_id' => $current['id'],
                'response_payload' => json_encode($responsePayload, JSON_THROW_ON_ERROR),
                'response_status' => 200,
                'created_at' => now(),
            ]);

            return $responsePayload;
        });
    }
}
