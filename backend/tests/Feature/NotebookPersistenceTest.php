<?php

use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

uses(RefreshDatabase::class);

function persistenceNotebook(int $ownerId, bool $isDefault = false, string $name = 'Vở'): string
{
    $id = (string) Str::uuid();
    DB::table('notebooks')->insert([
        'id' => $id,
        'owner_id' => $ownerId,
        'name' => $name,
        'is_default' => $isDefault,
        'row_version' => 1,
        'created_at' => now(),
        'updated_at' => now(),
    ]);

    return $id;
}

function persistenceNote(int $ownerId, string $notebookId): string
{
    $id = (string) Str::uuid();
    DB::table('notes')->insert([
        'id' => $id,
        'owner_id' => $ownerId,
        'notebook_id' => $notebookId,
        'created_at' => now(),
        'updated_at' => now(),
    ]);

    return $id;
}

/**
 * Runs a statement in its own savepoint and returns the SQLSTATE PostgreSQL
 * rejected it with, so the surrounding test transaction stays usable.
 */
function sqlStateOf(callable $statement): ?string
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

test('PostgreSQL rejects a second default notebook for one owner but allows one per owner', function () {
    $owner = User::factory()->owner()->create();
    $other = User::factory()->create(['is_owner' => false]);

    persistenceNotebook($owner->id, true, 'Ghi chú nhanh');
    persistenceNotebook($owner->id, false, 'Ghi chú nhanh');
    persistenceNotebook($other->id, true, 'Ghi chú nhanh');

    expect(sqlStateOf(fn () => persistenceNotebook($owner->id, true, 'Second default')))->toBe('23505')
        ->and(sqlStateOf(fn () => DB::table('notebooks')->where('owner_id', $owner->id)->update(['is_default' => true])))->toBe('23505')
        ->and(DB::table('notebooks')->where('owner_id', $owner->id)->where('is_default', true)->count())->toBe(1)
        ->and(DB::table('notebooks')->where('owner_id', $owner->id)->count())->toBe(2);
});

test('PostgreSQL rejects a blank notebook name', function () {
    $owner = User::factory()->owner()->create();

    expect(sqlStateOf(fn () => persistenceNotebook($owner->id, false, '   ')))->toBe('23514')
        ->and(sqlStateOf(fn () => persistenceNotebook($owner->id, false, '')))->toBe('23514')
        ->and(DB::table('notebooks')->count())->toBe(0);
});

test('a notebook that still contains a note cannot be deleted at the database level', function () {
    $owner = User::factory()->owner()->create();
    $notebookId = persistenceNotebook($owner->id);
    $noteId = persistenceNote($owner->id, $notebookId);

    expect(sqlStateOf(fn () => DB::table('notebooks')->where('id', $notebookId)->delete()))->toBe('23503')
        ->and(DB::table('notebooks')->where('id', $notebookId)->exists())->toBeTrue();

    DB::table('notes')->where('id', $noteId)->delete();
    expect(sqlStateOf(fn () => DB::table('notebooks')->where('id', $notebookId)->delete()))->toBeNull()
        ->and(DB::table('notebooks')->where('id', $notebookId)->exists())->toBeFalse();
});

test('a note cannot reference another owner\'s notebook', function () {
    $owner = User::factory()->owner()->create();
    $other = User::factory()->create(['is_owner' => false]);
    $otherNotebook = persistenceNotebook($other->id);
    $ownNotebook = persistenceNotebook($owner->id);

    expect(sqlStateOf(fn () => persistenceNote($owner->id, $otherNotebook)))->toBe('23503')
        ->and(sqlStateOf(fn () => persistenceNote($owner->id, (string) Str::uuid())))->toBe('23503')
        ->and(DB::table('notes')->count())->toBe(0);

    $noteId = persistenceNote($owner->id, $ownNotebook);
    expect(sqlStateOf(fn () => DB::table('notes')->where('id', $noteId)->update(['notebook_id' => $otherNotebook])))->toBe('23503')
        ->and(DB::table('notes')->where('id', $noteId)->value('notebook_id'))->toBe($ownNotebook);
});

test('notebooks are one level with no parent reference', function () {
    $columns = Schema::getColumnListing('notebooks');

    sort($columns);
    expect($columns)->toBe(['created_at', 'id', 'is_default', 'name', 'owner_id', 'row_version', 'updated_at']);
    expect(Schema::getColumnListing('notes'))->toEqualCanonicalizing(['id', 'owner_id', 'notebook_id', 'created_at', 'updated_at']);
});

test('the migration backfills exactly one default notebook for every existing account', function () {
    $migration = require database_path('migrations/2026_11_08_010000_create_notebooks_and_notes_tables.php');
    $migration->down();
    expect(Schema::hasTable('notebooks'))->toBeFalse()
        ->and(Schema::hasTable('notes'))->toBeFalse();

    $owner = User::factory()->owner()->create();
    $previous = User::factory()->create(['is_owner' => false]);
    $withoutAccount = User::factory()->create(['is_owner' => false]);
    foreach ([$owner, $previous] as $user) {
        DB::table('account_states')->insert([
            'owner_id' => $user->id,
            'timezone' => 'Asia/Ho_Chi_Minh',
        ]);
    }
    $revisionBefore = DB::table('account_states')->orderBy('owner_id')->pluck('account_revision', 'owner_id')->all();

    $migration->up();

    foreach ([$owner, $previous] as $user) {
        $notebooks = DB::table('notebooks')->where('owner_id', $user->id)->get();
        expect($notebooks)->toHaveCount(1)
            ->and((bool) $notebooks[0]->is_default)->toBeTrue()
            ->and($notebooks[0]->name)->toBe('Ghi chú nhanh')
            ->and((int) $notebooks[0]->row_version)->toBe(1);
    }
    expect(DB::table('notebooks')->where('owner_id', $withoutAccount->id)->exists())->toBeFalse()
        ->and(DB::table('account_states')->orderBy('owner_id')->pluck('account_revision', 'owner_id')->all())->toBe($revisionBefore);
});
