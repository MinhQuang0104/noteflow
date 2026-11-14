<?php

use App\Models\User;
use App\Modules\Notes\Application\DefaultNotebookProvisioner;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

uses(RefreshDatabase::class);

function noteApiAccount(bool $isOwner = true): User
{
    $owner = $isOwner ? User::factory()->owner()->create() : User::factory()->create(['is_owner' => false]);
    DB::table('account_states')->insert([
        'owner_id' => $owner->id,
        'timezone' => 'Asia/Ho_Chi_Minh',
        'account_revision' => 0,
        'data_epoch' => 1,
        'write_state' => 'open',
    ]);
    app(DefaultNotebookProvisioner::class)->ensure($owner->id);

    return $owner;
}

function noteApiDefaultId(User $owner): string
{
    return (string) DB::table('notebooks')->where('owner_id', $owner->id)->where('is_default', true)->value('id');
}

/**
 * @param  array<string, mixed>  $overrides
 * @return array<string, mixed>
 */
function noteApiCommand(array $overrides = []): array
{
    return ['command_id' => (string) Str::uuid(), 'data_epoch' => 1, ...$overrides];
}

function noteApiRevision(User $owner): int
{
    return (int) DB::table('account_states')->where('owner_id', $owner->id)->value('account_revision');
}

test('guests are unauthenticated on every note endpoint', function () {
    $id = (string) Str::uuid();

    $this->getJson("/api/v1/notebooks/{$id}/notes")->assertUnauthorized();
    $this->postJson('/api/v1/notes', noteApiCommand(['notebook_id' => $id, 'title' => 'X', 'body' => '']))->assertUnauthorized();
    $this->patchJson("/api/v1/notes/{$id}", noteApiCommand(['base_version' => 1, 'title' => 'X', 'body' => '']))->assertUnauthorized();
});

test('a non-owner identity is forbidden on every note endpoint', function () {
    $user = User::factory()->create(['is_owner' => false]);
    $id = (string) Str::uuid();

    $this->actingAs($user)->getJson("/api/v1/notebooks/{$id}/notes")->assertForbidden();
    $this->actingAs($user)->postJson('/api/v1/notes', noteApiCommand(['notebook_id' => $id, 'title' => 'X', 'body' => '']))->assertForbidden();
    $this->actingAs($user)->patchJson("/api/v1/notes/{$id}", noteApiCommand(['base_version' => 1, 'title' => 'X', 'body' => '']))->assertForbidden();
});

test('AC-2 and AC-4: create, list and update return the note with its label and private no-store caching', function () {
    $owner = noteApiAccount();
    $defaultId = noteApiDefaultId($owner);
    $body = "\n  Mua sữa  \r\nMua bánh";

    $created = $this->actingAs($owner)->postJson('/api/v1/notes', noteApiCommand([
        'notebook_id' => $defaultId, 'title' => '  ', 'body' => $body,
    ]));
    $created->assertCreated()
        ->assertJsonPath('note.notebook_id', $defaultId)
        ->assertJsonPath('note.title', '  ')
        ->assertJsonPath('note.body', $body)
        ->assertJsonPath('note.label', 'Mua sữa')
        ->assertJsonPath('note.row_version', 1)
        ->assertJsonPath('account_revision', 1)
        ->assertJsonPath('data_epoch', 1);
    expect($created->headers->get('cache-control'))->toContain('private')->toContain('no-store');
    $id = $created->json('note.id');
    expect(DB::table('notes')->where('id', $id)->value('title'))->toBe('  ')
        ->and(DB::table('notes')->where('id', $id)->value('body'))->toBe($body);

    $list = $this->actingAs($owner)->getJson("/api/v1/notebooks/{$defaultId}/notes");
    $list->assertOk()
        ->assertJsonCount(1, 'notes')
        ->assertJsonPath('notes.0.id', $id)
        ->assertJsonPath('notes.0.label', 'Mua sữa');
    expect($list->headers->get('cache-control'))->toContain('private')->toContain('no-store');

    $this->actingAs($owner)->patchJson("/api/v1/notes/{$id}", noteApiCommand([
        'base_version' => 1, 'title' => ' Đi chợ ', 'body' => $body,
    ]))->assertOk()
        ->assertJsonPath('note.title', ' Đi chợ ')
        ->assertJsonPath('note.label', 'Đi chợ')
        ->assertJsonPath('note.row_version', 2)
        ->assertJsonPath('account_revision', 2);

    $this->actingAs($owner)->patchJson("/api/v1/notes/{$id}", noteApiCommand([
        'base_version' => 2, 'title' => '', 'body' => '',
    ]))->assertOk()
        ->assertJsonPath('note.label', 'Không tiêu đề')
        ->assertJsonPath('note.title', '')
        ->assertJsonPath('note.row_version', 3);
});

test('AC-3: a create with a blank title and body is refused with note_empty and persists nothing', function () {
    $owner = noteApiAccount();

    $response = $this->actingAs($owner)->postJson('/api/v1/notes', noteApiCommand([
        'notebook_id' => noteApiDefaultId($owner), 'title' => ' ', 'body' => "\n\t",
    ]));

    $response->assertStatus(422)->assertExactJson(['code' => 'note_empty', 'message' => 'Note cần có tiêu đề hoặc nội dung.']);
    expect($response->headers->get('content-type'))->toContain('application/problem+json')
        ->and(DB::table('notes')->count())->toBe(0)
        ->and(noteApiRevision($owner))->toBe(0);
});

test('another owner\'s note or notebook and malformed ids are not found', function () {
    $owner = noteApiAccount();
    $other = noteApiAccount(isOwner: false);
    $foreignNotebook = noteApiDefaultId($other);
    $foreignNote = (string) Str::uuid();
    DB::table('notes')->insert([
        'id' => $foreignNote, 'owner_id' => $other->id, 'notebook_id' => $foreignNotebook, 'title' => 'Của người khác',
        'body' => '', 'row_version' => 1, 'created_at' => now(), 'updated_at' => now(),
    ]);

    $this->actingAs($owner)->getJson("/api/v1/notebooks/{$foreignNotebook}/notes")->assertNotFound();
    $this->actingAs($owner)->getJson('/api/v1/notebooks/'.Str::uuid().'/notes')->assertNotFound();
    $this->actingAs($owner)->getJson('/api/v1/notebooks/not-a-uuid/notes')->assertNotFound();
    $this->actingAs($owner)->postJson('/api/v1/notes', noteApiCommand(['notebook_id' => $foreignNotebook, 'title' => 'Chiếm', 'body' => '']))
        ->assertNotFound()->assertExactJson(['message' => 'Notebook not found']);
    $this->actingAs($owner)->patchJson("/api/v1/notes/{$foreignNote}", noteApiCommand(['base_version' => 1, 'title' => 'Chiếm', 'body' => '']))
        ->assertNotFound()->assertExactJson(['message' => 'Note not found']);
    $this->actingAs($owner)->patchJson('/api/v1/notes/not-a-uuid', noteApiCommand(['base_version' => 1, 'title' => 'X', 'body' => '']))
        ->assertNotFound();

    expect(DB::table('notes')->where('id', $foreignNote)->value('title'))->toBe('Của người khác')
        ->and(DB::table('notes')->where('owner_id', $owner->id)->count())->toBe(0)
        ->and(noteApiRevision($owner))->toBe(0);
});

test('unknown fields, including a label or a row_version, are rejected with 422', function () {
    $owner = noteApiAccount();
    $defaultId = noteApiDefaultId($owner);
    $id = $this->actingAs($owner)->postJson('/api/v1/notes', noteApiCommand(['notebook_id' => $defaultId, 'title' => 'Có', 'body' => '']))->json('note.id');

    $this->actingAs($owner)->postJson('/api/v1/notes', noteApiCommand(['notebook_id' => $defaultId, 'title' => 'X', 'body' => '', 'label' => 'Y']))
        ->assertUnprocessable()->assertJsonValidationErrors(['label']);
    $this->actingAs($owner)->patchJson("/api/v1/notes/{$id}", noteApiCommand(['base_version' => 1, 'title' => 'X', 'body' => '', 'row_version' => 5]))
        ->assertUnprocessable()->assertJsonValidationErrors(['row_version']);
    $this->actingAs($owner)->patchJson("/api/v1/notes/{$id}", noteApiCommand(['base_version' => 1, 'title' => 'X', 'body' => '', 'notebook_id' => $defaultId]))
        ->assertUnprocessable()->assertJsonValidationErrors(['notebook_id']);

    expect(DB::table('notes')->where('id', $id)->value('title'))->toBe('Có')
        ->and(noteApiRevision($owner))->toBe(1);
});

test('title, body and command fields return field errors', function () {
    $owner = noteApiAccount();
    $defaultId = noteApiDefaultId($owner);
    $create = fn (array $fields) => $this->actingAs($owner)->postJson('/api/v1/notes', noteApiCommand(['notebook_id' => $defaultId, ...$fields]));

    $create(['title' => str_repeat('ă', 256), 'body' => ''])->assertUnprocessable()->assertJsonValidationErrors(['title']);
    $create(['title' => '', 'body' => str_repeat('ă', 100001)])->assertUnprocessable()->assertJsonValidationErrors(['body']);
    $create(['body' => 'x'])->assertUnprocessable()->assertJsonValidationErrors(['title']);
    $create(['title' => 'x'])->assertUnprocessable()->assertJsonValidationErrors(['body']);
    $create(['title' => null, 'body' => 12])->assertUnprocessable()->assertJsonValidationErrors(['title', 'body']);
    $create(['title' => "a\0b", 'body' => ''])->assertUnprocessable()->assertJsonValidationErrors(['title']);
    $this->actingAs($owner)->postJson('/api/v1/notes', ['title' => 'x', 'body' => ''])
        ->assertUnprocessable()->assertJsonValidationErrors(['command_id', 'data_epoch', 'notebook_id']);
    $this->actingAs($owner)->postJson('/api/v1/notes', noteApiCommand(['notebook_id' => 'not-a-uuid', 'title' => 'x', 'body' => '']))
        ->assertUnprocessable()->assertJsonValidationErrors(['notebook_id']);

    $id = $create(['title' => 'Có', 'body' => ''])->assertCreated()->json('note.id');
    $this->actingAs($owner)->patchJson("/api/v1/notes/{$id}", noteApiCommand(['title' => 'X', 'body' => '']))
        ->assertUnprocessable()->assertJsonValidationErrors(['base_version']);
    $this->actingAs($owner)->patchJson("/api/v1/notes/{$id}", noteApiCommand(['base_version' => 1, 'title' => str_repeat('a', 256), 'body' => '']))
        ->assertUnprocessable()->assertJsonValidationErrors(['title']);

    expect(DB::table('notes')->count())->toBe(1)
        ->and(noteApiRevision($owner))->toBe(1);
});

test('the request body is the source, so surrounding whitespace and empty strings survive the input middleware', function () {
    $owner = noteApiAccount();

    $response = $this->actingAs($owner)->postJson('/api/v1/notes', noteApiCommand([
        'notebook_id' => noteApiDefaultId($owner), 'title' => '', 'body' => "  thụt lề\n\n",
    ]));

    $response->assertCreated()
        ->assertJsonPath('note.title', '')
        ->assertJsonPath('note.body', "  thụt lề\n\n")
        ->assertJsonPath('note.label', 'thụt lề');
});

test('stale version, stale epoch, write fence and idempotency reuse return their problem codes', function () {
    $owner = noteApiAccount();
    $defaultId = noteApiDefaultId($owner);
    $commandId = (string) Str::uuid();
    $create = noteApiCommand(['command_id' => $commandId, 'notebook_id' => $defaultId, 'title' => 'Gốc', 'body' => '']);
    $created = $this->actingAs($owner)->postJson('/api/v1/notes', $create);
    $id = $created->json('note.id');

    $this->actingAs($owner)->postJson('/api/v1/notes', $create)->assertCreated()->assertExactJson($created->json());
    $this->actingAs($owner)->postJson('/api/v1/notes', [...$create, 'title' => 'Khác'])
        ->assertStatus(409)->assertExactJson(['code' => 'idempotency_key_reused', 'message' => 'Idempotency key has already been used with a different request payload.']);

    $this->actingAs($owner)->patchJson("/api/v1/notes/{$id}", noteApiCommand(['base_version' => 1, 'title' => 'Mới', 'body' => '']))->assertOk();
    $conflict = $this->actingAs($owner)->patchJson("/api/v1/notes/{$id}", noteApiCommand(['base_version' => 1, 'title' => 'Cũ', 'body' => '']));
    $conflict->assertStatus(409)
        ->assertJsonPath('code', 'version_conflict')
        ->assertJsonPath('resource_id', $id)
        ->assertJsonPath('current_version', 2)
        ->assertJsonPath('current_snapshot.title', 'Mới')
        ->assertJsonPath('current_snapshot.label', 'Mới')
        ->assertJsonPath('current_snapshot.row_version', 2);
    expect($conflict->headers->get('content-type'))->toContain('application/problem+json');

    DB::table('account_states')->where('owner_id', $owner->id)->update(['data_epoch' => 2]);
    $this->actingAs($owner)->postJson('/api/v1/notes', noteApiCommand(['notebook_id' => $defaultId, 'title' => 'Cũ', 'body' => '']))
        ->assertStatus(409)->assertJsonPath('code', 'stale_data_epoch');
    $this->actingAs($owner)->patchJson("/api/v1/notes/{$id}", noteApiCommand(['base_version' => 2, 'title' => 'Cũ', 'body' => '']))
        ->assertStatus(409)->assertJsonPath('code', 'stale_data_epoch');

    DB::table('account_states')->where('owner_id', $owner->id)->update(['write_state' => 'locked_for_import']);
    $this->actingAs($owner)->postJson('/api/v1/notes', noteApiCommand(['data_epoch' => 2, 'notebook_id' => $defaultId, 'title' => 'Khóa', 'body' => '']))
        ->assertStatus(423)->assertJsonPath('code', 'write_fence_active');
    $this->actingAs($owner)->patchJson("/api/v1/notes/{$id}", noteApiCommand(['data_epoch' => 2, 'base_version' => 2, 'title' => 'Khóa', 'body' => '']))
        ->assertStatus(423)->assertJsonPath('code', 'write_fence_active');

    expect(DB::table('notes')->where('id', $id)->value('title'))->toBe('Mới')
        ->and(DB::table('notes')->where('owner_id', $owner->id)->count())->toBe(1)
        ->and(noteApiRevision($owner))->toBe(2);
});
