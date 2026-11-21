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

function noteContractValidator(): OpenApiResponseValidator
{
    return new OpenApiResponseValidator(dirname(__DIR__, 3).'/contracts/openapi.yaml');
}

function assertNoteContract(string $method, string $path, TestResponse $response, int $status): void
{
    $response->assertStatus($status);
    noteContractValidator()->validate($method, $path, new Response(
        $response->getStatusCode(),
        $response->headers->all(),
        $response->getContent(),
    ));
}

function noteContractOwner(): User
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
function noteContractCommand(array $overrides = []): array
{
    return ['command_id' => (string) Str::uuid(), 'data_epoch' => 1, ...$overrides];
}

const NOTE_LIST_PATH = '/api/v1/notebooks/{id}/notes';
const NOTE_CREATE_PATH = '/api/v1/notes';
const NOTE_ITEM_PATH = '/api/v1/notes/{id}';

test('list, create and update success responses carry the label and satisfy the OpenAPI contract', function () {
    $owner = noteContractOwner();
    $notebookId = (string) DB::table('notebooks')->where('owner_id', $owner->id)->value('id');

    $created = $this->actingAs($owner)->postJson('/api/v1/notes', noteContractCommand([
        'notebook_id' => $notebookId, 'title' => '', 'body' => "\nDòng đầu\r\nDòng hai",
    ]));
    assertNoteContract('POST', NOTE_CREATE_PATH, $created, 201);
    expect($created->json('note.label'))->toBe('Dòng đầu');
    $id = $created->json('note.id');

    $list = $this->actingAs($owner)->getJson("/api/v1/notebooks/{$notebookId}/notes");
    assertNoteContract('GET', NOTE_LIST_PATH, $list, 200);
    expect($list->json('notes.0.label'))->toBe('Dòng đầu');

    $updated = $this->actingAs($owner)->patchJson("/api/v1/notes/{$id}", noteContractCommand([
        'base_version' => 1, 'title' => '', 'body' => '',
    ]));
    assertNoteContract('PATCH', NOTE_ITEM_PATH, $updated, 200);
    expect($updated->json('note.label'))->toBe('Không tiêu đề');
});

test('authentication, not-found and validation branches satisfy the OpenAPI contract', function () {
    $owner = noteContractOwner();
    $other = User::factory()->create(['is_owner' => false]);
    $notebookId = (string) DB::table('notebooks')->where('owner_id', $owner->id)->value('id');
    $id = $this->actingAs($owner)->postJson('/api/v1/notes', noteContractCommand(['notebook_id' => $notebookId, 'title' => 'X', 'body' => '']))->json('note.id');
    $this->actingAsGuest('web');
    $this->actingAsGuest('sanctum');
    $create = noteContractCommand(['notebook_id' => $notebookId, 'title' => 'X', 'body' => '']);
    $update = noteContractCommand(['base_version' => 1, 'title' => 'Y', 'body' => '']);

    assertNoteContract('GET', NOTE_LIST_PATH, $this->getJson("/api/v1/notebooks/{$notebookId}/notes"), 401);
    assertNoteContract('POST', NOTE_CREATE_PATH, $this->postJson('/api/v1/notes', $create), 401);
    assertNoteContract('PATCH', NOTE_ITEM_PATH, $this->patchJson("/api/v1/notes/{$id}", $update), 401);

    assertNoteContract('GET', NOTE_LIST_PATH, $this->actingAs($other)->getJson("/api/v1/notebooks/{$notebookId}/notes"), 403);
    assertNoteContract('POST', NOTE_CREATE_PATH, $this->actingAs($other)->postJson('/api/v1/notes', $create), 403);
    assertNoteContract('PATCH', NOTE_ITEM_PATH, $this->actingAs($other)->patchJson("/api/v1/notes/{$id}", $update), 403);
    $this->actingAsGuest('web');
    $this->actingAsGuest('sanctum');

    assertNoteContract('GET', NOTE_LIST_PATH, $this->actingAs($owner)->getJson('/api/v1/notebooks/'.Str::uuid().'/notes'), 404);
    assertNoteContract('POST', NOTE_CREATE_PATH, $this->actingAs($owner)->postJson('/api/v1/notes', [...$create, 'notebook_id' => (string) Str::uuid()]), 404);
    assertNoteContract('PATCH', NOTE_ITEM_PATH, $this->actingAs($owner)->patchJson('/api/v1/notes/'.Str::uuid(), $update), 404);

    assertNoteContract('POST', NOTE_CREATE_PATH, $this->actingAs($owner)->postJson('/api/v1/notes', [...$create, 'title' => str_repeat('a', 256)]), 422);
    assertNoteContract('POST', NOTE_CREATE_PATH, $this->actingAs($owner)->postJson('/api/v1/notes', [...$create, 'label' => 'X']), 422);
    assertNoteContract('POST', NOTE_CREATE_PATH, $this->actingAs($owner)->postJson('/api/v1/notes', [...$create, 'title' => ' ', 'body' => '']), 422);
    assertNoteContract('PATCH', NOTE_ITEM_PATH, $this->actingAs($owner)->patchJson("/api/v1/notes/{$id}", [...$update, 'body' => str_repeat('a', 100001)]), 422);
    assertNoteContract('PATCH', NOTE_ITEM_PATH, $this->actingAs($owner)->patchJson("/api/v1/notes/{$id}", noteContractCommand(['title' => 'X', 'body' => ''])), 422);
});

test('every note problem code satisfies the OpenAPI contract', function () {
    $owner = noteContractOwner();
    $notebookId = (string) DB::table('notebooks')->where('owner_id', $owner->id)->value('id');
    $commandId = (string) Str::uuid();
    $id = $this->actingAs($owner)->postJson('/api/v1/notes', noteContractCommand([
        'command_id' => $commandId, 'notebook_id' => $notebookId, 'title' => 'Gốc', 'body' => '',
    ]))->json('note.id');

    $empty = $this->actingAs($owner)->postJson('/api/v1/notes', noteContractCommand(['notebook_id' => $notebookId, 'title' => '', 'body' => ' ']));
    assertNoteContract('POST', NOTE_CREATE_PATH, $empty, 422);
    expect($empty->json('code'))->toBe('note_empty');

    assertNoteContract('POST', NOTE_CREATE_PATH, $this->actingAs($owner)->postJson('/api/v1/notes', noteContractCommand([
        'command_id' => $commandId, 'notebook_id' => $notebookId, 'title' => 'Khác', 'body' => '',
    ])), 409);
    assertNoteContract('PATCH', NOTE_ITEM_PATH, $this->actingAs($owner)->patchJson("/api/v1/notes/{$id}", noteContractCommand([
        'command_id' => $commandId, 'base_version' => 1, 'title' => 'Lỗi', 'body' => '',
    ])), 409);
    $conflict = $this->actingAs($owner)->patchJson("/api/v1/notes/{$id}", noteContractCommand(['base_version' => 5, 'title' => 'Cũ', 'body' => '']));
    assertNoteContract('PATCH', NOTE_ITEM_PATH, $conflict, 409);
    expect($conflict->json('current_snapshot.label'))->toBe('Gốc');

    DB::table('account_states')->where('owner_id', $owner->id)->update(['data_epoch' => 2]);
    assertNoteContract('POST', NOTE_CREATE_PATH, $this->actingAs($owner)->postJson('/api/v1/notes', noteContractCommand([
        'notebook_id' => $notebookId, 'title' => 'Cũ', 'body' => '',
    ])), 409);
    assertNoteContract('PATCH', NOTE_ITEM_PATH, $this->actingAs($owner)->patchJson("/api/v1/notes/{$id}", noteContractCommand([
        'base_version' => 1, 'title' => 'Cũ', 'body' => '',
    ])), 409);

    DB::table('account_states')->where('owner_id', $owner->id)->update(['write_state' => 'locked_for_import']);
    assertNoteContract('POST', NOTE_CREATE_PATH, $this->actingAs($owner)->postJson('/api/v1/notes', noteContractCommand([
        'data_epoch' => 2, 'notebook_id' => $notebookId, 'title' => 'Khóa', 'body' => '',
    ])), 423);
    assertNoteContract('PATCH', NOTE_ITEM_PATH, $this->actingAs($owner)->patchJson("/api/v1/notes/{$id}", noteContractCommand([
        'data_epoch' => 2, 'base_version' => 1, 'title' => 'Khóa', 'body' => '',
    ])), 423);
});

test('the contract rejects a note without a label, with an unknown key or an unknown problem code', function () {
    $validator = noteContractValidator();
    $json = ['Content-Type' => 'application/json', 'Cache-Control' => 'private, no-store'];
    $problem = ['Content-Type' => 'application/problem+json', 'Cache-Control' => 'private, no-store'];
    $note = [
        'id' => (string) Str::uuid(), 'notebook_id' => (string) Str::uuid(), 'title' => '', 'body' => 'x',
        'label' => 'x', 'row_version' => 1,
        'created_at' => '2026-11-14T10:00:00+00:00', 'updated_at' => '2026-11-14T10:00:00+00:00',
    ];
    $validator->validate('GET', NOTE_LIST_PATH, new Response(200, $json, json_encode(['notes' => [$note]], JSON_THROW_ON_ERROR)));

    $withoutLabel = $note;
    unset($withoutLabel['label']);
    foreach ([
        ['notes' => [$withoutLabel]],
        ['notes' => [[...$note, 'label' => '']]],
        ['notes' => [[...$note, 'excerpt' => 'x']]],
    ] as $payload) {
        expect(fn () => $validator->validate('GET', NOTE_LIST_PATH, new Response(200, $json, json_encode($payload, JSON_THROW_ON_ERROR))))
            ->toThrow(ValidationFailed::class);
    }

    expect(fn () => $validator->validate('POST', NOTE_CREATE_PATH, new Response(422, $problem, json_encode([
        'message' => 'Rỗng', 'code' => 'note_blank',
    ], JSON_THROW_ON_ERROR))))->toThrow(ValidationFailed::class);
    expect(fn () => $validator->validate('PATCH', NOTE_ITEM_PATH, new Response(409, $problem, json_encode([
        'message' => 'Xung đột', 'code' => 'version_conflict', 'resource_id' => $note['id'], 'current_version' => 1,
        'current_snapshot' => $withoutLabel,
    ], JSON_THROW_ON_ERROR))))->toThrow(ValidationFailed::class);
});
