<?php

use App\Models\User;
use App\Modules\Notes\Application\Commands\CreateNotebookCommand;
use App\Modules\Notes\Application\Commands\CreateNoteCommand;
use App\Modules\Notes\Application\Commands\UpdateNoteCommand;
use App\Modules\Notes\Application\DefaultNotebookProvisioner;
use App\Modules\Notes\Application\UseCases\CreateNotebookUseCase;
use App\Modules\Notes\Application\UseCases\CreateNoteUseCase;
use App\Modules\Notes\Application\UseCases\GetNotebookListQuery;
use App\Modules\Notes\Application\UseCases\GetNoteListQuery;
use App\Modules\Notes\Application\UseCases\UpdateNoteUseCase;
use App\Modules\Notes\Domain\Exceptions\IdempotencyKeyReusedException;
use App\Modules\Notes\Domain\Exceptions\InvalidNoteContentException;
use App\Modules\Notes\Domain\Exceptions\StaleDataEpochException;
use App\Modules\Notes\Domain\Exceptions\WriteFenceActiveException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

uses(RefreshDatabase::class);

/**
 * The single owner, or with $isOwner false a previous account that still has
 * its own data, so owner scoping is tested against real foreign rows.
 */
function noteUseCaseOwner(int $epoch = 1, bool $isOwner = true): User
{
    $owner = $isOwner ? User::factory()->owner()->create() : User::factory()->create(['is_owner' => false]);
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

function noteRevision(User $owner): int
{
    return (int) DB::table('account_states')->where('owner_id', $owner->id)->value('account_revision');
}

function noteDefaultNotebookId(User $owner): string
{
    return (string) DB::table('notebooks')->where('owner_id', $owner->id)->where('is_default', true)->value('id');
}

/**
 * @return array<string, mixed>|null
 */
function createNoteFor(User $owner, string $notebookId, string $title, string $body, ?string $commandId = null, int $epoch = 1): ?array
{
    return app(CreateNoteUseCase::class)->execute(new CreateNoteCommand(
        ownerId: $owner->id,
        commandId: $commandId ?? (string) Str::uuid(),
        dataEpoch: $epoch,
        notebookId: $notebookId,
        title: $title,
        body: $body,
    ));
}

/**
 * @return array<string, mixed>|null
 */
function updateNoteFor(User $owner, string $noteId, int $baseVersion, string $title, string $body, ?string $commandId = null, int $epoch = 1): ?array
{
    return app(UpdateNoteUseCase::class)->execute(new UpdateNoteCommand(
        ownerId: $owner->id,
        noteId: $noteId,
        commandId: $commandId ?? (string) Str::uuid(),
        dataEpoch: $epoch,
        baseVersion: $baseVersion,
        title: $title,
        body: $body,
    ));
}

test('AC-2: create uses the notebook it is given, the default or another one', function () {
    $owner = noteUseCaseOwner();
    $defaultId = noteDefaultNotebookId($owner);
    $workId = app(CreateNotebookUseCase::class)->execute(new CreateNotebookCommand(
        ownerId: $owner->id, commandId: (string) Str::uuid(), dataEpoch: 1, name: 'Công việc',
    ))['notebook']['id'];

    $inDefault = createNoteFor($owner, $defaultId, '', 'Ý tưởng nhanh');
    $inWork = createNoteFor($owner, $workId, 'Họp', '');

    expect($inDefault['note']['notebook_id'])->toBe($defaultId)
        ->and($inDefault['note']['row_version'])->toBe(1)
        ->and($inDefault['account_revision'])->toBe(2)
        ->and($inDefault['data_epoch'])->toBe(1)
        ->and(array_keys($inDefault['note']))->toBe(['id', 'notebook_id', 'title', 'body', 'label', 'row_version', 'created_at', 'updated_at'])
        ->and($inWork['note']['notebook_id'])->toBe($workId)
        ->and($inWork['account_revision'])->toBe(3)
        ->and(DB::table('notes')->where('notebook_id', $defaultId)->count())->toBe(1)
        ->and(DB::table('notes')->where('notebook_id', $workId)->count())->toBe(1);
});

test('create in an unknown or another owner\'s notebook is not found and changes nothing', function () {
    $owner = noteUseCaseOwner();
    $other = noteUseCaseOwner(isOwner: false);
    $foreignNotebook = noteDefaultNotebookId($other);

    expect(createNoteFor($owner, (string) Str::uuid(), 'X', 'y'))->toBeNull()
        ->and(createNoteFor($owner, $foreignNotebook, 'X', 'y'))->toBeNull()
        ->and(DB::table('notes')->count())->toBe(0)
        ->and(noteRevision($owner))->toBe(0)
        ->and(noteRevision($other))->toBe(0)
        ->and(DB::table('mutation_commands')->count())->toBe(0);
});

test('AC-3: the server never creates a note whose title and body are both blank', function () {
    $owner = noteUseCaseOwner();
    $defaultId = noteDefaultNotebookId($owner);

    foreach ([['', ''], ['   ', "\n\r\n\t"], ["\u{00A0}", ' ']] as [$title, $body]) {
        try {
            createNoteFor($owner, $defaultId, $title, $body);
            $this->fail('Expected InvalidNoteContentException.');
        } catch (InvalidNoteContentException $exception) {
            expect($exception->reason)->toBe('note_empty')
                ->and($exception->field)->toBeNull();
        }
    }

    expect(DB::table('notes')->count())->toBe(0)
        ->and(noteRevision($owner))->toBe(0)
        ->and(DB::table('mutation_commands')->count())->toBe(0);
});

test('title and body length limits are counted in characters', function () {
    $owner = noteUseCaseOwner();
    $defaultId = noteDefaultNotebookId($owner);

    try {
        createNoteFor($owner, $defaultId, str_repeat('ă', 256), 'x');
        $this->fail('Expected a title length error.');
    } catch (InvalidNoteContentException $exception) {
        expect($exception->field)->toBe('title');
    }
    try {
        createNoteFor($owner, $defaultId, '', str_repeat('ă', 100001));
        $this->fail('Expected a body length error.');
    } catch (InvalidNoteContentException $exception) {
        expect($exception->field)->toBe('body');
    }

    $created = createNoteFor($owner, $defaultId, str_repeat('ă', 255), str_repeat('ă', 100000));
    $id = $created['note']['id'];
    try {
        updateNoteFor($owner, $id, 1, str_repeat('a', 256), '');
        $this->fail('Expected a title length error on update.');
    } catch (InvalidNoteContentException $exception) {
        expect($exception->field)->toBe('title');
    }

    expect(mb_strlen($created['note']['title']))->toBe(255)
        ->and(mb_strlen($created['note']['body']))->toBe(100000)
        ->and(noteRevision($owner))->toBe(1)
        ->and(DB::table('mutation_commands')->count())->toBe(1);
});

test('AC-4: title and body are stored exactly as sent and the label is never written to title', function () {
    $owner = noteUseCaseOwner();
    $defaultId = noteDefaultNotebookId($owner);
    $body = "\n  Dòng đầu tiên  \r\nDòng hai\n";

    $bodyOnly = createNoteFor($owner, $defaultId, '  ', $body);
    $titled = createNoteFor($owner, $defaultId, "  Tiêu đề \n", 'Nội dung');

    $stored = DB::table('notes')->where('id', $bodyOnly['note']['id'])->first();
    expect($stored->title)->toBe('  ')
        ->and($stored->body)->toBe($body)
        ->and($bodyOnly['note']['title'])->toBe('  ')
        ->and($bodyOnly['note']['body'])->toBe($body)
        ->and($bodyOnly['note']['label'])->toBe('Dòng đầu tiên')
        ->and(DB::table('notes')->where('id', $titled['note']['id'])->value('title'))->toBe("  Tiêu đề \n")
        ->and($titled['note']['label'])->toBe('Tiêu đề');
});

test('the list is one notebook of the owner, most recently updated first, then by id', function () {
    $owner = noteUseCaseOwner();
    $other = noteUseCaseOwner(isOwner: false);
    $defaultId = noteDefaultNotebookId($owner);
    $workId = app(CreateNotebookUseCase::class)->execute(new CreateNotebookCommand(
        ownerId: $owner->id, commandId: (string) Str::uuid(), dataEpoch: 1, name: 'Khác',
    ))['notebook']['id'];
    $insert = function (string $id, string $notebookId, string $updatedAt, string $title, ?int $ownerId = null) use ($owner): void {
        DB::table('notes')->insert([
            'id' => $id, 'owner_id' => $ownerId ?? $owner->id, 'notebook_id' => $notebookId, 'title' => $title, 'body' => '',
            'row_version' => 1, 'created_at' => '2026-11-14 08:00:00', 'updated_at' => $updatedAt,
        ]);
    };
    $insert('00000000-0000-4000-8000-00000000000c', $defaultId, '2026-11-14 09:00:00', 'Cũ');
    $insert('00000000-0000-4000-8000-00000000000b', $defaultId, '2026-11-14 10:00:00', 'Trùng giờ B');
    $insert('00000000-0000-4000-8000-00000000000a', $defaultId, '2026-11-14 10:00:00', 'Trùng giờ A');
    $insert('00000000-0000-4000-8000-00000000000d', $defaultId, '2026-11-14 11:00:00', 'Mới nhất');
    $insert('00000000-0000-4000-8000-00000000000e', $workId, '2026-11-14 12:00:00', 'Vở khác');
    $insert('00000000-0000-4000-8000-00000000000f', noteDefaultNotebookId($other), '2026-11-14 12:00:00', 'Người khác', $other->id);

    $list = app(GetNoteListQuery::class)->execute($owner->id, $defaultId);

    expect(array_column($list, 'title'))->toBe(['Mới nhất', 'Trùng giờ A', 'Trùng giờ B', 'Cũ'])
        ->and(array_column($list, 'label'))->toBe(['Mới nhất', 'Trùng giờ A', 'Trùng giờ B', 'Cũ'])
        ->and(app(GetNoteListQuery::class)->execute($owner->id, $workId))->toHaveCount(1)
        ->and(app(GetNoteListQuery::class)->execute($owner->id, noteDefaultNotebookId($other)))->toBeNull()
        ->and(app(GetNoteListQuery::class)->execute($owner->id, (string) Str::uuid()))->toBeNull()
        ->and(app(GetNoteListQuery::class)->find($owner->id, '00000000-0000-4000-8000-00000000000f'))->toBeNull();
});

test('a real update advances row_version and account_revision exactly once', function () {
    $owner = noteUseCaseOwner();
    $id = createNoteFor($owner, noteDefaultNotebookId($owner), '', 'Bản nháp')['note']['id'];

    $updated = updateNoteFor($owner, $id, 1, 'Tiêu đề', "Bản nháp\nThêm dòng");

    expect($updated['note']['row_version'])->toBe(2)
        ->and($updated['note']['title'])->toBe('Tiêu đề')
        ->and($updated['note']['body'])->toBe("Bản nháp\nThêm dòng")
        ->and($updated['note']['label'])->toBe('Tiêu đề')
        ->and($updated['account_revision'])->toBe(2)
        ->and(noteRevision($owner))->toBe(2)
        ->and((int) DB::table('notes')->where('id', $id)->value('row_version'))->toBe(2);

    $again = updateNoteFor($owner, $id, 2, 'Tiêu đề', 'Chỉ đổi body');
    expect($again['note']['row_version'])->toBe(3)
        ->and($again['account_revision'])->toBe(3);
});

test('clearing all text keeps the note, labelled Không tiêu đề', function () {
    $owner = noteUseCaseOwner();
    $id = createNoteFor($owner, noteDefaultNotebookId($owner), 'Xóa hết', 'nội dung')['note']['id'];

    $cleared = updateNoteFor($owner, $id, 1, '', '');

    expect($cleared['note']['title'])->toBe('')
        ->and($cleared['note']['body'])->toBe('')
        ->and($cleared['note']['label'])->toBe('Không tiêu đề')
        ->and($cleared['note']['row_version'])->toBe(2)
        ->and(DB::table('notes')->where('id', $id)->exists())->toBeTrue()
        ->and(DB::table('notes')->where('id', $id)->value('title'))->toBe('')
        ->and(noteRevision($owner))->toBe(2);
});

test('an update without a real change keeps account_revision and row_version', function () {
    $owner = noteUseCaseOwner();
    $id = createNoteFor($owner, noteDefaultNotebookId($owner), 'Giữ', "Nội dung\n")['note']['id'];
    $updatedAt = DB::table('notes')->where('id', $id)->value('updated_at');

    $result = updateNoteFor($owner, $id, 1, 'Giữ', "Nội dung\n");

    expect($result['note']['row_version'])->toBe(1)
        ->and($result['account_revision'])->toBe(1)
        ->and(noteRevision($owner))->toBe(1)
        ->and(DB::table('notes')->where('id', $id)->value('updated_at'))->toBe($updatedAt);

    // Whitespace is content: a change in surrounding whitespace is a real change.
    expect(updateNoteFor($owner, $id, 1, 'Giữ ', "Nội dung\n")['note']['row_version'])->toBe(2)
        ->and(noteRevision($owner))->toBe(2);
});

test('an identical retry replays the acknowledgement and a reused command ID with another payload is rejected', function () {
    $owner = noteUseCaseOwner();
    $defaultId = noteDefaultNotebookId($owner);
    $createId = (string) Str::uuid();

    $first = createNoteFor($owner, $defaultId, '', 'Một lần', $createId);
    expect(createNoteFor($owner, $defaultId, '', 'Một lần', $createId))->toEqual($first)
        ->and(fn () => createNoteFor($owner, $defaultId, '', 'Khác', $createId))->toThrow(IdempotencyKeyReusedException::class)
        ->and(fn () => createNoteFor($owner, $defaultId, ' ', 'Một lần', $createId))->toThrow(IdempotencyKeyReusedException::class);

    $id = $first['note']['id'];
    $updateId = (string) Str::uuid();
    $updated = updateNoteFor($owner, $id, 1, 'Sửa', 'Một lần', $updateId);
    expect(updateNoteFor($owner, $id, 1, 'Sửa', 'Một lần', $updateId))->toEqual($updated)
        ->and(fn () => updateNoteFor($owner, $id, 1, 'Sửa khác', 'Một lần', $updateId))->toThrow(IdempotencyKeyReusedException::class)
        ->and(fn () => updateNoteFor($owner, $id, 1, 'Sửa', 'Một lần', $createId))->toThrow(IdempotencyKeyReusedException::class);

    expect(noteRevision($owner))->toBe(2)
        ->and(DB::table('notes')->where('owner_id', $owner->id)->count())->toBe(1)
        ->and(DB::table('mutation_commands')->where('owner_id', $owner->id)->count())->toBe(2);
});

test('a stale base_version returns the current snapshot without changing data', function () {
    $owner = noteUseCaseOwner();
    $id = createNoteFor($owner, noteDefaultNotebookId($owner), '', 'Ban đầu')['note']['id'];
    updateNoteFor($owner, $id, 1, '', 'Mới nhất');

    $result = updateNoteFor($owner, $id, 1, '', 'Cũ');

    expect(array_keys($result))->toBe(['conflict'])
        ->and($result['conflict']['id'])->toBe($id)
        ->and($result['conflict']['row_version'])->toBe(2)
        ->and($result['conflict']['body'])->toBe('Mới nhất')
        ->and($result['conflict']['label'])->toBe('Mới nhất')
        ->and(DB::table('notes')->where('id', $id)->value('body'))->toBe('Mới nhất')
        ->and(noteRevision($owner))->toBe(2)
        ->and(DB::table('mutation_commands')->count())->toBe(2);
});

test('a stale data epoch and a closed write fence reject every note mutation', function () {
    $owner = noteUseCaseOwner(epoch: 2);
    $defaultId = noteDefaultNotebookId($owner);
    $id = createNoteFor($owner, $defaultId, 'Có sẵn', '', epoch: 2)['note']['id'];

    expect(fn () => createNoteFor($owner, $defaultId, 'Cũ', '', epoch: 1))->toThrow(StaleDataEpochException::class)
        ->and(fn () => updateNoteFor($owner, $id, 1, 'Cũ', '', epoch: 1))->toThrow(StaleDataEpochException::class);

    DB::table('account_states')->where('owner_id', $owner->id)->update(['write_state' => 'locked_for_import']);

    expect(fn () => createNoteFor($owner, $defaultId, 'Khóa', '', epoch: 2))->toThrow(WriteFenceActiveException::class)
        ->and(fn () => updateNoteFor($owner, $id, 1, 'Khóa', '', epoch: 2))->toThrow(WriteFenceActiveException::class);

    expect(noteRevision($owner))->toBe(1)
        ->and(DB::table('notes')->where('owner_id', $owner->id)->count())->toBe(1)
        ->and(DB::table('notes')->where('id', $id)->value('title'))->toBe('Có sẵn')
        ->and(DB::table('mutation_commands')->count())->toBe(1);
});

test('updates are owner scoped: another owner\'s note is not found and unchanged', function () {
    $owner = noteUseCaseOwner();
    $other = noteUseCaseOwner(isOwner: false);
    $foreignId = createNoteFor($other, noteDefaultNotebookId($other), 'Của người khác', '')['note']['id'];

    expect(updateNoteFor($owner, $foreignId, 1, 'Chiếm', ''))->toBeNull()
        ->and(updateNoteFor($owner, (string) Str::uuid(), 1, 'X', ''))->toBeNull()
        ->and(DB::table('notes')->where('id', $foreignId)->value('title'))->toBe('Của người khác')
        ->and(noteRevision($owner))->toBe(0)
        ->and(noteRevision($other))->toBe(1);
});

test('the notebook list counts the notes created in each notebook', function () {
    $owner = noteUseCaseOwner();
    $defaultId = noteDefaultNotebookId($owner);
    $workId = app(CreateNotebookUseCase::class)->execute(new CreateNotebookCommand(
        ownerId: $owner->id, commandId: (string) Str::uuid(), dataEpoch: 1, name: 'Công việc',
    ))['notebook']['id'];

    createNoteFor($owner, $defaultId, 'Một', '');
    createNoteFor($owner, $defaultId, '', 'Hai');
    createNoteFor($owner, $workId, 'Ba', '');

    $counts = array_column(app(GetNotebookListQuery::class)->execute($owner->id), 'note_count', 'id');
    expect($counts)->toBe([$defaultId => 2, $workId => 1])
        ->and(noteRevision($owner))->toBe(4);
});
