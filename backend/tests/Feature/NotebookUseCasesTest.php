<?php

use App\Models\User;
use App\Modules\Notes\Application\Commands\CreateNotebookCommand;
use App\Modules\Notes\Application\Commands\DeleteNotebookCommand;
use App\Modules\Notes\Application\Commands\RenameNotebookCommand;
use App\Modules\Notes\Application\DefaultNotebookProvisioner;
use App\Modules\Notes\Application\UseCases\CreateNotebookUseCase;
use App\Modules\Notes\Application\UseCases\DeleteNotebookUseCase;
use App\Modules\Notes\Application\UseCases\GetNotebookListQuery;
use App\Modules\Notes\Application\UseCases\RenameNotebookUseCase;
use App\Modules\Notes\Domain\Exceptions\IdempotencyKeyReusedException;
use App\Modules\Notes\Domain\Exceptions\InvalidNotebookNameException;
use App\Modules\Notes\Domain\Exceptions\NotebookNotDeletableException;
use App\Modules\Notes\Domain\Exceptions\StaleDataEpochException;
use App\Modules\Notes\Domain\Exceptions\VersionConflictException;
use App\Modules\Notes\Domain\Exceptions\WriteFenceActiveException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

uses(RefreshDatabase::class);

function notebookUseCaseOwner(int $epoch = 1): User
{
    $owner = User::factory()->owner()->create();
    DB::table('account_states')->insert([
        'owner_id' => $owner->id,
        'timezone' => 'Asia/Ho_Chi_Minh',
        'account_revision' => 0,
        'data_epoch' => $epoch,
        'write_state' => 'open',
    ]);
    app(DefaultNotebookProvisioner::class)->ensure($owner->id);

    return $owner;
}

function notebookRevision(User $owner): int
{
    return (int) DB::table('account_states')->where('owner_id', $owner->id)->value('account_revision');
}

function defaultNotebookId(User $owner): string
{
    return (string) DB::table('notebooks')->where('owner_id', $owner->id)->where('is_default', true)->value('id');
}

/**
 * @return array<string, mixed>
 */
function createNotebookFor(User $owner, string $name, ?string $commandId = null, int $epoch = 1): array
{
    return app(CreateNotebookUseCase::class)->execute(new CreateNotebookCommand(
        ownerId: $owner->id,
        commandId: $commandId ?? (string) Str::uuid(),
        dataEpoch: $epoch,
        name: $name,
    ));
}

/**
 * @return array<string, mixed>|null
 */
function renameNotebookFor(User $owner, string $id, int $baseVersion, string $name, ?string $commandId = null, int $epoch = 1): ?array
{
    return app(RenameNotebookUseCase::class)->execute(new RenameNotebookCommand(
        ownerId: $owner->id,
        notebookId: $id,
        commandId: $commandId ?? (string) Str::uuid(),
        dataEpoch: $epoch,
        baseVersion: $baseVersion,
        name: $name,
    ));
}

/**
 * @return array<string, mixed>|null
 */
function deleteNotebookFor(User $owner, string $id, int $baseVersion, ?string $commandId = null, int $epoch = 1): ?array
{
    return app(DeleteNotebookUseCase::class)->execute(new DeleteNotebookCommand(
        ownerId: $owner->id,
        notebookId: $id,
        commandId: $commandId ?? (string) Str::uuid(),
        dataEpoch: $epoch,
        baseVersion: $baseVersion,
    ));
}

function insertNoteInto(User $owner, string $notebookId): void
{
    DB::table('notes')->insert([
        'id' => (string) Str::uuid(),
        'owner_id' => $owner->id,
        'notebook_id' => $notebookId,
        'created_at' => now(),
        'updated_at' => now(),
    ]);
}

test('the list puts the default first, then orders by created_at and id, with is_default, row_version and note_count', function () {
    $owner = notebookUseCaseOwner();
    $defaultId = defaultNotebookId($owner);
    DB::table('notebooks')->where('id', $defaultId)->update(['created_at' => '2026-11-08 12:00:00']);

    $sameTime = '2026-11-08 09:00:00';
    $ids = ['00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-00000000000a'];
    foreach ($ids as $id) {
        DB::table('notebooks')->insert([
            'id' => $id, 'owner_id' => $owner->id, 'name' => 'Trùng tên', 'is_default' => false,
            'row_version' => 1, 'created_at' => $sameTime, 'updated_at' => $sameTime,
        ]);
    }
    DB::table('notebooks')->insert([
        'id' => (string) Str::uuid(), 'owner_id' => $owner->id, 'name' => 'Sớm nhất', 'is_default' => false,
        'row_version' => 3, 'created_at' => '2026-11-08 08:00:00', 'updated_at' => '2026-11-08 08:00:00',
    ]);
    insertNoteInto($owner, $ids[1]);
    insertNoteInto($owner, $ids[1]);
    insertNoteInto($owner, $defaultId);

    $list = app(GetNotebookListQuery::class)->execute($owner->id);

    expect(array_column($list, 'name'))->toBe(['Ghi chú nhanh', 'Sớm nhất', 'Trùng tên', 'Trùng tên'])
        ->and($list[2]['id'])->toBe($ids[1])
        ->and($list[3]['id'])->toBe($ids[0])
        ->and(array_column($list, 'is_default'))->toBe([true, false, false, false])
        ->and(array_column($list, 'note_count'))->toBe([1, 0, 2, 0])
        ->and($list[1]['row_version'])->toBe(3)
        ->and(array_keys($list[0]))->toBe(['id', 'name', 'is_default', 'row_version', 'note_count', 'created_at', 'updated_at']);
});

test('create trims the name, allows duplicates and advances account_revision once per notebook', function () {
    $owner = notebookUseCaseOwner();

    $first = createNotebookFor($owner, '  Công việc  ');
    $second = createNotebookFor($owner, 'Công việc');

    expect($first['notebook']['name'])->toBe('Công việc')
        ->and($first['notebook']['is_default'])->toBeFalse()
        ->and($first['notebook']['row_version'])->toBe(1)
        ->and($first['notebook']['note_count'])->toBe(0)
        ->and($first['account_revision'])->toBe(1)
        ->and($first['data_epoch'])->toBe(1)
        ->and($second['notebook']['id'])->not->toBe($first['notebook']['id'])
        ->and($second['account_revision'])->toBe(2)
        ->and(notebookRevision($owner))->toBe(2)
        ->and(DB::table('notebooks')->where('owner_id', $owner->id)->where('name', 'Công việc')->count())->toBe(2);
});

test('names must be non-empty after trimming and at most 255 characters', function () {
    $owner = notebookUseCaseOwner();

    expect(fn () => createNotebookFor($owner, "  \t "))->toThrow(InvalidNotebookNameException::class)
        ->and(fn () => createNotebookFor($owner, str_repeat('ă', 256)))->toThrow(InvalidNotebookNameException::class)
        ->and(fn () => renameNotebookFor($owner, defaultNotebookId($owner), 1, ' '))->toThrow(InvalidNotebookNameException::class);

    expect(createNotebookFor($owner, str_repeat('ă', 255))['notebook']['name'])->toBe(str_repeat('ă', 255))
        ->and(notebookRevision($owner))->toBe(1)
        ->and(DB::table('mutation_commands')->count())->toBe(1);
});

test('the default notebook can be renamed and stays the default', function () {
    $owner = notebookUseCaseOwner();
    $defaultId = defaultNotebookId($owner);

    $result = renameNotebookFor($owner, $defaultId, 1, ' Nháp ');

    expect($result['notebook']['id'])->toBe($defaultId)
        ->and($result['notebook']['name'])->toBe('Nháp')
        ->and($result['notebook']['is_default'])->toBeTrue()
        ->and($result['notebook']['row_version'])->toBe(2)
        ->and($result['account_revision'])->toBe(1)
        ->and((bool) DB::table('notebooks')->where('id', $defaultId)->value('is_default'))->toBeTrue();
});

test('renaming to the same trimmed name is acknowledged without a new version or revision', function () {
    $owner = notebookUseCaseOwner();
    $defaultId = defaultNotebookId($owner);

    $result = renameNotebookFor($owner, $defaultId, 1, ' Ghi chú nhanh ');

    expect($result['notebook']['row_version'])->toBe(1)
        ->and($result['account_revision'])->toBe(0)
        ->and(notebookRevision($owner))->toBe(0);
});

test('an empty non-default notebook is deleted with one revision step', function () {
    $owner = notebookUseCaseOwner();
    $created = createNotebookFor($owner, 'Tạm');
    $id = $created['notebook']['id'];

    $result = deleteNotebookFor($owner, $id, 1);

    expect($result)->toBe(['deleted_notebook_id' => $id, 'account_revision' => 2, 'data_epoch' => 1])
        ->and(DB::table('notebooks')->where('id', $id)->exists())->toBeFalse()
        ->and(notebookRevision($owner))->toBe(2);
});

test('deleting the default notebook is rejected with notebook_is_default', function () {
    $owner = notebookUseCaseOwner();
    $defaultId = defaultNotebookId($owner);

    try {
        deleteNotebookFor($owner, $defaultId, 1);
        $this->fail('Expected NotebookNotDeletableException.');
    } catch (NotebookNotDeletableException $exception) {
        expect($exception->reason)->toBe('notebook_is_default');
    }

    expect(DB::table('notebooks')->where('id', $defaultId)->exists())->toBeTrue()
        ->and(notebookRevision($owner))->toBe(0)
        ->and(DB::table('mutation_commands')->count())->toBe(0);
});

test('deleting a notebook that still has notes is rejected with notebook_not_empty', function () {
    $owner = notebookUseCaseOwner();
    $id = createNotebookFor($owner, 'Có note')['notebook']['id'];
    insertNoteInto($owner, $id);

    try {
        deleteNotebookFor($owner, $id, 1);
        $this->fail('Expected NotebookNotDeletableException.');
    } catch (NotebookNotDeletableException $exception) {
        expect($exception->reason)->toBe('notebook_not_empty');
    }

    expect(DB::table('notebooks')->where('id', $id)->exists())->toBeTrue()
        ->and(notebookRevision($owner))->toBe(1);
});

test('an identical retry replays the stored acknowledgement and a reused command ID with another payload is rejected', function () {
    $owner = notebookUseCaseOwner();
    $createId = (string) Str::uuid();
    $first = createNotebookFor($owner, 'Một lần', $createId);
    $replay = createNotebookFor($owner, '  Một lần ', $createId);
    // The ledger stores JSONB, so a replay carries the same content in canonical key order.
    expect($replay)->toEqual($first)
        ->and(fn () => createNotebookFor($owner, 'Khác', $createId))->toThrow(IdempotencyKeyReusedException::class);

    $id = $first['notebook']['id'];
    $renameId = (string) Str::uuid();
    $renamed = renameNotebookFor($owner, $id, 1, 'Đổi tên', $renameId);
    expect(renameNotebookFor($owner, $id, 1, 'Đổi tên', $renameId))->toEqual($renamed)
        ->and(fn () => renameNotebookFor($owner, $id, 1, 'Tên khác', $renameId))->toThrow(IdempotencyKeyReusedException::class);

    $deleteId = (string) Str::uuid();
    $deleted = deleteNotebookFor($owner, $id, 2, $deleteId);
    expect(deleteNotebookFor($owner, $id, 2, $deleteId))->toEqual($deleted)
        ->and(fn () => deleteNotebookFor($owner, $id, 1, $deleteId))->toThrow(IdempotencyKeyReusedException::class);

    expect(notebookRevision($owner))->toBe(3)
        ->and(DB::table('mutation_commands')->where('owner_id', $owner->id)->count())->toBe(3)
        ->and(DB::table('notebooks')->where('owner_id', $owner->id)->count())->toBe(1);
});

test('a stale base_version returns the current snapshot without changing data', function () {
    $owner = notebookUseCaseOwner();
    $id = createNotebookFor($owner, 'Ban đầu')['notebook']['id'];
    renameNotebookFor($owner, $id, 1, 'Mới nhất');

    foreach ([
        fn () => renameNotebookFor($owner, $id, 1, 'Cũ'),
        fn () => deleteNotebookFor($owner, $id, 1),
    ] as $attempt) {
        try {
            $attempt();
            $this->fail('Expected VersionConflictException.');
        } catch (VersionConflictException $exception) {
            expect($exception->resourceId)->toBe($id)
                ->and($exception->currentVersion)->toBe(2)
                ->and($exception->currentSnapshot['name'])->toBe('Mới nhất')
                ->and($exception->currentSnapshot['row_version'])->toBe(2)
                ->and($exception->currentSnapshot['is_default'])->toBeFalse()
                ->and($exception->currentSnapshot['note_count'])->toBe(0);
        }
    }

    expect(DB::table('notebooks')->where('id', $id)->value('name'))->toBe('Mới nhất')
        ->and(notebookRevision($owner))->toBe(2);
});

test('a stale data epoch and a closed write fence reject every mutation', function () {
    $owner = notebookUseCaseOwner(epoch: 2);
    $defaultId = defaultNotebookId($owner);

    expect(fn () => createNotebookFor($owner, 'Cũ', epoch: 1))->toThrow(StaleDataEpochException::class)
        ->and(fn () => renameNotebookFor($owner, $defaultId, 1, 'Cũ', epoch: 1))->toThrow(StaleDataEpochException::class)
        ->and(fn () => deleteNotebookFor($owner, $defaultId, 1, epoch: 1))->toThrow(StaleDataEpochException::class);

    DB::table('account_states')->where('owner_id', $owner->id)->update(['write_state' => 'locked_for_import']);

    expect(fn () => createNotebookFor($owner, 'Khóa', epoch: 2))->toThrow(WriteFenceActiveException::class)
        ->and(fn () => renameNotebookFor($owner, $defaultId, 1, 'Khóa', epoch: 2))->toThrow(WriteFenceActiveException::class)
        ->and(fn () => deleteNotebookFor($owner, $defaultId, 1, epoch: 2))->toThrow(WriteFenceActiveException::class);

    expect(notebookRevision($owner))->toBe(0)
        ->and(DB::table('notebooks')->where('owner_id', $owner->id)->count())->toBe(1)
        ->and(DB::table('mutation_commands')->count())->toBe(0);
});

test('reads and writes are owner scoped and another owner\'s notebook is not found', function () {
    $owner = notebookUseCaseOwner();
    $other = User::factory()->create(['is_owner' => false]);
    $foreignId = (string) Str::uuid();
    DB::table('notebooks')->insert([
        'id' => $foreignId, 'owner_id' => $other->id, 'name' => 'Của người khác', 'is_default' => true,
        'row_version' => 1, 'created_at' => now(), 'updated_at' => now(),
    ]);

    expect(array_column(app(GetNotebookListQuery::class)->execute($owner->id), 'id'))->toBe([defaultNotebookId($owner)])
        ->and(renameNotebookFor($owner, $foreignId, 1, 'Chiếm'))->toBeNull()
        ->and(deleteNotebookFor($owner, $foreignId, 1))->toBeNull()
        ->and(DB::table('notebooks')->where('id', $foreignId)->value('name'))->toBe('Của người khác')
        ->and(notebookRevision($owner))->toBe(0);
});
