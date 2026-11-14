<?php

namespace App\Modules\Notes\Application\UseCases;

use App\Modules\Notes\Domain\NoteLabel;
use DateTimeImmutable;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

/**
 * @phpstan-type NoteView array{
 *     id: string,
 *     notebook_id: string,
 *     title: string,
 *     body: string,
 *     label: string,
 *     row_version: int,
 *     created_at: string,
 *     updated_at: string,
 * }
 */
final readonly class GetNoteListQuery
{
    /**
     * Notes of one notebook of the owner, most recently updated first, then by
     * id so notes updated in the same second keep a stable order. Returns null
     * when the owner has no such notebook.
     *
     * @return list<NoteView>|null
     */
    public function execute(int $ownerId, string $notebookId): ?array
    {
        $notebookExists = DB::table('notebooks')
            ->where('owner_id', $ownerId)
            ->where('id', $notebookId)
            ->exists();

        if (! $notebookExists) {
            return null;
        }

        $rows = $this->baseQuery($ownerId)
            ->where('notebook_id', $notebookId)
            ->orderByDesc('updated_at')
            ->orderBy('id')
            ->get();

        $result = [];
        foreach ($rows as $row) {
            $result[] = self::present($row);
        }

        return $result;
    }

    /**
     * Owner-scoped single note view; another owner's note is not found.
     *
     * @return NoteView|null
     */
    public function find(int $ownerId, string $noteId): ?array
    {
        $row = $this->baseQuery($ownerId)
            ->where('id', $noteId)
            ->first();

        return $row === null ? null : self::present($row);
    }

    private function baseQuery(int $ownerId): Builder
    {
        return DB::table('notes')
            ->where('owner_id', $ownerId)
            ->select(['id', 'notebook_id', 'title', 'body', 'row_version', 'created_at', 'updated_at']);
    }

    /**
     * @return NoteView
     */
    private static function present(object $row): array
    {
        $title = (string) $row->title;
        $body = (string) $row->body;

        return [
            'id' => (string) $row->id,
            'notebook_id' => (string) $row->notebook_id,
            'title' => $title,
            'body' => $body,
            'label' => NoteLabel::for($title, $body),
            'row_version' => (int) $row->row_version,
            'created_at' => (new DateTimeImmutable((string) $row->created_at))->format('c'),
            'updated_at' => (new DateTimeImmutable((string) $row->updated_at))->format('c'),
        ];
    }
}
