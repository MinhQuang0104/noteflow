<?php

namespace App\Modules\Notes\Application\UseCases;

use DateTimeImmutable;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

/**
 * @phpstan-type NotebookView array{
 *     id: string,
 *     name: string,
 *     is_default: bool,
 *     row_version: int,
 *     note_count: int,
 *     created_at: string,
 *     updated_at: string,
 * }
 */
final readonly class GetNotebookListQuery
{
    /**
     * One-level notebook list: the default notebook first, then by creation
     * time and id so duplicate names keep a stable order.
     *
     * @return list<NotebookView>
     */
    public function execute(int $ownerId): array
    {
        $rows = $this->baseQuery($ownerId)
            ->orderByDesc('notebooks.is_default')
            ->orderBy('notebooks.created_at')
            ->orderBy('notebooks.id')
            ->get();

        $result = [];
        foreach ($rows as $row) {
            $result[] = self::present($row);
        }

        return $result;
    }

    /**
     * Owner-scoped single notebook view; another owner's notebook is not found.
     *
     * @return NotebookView|null
     */
    public function find(int $ownerId, string $notebookId): ?array
    {
        $row = $this->baseQuery($ownerId)
            ->where('notebooks.id', $notebookId)
            ->first();

        return $row === null ? null : self::present($row);
    }

    private function baseQuery(int $ownerId): Builder
    {
        $noteCounts = DB::table('notes')
            ->select('notebook_id', DB::raw('count(*) as note_count'))
            ->where('owner_id', $ownerId)
            ->groupBy('notebook_id');

        return DB::table('notebooks')
            ->leftJoinSub($noteCounts, 'note_counts', 'note_counts.notebook_id', '=', 'notebooks.id')
            ->where('notebooks.owner_id', $ownerId)
            ->select([
                'notebooks.id',
                'notebooks.name',
                'notebooks.is_default',
                'notebooks.row_version',
                'notebooks.created_at',
                'notebooks.updated_at',
                DB::raw('coalesce(note_counts.note_count, 0) as note_count'),
            ]);
    }

    /**
     * @return NotebookView
     */
    private static function present(object $row): array
    {
        return [
            'id' => (string) $row->id,
            'name' => (string) $row->name,
            'is_default' => (bool) $row->is_default,
            'row_version' => (int) $row->row_version,
            'note_count' => (int) $row->note_count,
            'created_at' => (new DateTimeImmutable((string) $row->created_at))->format('c'),
            'updated_at' => (new DateTimeImmutable((string) $row->updated_at))->format('c'),
        ];
    }
}
