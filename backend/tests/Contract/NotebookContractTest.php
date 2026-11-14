<?php

use App\Models\User;
use App\Modules\Notes\Application\DefaultNotebookProvisioner;
use GuzzleHttp\Psr7\Response;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use League\OpenAPIValidation\PSR7\Exception\ValidationFailed;
use Tests\Contract\OpenApiResponseValidator;

uses(RefreshDatabase::class);

function notebookContractValidator(): OpenApiResponseValidator
{
    return new OpenApiResponseValidator(dirname(__DIR__, 3).'/contracts/openapi.yaml');
}

function assertNotebookContract(string $method, string $path, TestResponse $response, int $status): void
{
    $response->assertStatus($status);
    notebookContractValidator()->validate($method, $path, new Response(
        $response->getStatusCode(),
        $response->headers->all(),
        $response->getContent(),
    ));
}

function notebookContractOwner(): User
{
    $owner = User::factory()->owner()->create();
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

/**
 * @param  array<string, mixed>  $overrides
 * @return array<string, mixed>
 */
function notebookContractCommand(array $overrides = []): array
{
    return ['command_id' => (string) Str::uuid(), 'data_epoch' => 1, ...$overrides];
}

test('list, create, rename and delete success responses satisfy the OpenAPI contract', function () {
    $owner = notebookContractOwner();

    $created = $this->actingAs($owner)->postJson('/api/v1/notebooks', notebookContractCommand(['name' => 'Hợp đồng']));
    assertNotebookContract('POST', '/api/v1/notebooks', $created, 201);
    $id = $created->json('notebook.id');

    assertNotebookContract('GET', '/api/v1/notebooks', $this->actingAs($owner)->getJson('/api/v1/notebooks'), 200);
    assertNotebookContract('PATCH', '/api/v1/notebooks/{id}', $this->actingAs($owner)->patchJson("/api/v1/notebooks/{$id}", notebookContractCommand([
        'base_version' => 1, 'name' => 'Đổi tên',
    ])), 200);
    assertNotebookContract('DELETE', '/api/v1/notebooks/{id}', $this->actingAs($owner)->deleteJson("/api/v1/notebooks/{$id}", notebookContractCommand([
        'base_version' => 2,
    ])), 200);
});

test('authentication, not-found and validation branches satisfy the OpenAPI contract', function () {
    $owner = notebookContractOwner();
    $other = User::factory()->create(['is_owner' => false]);
    $id = (string) DB::table('notebooks')->where('owner_id', $owner->id)->value('id');
    $item = '/api/v1/notebooks/{id}';
    $rename = notebookContractCommand(['base_version' => 1, 'name' => 'X']);
    $delete = notebookContractCommand(['base_version' => 1]);

    assertNotebookContract('GET', '/api/v1/notebooks', $this->getJson('/api/v1/notebooks'), 401);
    assertNotebookContract('POST', '/api/v1/notebooks', $this->postJson('/api/v1/notebooks', notebookContractCommand(['name' => 'X'])), 401);
    assertNotebookContract('PATCH', $item, $this->patchJson("/api/v1/notebooks/{$id}", $rename), 401);
    assertNotebookContract('DELETE', $item, $this->deleteJson("/api/v1/notebooks/{$id}", $delete), 401);

    assertNotebookContract('GET', '/api/v1/notebooks', $this->actingAs($other)->getJson('/api/v1/notebooks'), 403);
    assertNotebookContract('POST', '/api/v1/notebooks', $this->actingAs($other)->postJson('/api/v1/notebooks', notebookContractCommand(['name' => 'X'])), 403);
    assertNotebookContract('PATCH', $item, $this->actingAs($other)->patchJson("/api/v1/notebooks/{$id}", $rename), 403);
    assertNotebookContract('DELETE', $item, $this->actingAs($other)->deleteJson("/api/v1/notebooks/{$id}", $delete), 403);
    $this->actingAsGuest('web');
    $this->actingAsGuest('sanctum');

    assertNotebookContract('PATCH', $item, $this->actingAs($owner)->patchJson('/api/v1/notebooks/'.Str::uuid(), $rename), 404);
    assertNotebookContract('DELETE', $item, $this->actingAs($owner)->deleteJson('/api/v1/notebooks/'.Str::uuid(), $delete), 404);

    assertNotebookContract('POST', '/api/v1/notebooks', $this->actingAs($owner)->postJson('/api/v1/notebooks', notebookContractCommand(['name' => ' '])), 422);
    assertNotebookContract('POST', '/api/v1/notebooks', $this->actingAs($owner)->postJson('/api/v1/notebooks', notebookContractCommand(['name' => 'X', 'parent_id' => $id])), 422);
    assertNotebookContract('PATCH', $item, $this->actingAs($owner)->patchJson("/api/v1/notebooks/{$id}", notebookContractCommand(['base_version' => 1, 'name' => str_repeat('a', 256)])), 422);
    assertNotebookContract('DELETE', $item, $this->actingAs($owner)->deleteJson("/api/v1/notebooks/{$id}", notebookContractCommand()), 422);
});

test('every notebook problem code satisfies the OpenAPI contract', function () {
    $owner = notebookContractOwner();
    $defaultId = (string) DB::table('notebooks')->where('owner_id', $owner->id)->value('id');
    $item = '/api/v1/notebooks/{id}';
    $commandId = (string) Str::uuid();
    $id = $this->actingAs($owner)->postJson('/api/v1/notebooks', notebookContractCommand(['command_id' => $commandId, 'name' => 'Có note']))->json('notebook.id');
    DB::table('notes')->insert([
        'id' => (string) Str::uuid(), 'owner_id' => $owner->id, 'notebook_id' => $id,
        'created_at' => now(), 'updated_at' => now(),
    ]);

    assertNotebookContract('POST', '/api/v1/notebooks', $this->actingAs($owner)->postJson('/api/v1/notebooks', notebookContractCommand(['command_id' => $commandId, 'name' => 'Khác'])), 409);
    assertNotebookContract('DELETE', $item, $this->actingAs($owner)->deleteJson("/api/v1/notebooks/{$defaultId}", notebookContractCommand(['base_version' => 1])), 409);
    assertNotebookContract('DELETE', $item, $this->actingAs($owner)->deleteJson("/api/v1/notebooks/{$id}", notebookContractCommand(['base_version' => 1])), 409);
    assertNotebookContract('PATCH', $item, $this->actingAs($owner)->patchJson("/api/v1/notebooks/{$id}", notebookContractCommand(['base_version' => 5, 'name' => 'Cũ'])), 409);
    assertNotebookContract('DELETE', $item, $this->actingAs($owner)->deleteJson("/api/v1/notebooks/{$id}", notebookContractCommand(['base_version' => 5])), 409);
    assertNotebookContract('PATCH', $item, $this->actingAs($owner)->patchJson("/api/v1/notebooks/{$id}", notebookContractCommand(['base_version' => 1, 'name' => 'Lỗi', 'command_id' => $commandId])), 409);

    DB::table('account_states')->where('owner_id', $owner->id)->update(['data_epoch' => 2]);
    assertNotebookContract('POST', '/api/v1/notebooks', $this->actingAs($owner)->postJson('/api/v1/notebooks', notebookContractCommand(['name' => 'Cũ'])), 409);
    assertNotebookContract('PATCH', $item, $this->actingAs($owner)->patchJson("/api/v1/notebooks/{$id}", notebookContractCommand(['base_version' => 1, 'name' => 'Cũ'])), 409);
    assertNotebookContract('DELETE', $item, $this->actingAs($owner)->deleteJson("/api/v1/notebooks/{$id}", notebookContractCommand(['base_version' => 1])), 409);

    DB::table('account_states')->where('owner_id', $owner->id)->update(['write_state' => 'locked_for_import']);
    assertNotebookContract('POST', '/api/v1/notebooks', $this->actingAs($owner)->postJson('/api/v1/notebooks', notebookContractCommand(['data_epoch' => 2, 'name' => 'Khóa'])), 423);
    assertNotebookContract('PATCH', $item, $this->actingAs($owner)->patchJson("/api/v1/notebooks/{$id}", notebookContractCommand(['data_epoch' => 2, 'base_version' => 1, 'name' => 'Khóa'])), 423);
    assertNotebookContract('DELETE', $item, $this->actingAs($owner)->deleteJson("/api/v1/notebooks/{$id}", notebookContractCommand(['data_epoch' => 2, 'base_version' => 1])), 423);
});

test('the contract rejects a notebook with a parent, a missing label or an unknown rule code', function () {
    $validator = notebookContractValidator();
    $json = ['Content-Type' => 'application/json', 'Cache-Control' => 'private, no-store'];
    $problem = ['Content-Type' => 'application/problem+json', 'Cache-Control' => 'private, no-store'];
    $notebook = [
        'id' => (string) Str::uuid(), 'name' => 'Vở', 'is_default' => false, 'row_version' => 1, 'note_count' => 0,
        'created_at' => '2026-11-08T10:00:00+00:00', 'updated_at' => '2026-11-08T10:00:00+00:00',
    ];
    $validator->validate('GET', '/api/v1/notebooks', new Response(200, $json, json_encode(['notebooks' => [$notebook]], JSON_THROW_ON_ERROR)));

    $withoutLabel = $notebook;
    unset($withoutLabel['is_default']);
    foreach ([
        ['notebooks' => [[...$notebook, 'parent_id' => (string) Str::uuid()]]],
        ['notebooks' => [$withoutLabel]],
    ] as $payload) {
        expect(fn () => $validator->validate('GET', '/api/v1/notebooks', new Response(200, $json, json_encode($payload, JSON_THROW_ON_ERROR))))
            ->toThrow(ValidationFailed::class);
    }

    expect(fn () => $validator->validate('DELETE', '/api/v1/notebooks/{id}', new Response(409, $problem, json_encode([
        'message' => 'Không xóa được', 'code' => 'notebook_locked',
    ], JSON_THROW_ON_ERROR))))->toThrow(ValidationFailed::class);
    expect(fn () => $validator->validate('POST', '/api/v1/notebooks', new Response(409, $problem, json_encode([
        'message' => 'Không xóa được', 'code' => 'notebook_is_default',
    ], JSON_THROW_ON_ERROR))))->toThrow(ValidationFailed::class);
});
