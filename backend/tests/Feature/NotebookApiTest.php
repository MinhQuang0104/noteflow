<?php

use App\Models\User;
use App\Modules\Notes\Application\DefaultNotebookProvisioner;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

uses(RefreshDatabase::class);

function notebookApiOwner(int $epoch = 1, string $writeState = 'open'): User
{
    $owner = User::factory()->owner()->create();
    DB::table('account_states')->insert([
        'owner_id' => $owner->id,
        'timezone' => 'Asia/Ho_Chi_Minh',
        'account_revision' => 0,
        'data_epoch' => $epoch,
        'write_state' => $writeState,
    ]);
    app(DefaultNotebookProvisioner::class)->ensure($owner->id);

    return $owner;
}

function notebookApiDefaultId(User $owner): string
{
    return (string) DB::table('notebooks')->where('owner_id', $owner->id)->where('is_default', true)->value('id');
}

/**
 * @param  array<string, mixed>  $overrides
 * @return array<string, mixed>
 */
function notebookCommand(array $overrides = []): array
{
    return [
        'command_id' => (string) Str::uuid(),
        'data_epoch' => 1,
        ...$overrides,
    ];
}

test('guests are unauthenticated on every notebook endpoint', function () {
    $id = (string) Str::uuid();

    $this->getJson('/api/v1/notebooks')->assertUnauthorized();
    $this->postJson('/api/v1/notebooks', notebookCommand(['name' => 'Khách']))->assertUnauthorized();
    $this->patchJson("/api/v1/notebooks/{$id}", notebookCommand(['base_version' => 1, 'name' => 'Khách']))->assertUnauthorized();
    $this->deleteJson("/api/v1/notebooks/{$id}", notebookCommand(['base_version' => 1]))->assertUnauthorized();
});

test('a non-owner identity is forbidden on every notebook endpoint', function () {
    $user = User::factory()->create(['is_owner' => false]);
    $id = (string) Str::uuid();

    $this->actingAs($user)->getJson('/api/v1/notebooks')->assertForbidden();
    $this->actingAs($user)->postJson('/api/v1/notebooks', notebookCommand(['name' => 'X']))->assertForbidden();
    $this->actingAs($user)->patchJson("/api/v1/notebooks/{$id}", notebookCommand(['base_version' => 1, 'name' => 'X']))->assertForbidden();
    $this->actingAs($user)->deleteJson("/api/v1/notebooks/{$id}", notebookCommand(['base_version' => 1]))->assertForbidden();
});

test('AC-1: the list returns exactly one labelled default notebook first with private no-store caching', function () {
    $owner = notebookApiOwner();
    $this->actingAs($owner)->postJson('/api/v1/notebooks', notebookCommand(['name' => 'Công việc']))->assertCreated();

    $response = $this->actingAs($owner)->getJson('/api/v1/notebooks');

    $response->assertOk()
        ->assertJsonCount(2, 'notebooks')
        ->assertJsonPath('notebooks.0.name', 'Ghi chú nhanh')
        ->assertJsonPath('notebooks.0.is_default', true)
        ->assertJsonPath('notebooks.0.note_count', 0)
        ->assertJsonPath('notebooks.1.name', 'Công việc')
        ->assertJsonPath('notebooks.1.is_default', false);
    expect(collect($response->json('notebooks'))->where('is_default', true))->toHaveCount(1)
        ->and($response->headers->get('cache-control'))->toContain('private')->toContain('no-store');
});

test('AC-2: create and rename return the one-level notebook and advance account_revision', function () {
    $owner = notebookApiOwner();

    $created = $this->actingAs($owner)->postJson('/api/v1/notebooks', notebookCommand(['name' => '  Học tập  ']));
    $created->assertCreated()
        ->assertJsonPath('notebook.name', 'Học tập')
        ->assertJsonPath('notebook.is_default', false)
        ->assertJsonPath('notebook.row_version', 1)
        ->assertJsonPath('account_revision', 1)
        ->assertJsonPath('data_epoch', 1);
    expect(array_keys($created->json('notebook')))->not->toContain('parent_id');

    $id = $created->json('notebook.id');
    $this->actingAs($owner)->patchJson("/api/v1/notebooks/{$id}", notebookCommand(['base_version' => 1, 'name' => 'Học tiếng Anh']))
        ->assertOk()
        ->assertJsonPath('notebook.id', $id)
        ->assertJsonPath('notebook.name', 'Học tiếng Anh')
        ->assertJsonPath('notebook.row_version', 2)
        ->assertJsonPath('account_revision', 2);

    $this->actingAs($owner)->patchJson('/api/v1/notebooks/'.notebookApiDefaultId($owner), notebookCommand(['base_version' => 1, 'name' => 'Nháp']))
        ->assertOk()
        ->assertJsonPath('notebook.is_default', true)
        ->assertJsonPath('notebook.name', 'Nháp');
});

test('AC-4: an empty non-default notebook is deleted with an acknowledgement', function () {
    $owner = notebookApiOwner();
    $id = $this->actingAs($owner)->postJson('/api/v1/notebooks', notebookCommand(['name' => 'Tạm']))->json('notebook.id');

    $this->actingAs($owner)->deleteJson("/api/v1/notebooks/{$id}", notebookCommand(['base_version' => 1]))
        ->assertOk()
        ->assertExactJson(['deleted_notebook_id' => $id, 'account_revision' => 2, 'data_epoch' => 1]);

    $this->actingAs($owner)->getJson('/api/v1/notebooks')->assertJsonCount(1, 'notebooks');
});

test('AC-3: deleting the default or a non-empty notebook returns a typed problem and keeps it', function () {
    $owner = notebookApiOwner();
    $defaultId = notebookApiDefaultId($owner);
    $id = $this->actingAs($owner)->postJson('/api/v1/notebooks', notebookCommand(['name' => 'Có note']))->json('notebook.id');
    DB::table('notes')->insert([
        'id' => (string) Str::uuid(), 'owner_id' => $owner->id, 'notebook_id' => $id,
        'created_at' => now(), 'updated_at' => now(),
    ]);

    $default = $this->actingAs($owner)->deleteJson("/api/v1/notebooks/{$defaultId}", notebookCommand(['base_version' => 1]));
    $default->assertStatus(409)->assertJsonPath('code', 'notebook_is_default');
    expect($default->headers->get('content-type'))->toContain('application/problem+json');

    $this->actingAs($owner)->deleteJson("/api/v1/notebooks/{$id}", notebookCommand(['base_version' => 1]))
        ->assertStatus(409)
        ->assertJsonPath('code', 'notebook_not_empty');

    expect(DB::table('notebooks')->where('owner_id', $owner->id)->count())->toBe(2);
});

test('another owner\'s notebook and malformed ids are not found', function () {
    $owner = notebookApiOwner();
    $other = User::factory()->create(['is_owner' => false]);
    $foreignId = (string) Str::uuid();
    DB::table('notebooks')->insert([
        'id' => $foreignId, 'owner_id' => $other->id, 'name' => 'Của người khác', 'is_default' => true,
        'row_version' => 1, 'created_at' => now(), 'updated_at' => now(),
    ]);

    $this->actingAs($owner)->patchJson("/api/v1/notebooks/{$foreignId}", notebookCommand(['base_version' => 1, 'name' => 'Chiếm']))->assertNotFound();
    $this->actingAs($owner)->deleteJson("/api/v1/notebooks/{$foreignId}", notebookCommand(['base_version' => 1]))->assertNotFound();
    $this->actingAs($owner)->patchJson('/api/v1/notebooks/not-a-uuid', notebookCommand(['base_version' => 1, 'name' => 'X']))->assertNotFound();
    $this->actingAs($owner)->deleteJson('/api/v1/notebooks/not-a-uuid', notebookCommand(['base_version' => 1]))->assertNotFound();

    expect(DB::table('notebooks')->where('id', $foreignId)->value('name'))->toBe('Của người khác');
});

test('unknown fields, including a parent reference, are rejected with 422', function () {
    $owner = notebookApiOwner();
    $defaultId = notebookApiDefaultId($owner);

    $this->actingAs($owner)->postJson('/api/v1/notebooks', notebookCommand(['name' => 'Con', 'parent_id' => $defaultId]))
        ->assertUnprocessable()->assertJsonValidationErrors(['parent_id']);
    $this->actingAs($owner)->patchJson("/api/v1/notebooks/{$defaultId}", notebookCommand(['base_version' => 1, 'name' => 'X', 'is_default' => false]))
        ->assertUnprocessable()->assertJsonValidationErrors(['is_default']);
    $this->actingAs($owner)->deleteJson("/api/v1/notebooks/{$defaultId}", notebookCommand(['base_version' => 1, 'force' => true]))
        ->assertUnprocessable()->assertJsonValidationErrors(['force']);

    expect((bool) DB::table('notebooks')->where('id', $defaultId)->value('is_default'))->toBeTrue()
        ->and(DB::table('notebooks')->where('owner_id', $owner->id)->count())->toBe(1);
});

test('name and command fields return field errors', function () {
    $owner = notebookApiOwner();
    $defaultId = notebookApiDefaultId($owner);

    foreach ([['name' => '   '], ['name' => str_repeat('a', 256)], [], ['name' => 12]] as $body) {
        $this->actingAs($owner)->postJson('/api/v1/notebooks', notebookCommand($body))
            ->assertUnprocessable()->assertJsonValidationErrors(['name']);
    }
    $this->actingAs($owner)->patchJson("/api/v1/notebooks/{$defaultId}", notebookCommand(['base_version' => 1, 'name' => '']))
        ->assertUnprocessable()->assertJsonValidationErrors(['name']);
    $this->actingAs($owner)->postJson('/api/v1/notebooks', ['name' => 'Thiếu lệnh'])
        ->assertUnprocessable()->assertJsonValidationErrors(['command_id', 'data_epoch']);
    $this->actingAs($owner)->deleteJson("/api/v1/notebooks/{$defaultId}", notebookCommand())
        ->assertUnprocessable()->assertJsonValidationErrors(['base_version']);

    expect((int) DB::table('account_states')->where('owner_id', $owner->id)->value('account_revision'))->toBe(0);
});

test('stale version, stale epoch, write fence and idempotency reuse return their problem codes', function () {
    $owner = notebookApiOwner();
    $commandId = (string) Str::uuid();
    $created = $this->actingAs($owner)->postJson('/api/v1/notebooks', notebookCommand(['command_id' => $commandId, 'name' => 'Gốc']));
    $id = $created->json('notebook.id');

    $this->actingAs($owner)->postJson('/api/v1/notebooks', notebookCommand(['command_id' => $commandId, 'name' => 'Gốc']))
        ->assertCreated()->assertExactJson($created->json());
    $this->actingAs($owner)->postJson('/api/v1/notebooks', notebookCommand(['command_id' => $commandId, 'name' => 'Khác']))
        ->assertStatus(409)->assertExactJson(['code' => 'idempotency_key_reused', 'message' => 'Idempotency key has already been used with a different request payload.']);

    $this->actingAs($owner)->patchJson("/api/v1/notebooks/{$id}", notebookCommand(['base_version' => 1, 'name' => 'Mới']))->assertOk();
    $conflict = $this->actingAs($owner)->patchJson("/api/v1/notebooks/{$id}", notebookCommand(['base_version' => 1, 'name' => 'Cũ']));
    $conflict->assertStatus(409)
        ->assertJsonPath('code', 'version_conflict')
        ->assertJsonPath('resource_id', $id)
        ->assertJsonPath('current_version', 2)
        ->assertJsonPath('current_snapshot.name', 'Mới')
        ->assertJsonPath('current_snapshot.row_version', 2);
    $this->actingAs($owner)->deleteJson("/api/v1/notebooks/{$id}", notebookCommand(['base_version' => 1]))
        ->assertStatus(409)->assertJsonPath('code', 'version_conflict');

    DB::table('account_states')->where('owner_id', $owner->id)->update(['data_epoch' => 2]);
    $this->actingAs($owner)->postJson('/api/v1/notebooks', notebookCommand(['name' => 'Cũ']))
        ->assertStatus(409)->assertJsonPath('code', 'stale_data_epoch');
    $this->actingAs($owner)->deleteJson("/api/v1/notebooks/{$id}", notebookCommand(['base_version' => 2]))
        ->assertStatus(409)->assertJsonPath('code', 'stale_data_epoch');

    DB::table('account_states')->where('owner_id', $owner->id)->update(['write_state' => 'locked_for_import']);
    $this->actingAs($owner)->patchJson("/api/v1/notebooks/{$id}", notebookCommand(['data_epoch' => 2, 'base_version' => 2, 'name' => 'Khóa']))
        ->assertStatus(423)->assertJsonPath('code', 'write_fence_active');

    expect(DB::table('notebooks')->where('id', $id)->value('name'))->toBe('Mới')
        ->and((int) DB::table('account_states')->where('owner_id', $owner->id)->value('account_revision'))->toBe(2);
});
