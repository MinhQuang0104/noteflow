<?php

namespace App\Modules\Notes\Application\UseCases;

use App\Modules\Notes\Application\Commands\RenameNotebookCommand;
use App\Modules\Notes\Domain\Exceptions\IdempotencyKeyReusedException;
use App\Modules\Notes\Domain\Exceptions\InvalidNotebookNameException;
use App\Modules\Notes\Domain\Exceptions\StaleDataEpochException;
use App\Modules\Notes\Domain\Exceptions\VersionConflictException;
use App\Modules\Notes\Domain\Exceptions\WriteFenceActiveException;
use Illuminate\Support\Facades\DB;
use LogicException;

/**
 * @phpstan-import-type NotebookView from GetNotebookListQuery
 */
final readonly class RenameNotebookUseCase
{
    public function __construct(private GetNotebookListQuery $notebooks) {}

    /**
     * Renames one notebook. The default flag is never touched, so a renamed
     * default notebook keeps its label. Returns null when the owner has no
     * such notebook.
     *
     * @return array{notebook: NotebookView, account_revision: int, data_epoch: int}|null
     */
    public function execute(RenameNotebookCommand $command): ?array
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

            $trimmedName = trim($command->name);
            $canonicalData = [
                'base_version' => $command->baseVersion,
                'name' => $trimmedName,
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
                    /** @var array{notebook: NotebookView, account_revision: int, data_epoch: int} */
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

            if ($trimmedName === '' || mb_strlen($trimmedName) > 255) {
                throw new InvalidNotebookNameException;
            }

            $now = now();
            $revision = (int) $accountState->account_revision;
            $notebook = $current;

            if ($trimmedName !== $current['name']) {
                $revision++;
                $notebook['name'] = $trimmedName;
                $notebook['row_version'] = $current['row_version'] + 1;
                $notebook['updated_at'] = $now->toIso8601String();

                DB::table('notebooks')
                    ->where('owner_id', $command->ownerId)
                    ->where('id', $current['id'])
                    ->update([
                        'name' => $trimmedName,
                        'row_version' => $notebook['row_version'],
                        'updated_at' => $now,
                    ]);

                DB::table('account_states')
                    ->where('owner_id', $command->ownerId)
                    ->update(['account_revision' => $revision]);
            }

            $responsePayload = [
                'notebook' => $notebook,
                'account_revision' => $revision,
                'data_epoch' => (int) $accountState->data_epoch,
            ];

            DB::table('mutation_commands')->insert([
                'owner_id' => $command->ownerId,
                'data_epoch' => (int) $accountState->data_epoch,
                'command_id' => $command->commandId,
                'command_type' => 'rename_notebook',
                'request_hash' => $requestHash,
                'resource_id' => $current['id'],
                'response_payload' => json_encode($responsePayload, JSON_THROW_ON_ERROR),
                'response_status' => 200,
                'created_at' => $now,
            ]);

            return $responsePayload;
        });
    }
}
