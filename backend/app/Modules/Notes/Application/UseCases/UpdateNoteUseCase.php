<?php

namespace App\Modules\Notes\Application\UseCases;

use App\Modules\Notes\Application\Commands\UpdateNoteCommand;
use App\Modules\Notes\Domain\Exceptions\IdempotencyKeyReusedException;
use App\Modules\Notes\Domain\Exceptions\InvalidNoteContentException;
use App\Modules\Notes\Domain\Exceptions\StaleDataEpochException;
use App\Modules\Notes\Domain\Exceptions\WriteFenceActiveException;
use Illuminate\Support\Facades\DB;
use LogicException;

/**
 * @phpstan-import-type NoteView from GetNoteListQuery
 */
final readonly class UpdateNoteUseCase
{
    public function __construct(private GetNoteListQuery $notes) {}

    /**
     * Replaces the title and body of one note, stored exactly as sent.
     * Clearing all text keeps the note. An update without a real change is
     * acknowledged without a new row_version or account_revision.
     *
     * Returns null when the owner has no such note, and
     * `['conflict' => <current note>]` when base_version is stale, so the
     * caller can answer with the current snapshot without changing data.
     *
     * @return array{note: NoteView, account_revision: int, data_epoch: int}|array{conflict: NoteView}|null
     */
    public function execute(UpdateNoteCommand $command): ?array
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
                'base_version' => $command->baseVersion,
                'body' => $command->body,
                'note_id' => $command->noteId,
                'title' => $command->title,
            ], JSON_THROW_ON_ERROR));

            $existingCommand = DB::table('mutation_commands')
                ->where('owner_id', $command->ownerId)
                ->where('data_epoch', $command->dataEpoch)
                ->where('command_id', $command->commandId)
                ->first();

            if ($existingCommand !== null) {
                if ($existingCommand->command_type === 'update_note' && $existingCommand->request_hash === $requestHash) {
                    /** @var array{note: NoteView, account_revision: int, data_epoch: int} */
                    return json_decode((string) $existingCommand->response_payload, true, 512, JSON_THROW_ON_ERROR);
                }

                throw new IdempotencyKeyReusedException;
            }

            $current = $this->notes->find($command->ownerId, $command->noteId);
            if ($current === null) {
                return null;
            }

            if ($command->baseVersion !== $current['row_version']) {
                return ['conflict' => $current];
            }

            InvalidNoteContentException::assertLengths($command->title, $command->body);

            $now = now();
            $revision = (int) $accountState->account_revision;
            $note = $current;

            if ($command->title !== $current['title'] || $command->body !== $current['body']) {
                $revision++;
                $rowVersion = $current['row_version'] + 1;

                DB::table('notes')
                    ->where('owner_id', $command->ownerId)
                    ->where('id', $current['id'])
                    ->update([
                        'title' => $command->title,
                        'body' => $command->body,
                        'row_version' => $rowVersion,
                        'updated_at' => $now,
                    ]);

                DB::table('account_states')
                    ->where('owner_id', $command->ownerId)
                    ->update(['account_revision' => $revision]);

                $note = $this->notes->find($command->ownerId, $current['id']);
                if ($note === null) {
                    throw new LogicException('The updated note could not be read back.');
                }
            }

            $responsePayload = [
                'note' => $note,
                'account_revision' => $revision,
                'data_epoch' => (int) $accountState->data_epoch,
            ];

            DB::table('mutation_commands')->insert([
                'owner_id' => $command->ownerId,
                'data_epoch' => (int) $accountState->data_epoch,
                'command_id' => $command->commandId,
                'command_type' => 'update_note',
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
