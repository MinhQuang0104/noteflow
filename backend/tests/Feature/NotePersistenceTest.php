<?php

use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

uses(RefreshDatabase::class);

function notePersistenceNotebook(int $ownerId): string
{
    $id = (string) Str::uuid();
    DB::table('notebooks')->insert([
        'id' => $id,
        'owner_id' => $ownerId,
        'name' => 'Vở',
        'is_default' => false,
        'row_version' => 1,
        'created_at' => now(),
        'updated_at' => now(),
    ]);

    return $id;
}

/**
 * @param  array<string, mixed>  $columns
 */
function notePersistenceNote(int $ownerId, string $notebookId, array $columns = []): string
{
    $id = (string) Str::uuid();
    DB::table('notes')->insert([
        'id' => $id,
        'owner_id' => $ownerId,
        'notebook_id' => $notebookId,
        'created_at' => now(),
        'updated_at' => now(),
        ...$columns,
    ]);

    return $id;
}

function noteSqlStateOf(callable $statement): ?string
{
    try {
        DB::transaction(function () use ($statement): void {
            $statement();
        });
    } catch (QueryException $exception) {
        return (string) $exception->getCode();
    }

    return null;
}

test('the migration keeps existing notes with an empty title and body and row_version 1', function () {
    $migration = require database_path('migrations/2026_11_14_010000_add_content_to_notes_table.php');
    $migration->down();
    expect(Schema::hasColumns('notes', ['title', 'body', 'row_version']))->toBeFalse();

    $owner = User::factory()->owner()->create();
    $notebookId = notePersistenceNotebook($owner->id);
    $existing = [notePersistenceNote($owner->id, $notebookId), notePersistenceNote($owner->id, $notebookId)];

    $migration->up();

    $rows = DB::table('notes')->whereIn('id', $existing)->get();
    expect($rows)->toHaveCount(2);
    foreach ($rows as $row) {
        expect($row->title)->toBe('')
            ->and($row->body)->toBe('')
            ->and((int) $row->row_version)->toBe(1)
            ->and($row->notebook_id)->toBe($notebookId);
    }
    expect(Schema::getColumnListing('notes'))->toEqualCanonicalizing([
        'id', 'owner_id', 'notebook_id', 'title', 'body', 'row_version', 'created_at', 'updated_at',
    ]);
});

test('PostgreSQL still rejects a note in another owner\'s notebook', function () {
    $owner = User::factory()->owner()->create();
    $other = User::factory()->create(['is_owner' => false]);
    $foreignNotebook = notePersistenceNotebook($other->id);
    $ownNotebook = notePersistenceNotebook($owner->id);

    expect(noteSqlStateOf(fn () => notePersistenceNote($owner->id, $foreignNotebook, ['title' => 'Chiếm', 'body' => 'x'])))->toBe('23503')
        ->and(DB::table('notes')->count())->toBe(0);

    $noteId = notePersistenceNote($owner->id, $ownNotebook, ['title' => 'Của tôi']);
    expect(noteSqlStateOf(fn () => DB::table('notes')->where('id', $noteId)->update(['notebook_id' => $foreignNotebook])))->toBe('23503')
        ->and(DB::table('notes')->where('id', $noteId)->value('notebook_id'))->toBe($ownNotebook);
});

test('PostgreSQL enforces the title and body limits and a positive row_version', function () {
    $owner = User::factory()->owner()->create();
    $notebookId = notePersistenceNotebook($owner->id);

    expect(noteSqlStateOf(fn () => notePersistenceNote($owner->id, $notebookId, ['title' => str_repeat('ă', 256)])))->toBe('22001')
        ->and(noteSqlStateOf(fn () => notePersistenceNote($owner->id, $notebookId, ['body' => str_repeat('ă', 100001)])))->toBe('23514')
        ->and(noteSqlStateOf(fn () => notePersistenceNote($owner->id, $notebookId, ['row_version' => 0])))->toBe('23514')
        ->and(noteSqlStateOf(fn () => notePersistenceNote($owner->id, $notebookId, ['title' => null])))->toBe('23502')
        ->and(noteSqlStateOf(fn () => notePersistenceNote($owner->id, $notebookId, ['body' => null])))->toBe('23502')
        ->and(DB::table('notes')->count())->toBe(0);

    $id = notePersistenceNote($owner->id, $notebookId, [
        'title' => str_repeat('ă', 255),
        'body' => str_repeat('ă', 100000),
    ]);
    expect(mb_strlen((string) DB::table('notes')->where('id', $id)->value('body')))->toBe(100000);
});

test('title and body keep line breaks and surrounding whitespace byte for byte', function () {
    $owner = User::factory()->owner()->create();
    $notebookId = notePersistenceNotebook($owner->id);
    $title = "  Tiêu đề\r\n ";
    $body = "\n\tDòng một\r\nDòng hai  \n";

    $id = notePersistenceNote($owner->id, $notebookId, ['title' => $title, 'body' => $body]);

    $row = DB::table('notes')->where('id', $id)->first();
    expect($row->title)->toBe($title)
        ->and($row->body)->toBe($body);
});
