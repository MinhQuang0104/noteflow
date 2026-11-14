<?php

namespace App\Modules\Notes\Application\UseCases;

use App\Modules\Notes\Application\Commands\CreateNoteCommand;
use App\Modules\Notes\Domain\Exceptions\IdempotencyKeyReusedException;
use App\Modules\Notes\Domain\Exceptions\InvalidNoteContentException;
use App\Modules\Notes\Domain\Exceptions\StaleDataEpochException;
use App\Modules\Notes\Domain\Exceptions\WriteFenceActiveException;
use App\Modules\Notes\Domain\NoteLabel;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use LogicException;

/**
 * @phpstan-import-type NoteView from GetNoteListQuery
 */
final readonly class CreateNoteUseCase
{
    public function __construct(private GetNoteListQuery $notes) {}

    /**
     * Creates one note in a notebook of the owner. Title and body are stored
     * exactly as sent; the label is derived on read. The server never creates
     * a note whose title and body are both blank. Returns null when the owner
     * has no such notebook.
     *
     * @return array{note: NoteView, account_revision: int, data_epoch: int}|null
     */
    public function execute(CreateNoteCommand $command): ?array
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

            $requestHash = hash('sha256', (string) json_encode([
                'body' => $command->body,
                'notebook_id' => $command->notebookId,
                'title' => $command->title,
            ], JSON_THROW_ON_ERROR));

            $existingCommand = DB::table('mutation_commands')
                ->where('owner_id', $command->ownerId)
                ->where('data_epoch', $command->dataEpoch)
                ->where('command_id', $command->commandId)
                ->first();

            if ($existingCommand !== null) {
                if ($existingCommand->command_type === 'create_note' && $existingCommand->request_hash === $requestHash) {
                    /** @var array{note: NoteView, account_revision: int, data_epoch: int} */
                    return json_decode((string) $existingCommand->response_payload, true, 512, JSON_THROW_ON_ERROR);
                }

                throw new IdempotencyKeyReusedException;
            }

            $notebookExists = DB::table('notebooks')
                ->where('owner_id', $command->ownerId)
                ->where('id', $command->notebookId)
                ->exists();

            if (! $notebookExists) {
                return null;
            }

            InvalidNoteContentException::assertLengths($command->title, $command->body);

            if (! NoteLabel::hasText($command->title) && ! NoteLabel::hasText($command->body)) {
                throw InvalidNoteContentException::empty();
            }

            $noteId = (string) Str::uuid();
            $now = now();
            $nextRevision = (int) $accountState->account_revision + 1;

            DB::table('notes')->insert([
                'id' => $noteId,
                'owner_id' => $command->ownerId,
                'notebook_id' => $command->notebookId,
                'title' => $command->title,
                'body' => $command->body,
                'row_version' => 1,
                'created_at' => $now,
                'updated_at' => $now,
            ]);

            DB::table('account_states')
                ->where('owner_id', $command->ownerId)
                ->update(['account_revision' => $nextRevision]);

            $note = $this->notes->find($command->ownerId, $noteId);
            if ($note === null) {
                throw new LogicException('The created note could not be read back.');
            }

            $responsePayload = [
                'note' => $note,
                'account_revision' => $nextRevision,
                'data_epoch' => (int) $accountState->data_epoch,
            ];

            DB::table('mutation_commands')->insert([
                'owner_id' => $command->ownerId,
                'data_epoch' => (int) $accountState->data_epoch,
                'command_id' => $command->commandId,
                'command_type' => 'create_note',
                'request_hash' => $requestHash,
                'resource_id' => $noteId,
                'response_payload' => json_encode($responsePayload, JSON_THROW_ON_ERROR),
                'response_status' => 201,
                'created_at' => $now,
            ]);

            return $responsePayload;
        });
    }
}
