<?php

use App\Models\User;
use GuzzleHttp\Psr7\Response;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use League\OpenAPIValidation\PSR7\Exception\ValidationFailed;
use Tests\Contract\OpenApiResponseValidator;

uses(RefreshDatabase::class);

function challengeContractValidator(): OpenApiResponseValidator
{
    return new OpenApiResponseValidator(dirname(__DIR__, 3).'/contracts/openapi.yaml');
}

function challengePsrResponse(TestResponse $response): Response
{
    return new Response(
        $response->getStatusCode(),
        $response->headers->all(),
        $response->getContent(),
    );
}

function assertChallengeContractResponse(
    OpenApiResponseValidator $validator,
    string $method,
    string $path,
    TestResponse $response,
    int $status,
): void {
    $response->assertStatus($status);
    $validator->validate($method, $path, challengePsrResponse($response));
}

function createContractOwner(int $epoch = 1, string $writeState = 'open'): User
{
    $owner = User::factory()->owner()->create();
    DB::table('account_states')->updateOrInsert(
        ['owner_id' => $owner->id],
        [
            'timezone' => 'Asia/Ho_Chi_Minh',
            'account_revision' => 0,
            'data_epoch' => $epoch,
            'write_state' => $writeState,
        ]
    );

    return $owner;
}

test('challenge list and detail responses satisfy OpenAPI contract', function () {
    $owner = createContractOwner();
    $validator = challengeContractValidator();

    // List empty
    $listRes = $this->actingAs($owner)->getJson('/api/v1/challenges');
    $validator->validate('GET', '/api/v1/challenges', challengePsrResponse($listRes));

    // Create a challenge
    $createRes = $this->actingAs($owner)->postJson('/api/v1/challenges', [
        'command_id' => (string) Str::uuid(),
        'data_epoch' => 1,
        'name' => 'Contract Challenge',
        'description' => 'Test description',
        'target_days' => 4,
    ]);
    $validator->validate('POST', '/api/v1/challenges', challengePsrResponse($createRes));
    $challengeId = $createRes->json('challenge.id');

    // Detail 200
    $detailRes = $this->actingAs($owner)->getJson('/api/v1/challenges/'.$challengeId);
    $validator->validate('GET', '/api/v1/challenges/{id}', challengePsrResponse($detailRes));

    // Detail 404
    $notfoundRes = $this->actingAs($owner)->getJson('/api/v1/challenges/'.Str::uuid());
    $validator->validate('GET', '/api/v1/challenges/{id}', challengePsrResponse($notfoundRes));

    expect(true)->toBeTrue();
});

test('challenge update, conflict, and validation responses satisfy OpenAPI contract', function () {
    $owner = createContractOwner();
    $validator = challengeContractValidator();

    $createRes = $this->actingAs($owner)->postJson('/api/v1/challenges', [
        'command_id' => (string) Str::uuid(),
        'data_epoch' => 1,
        'name' => 'Original Challenge',
        'target_days' => 5,
    ]);
    $challengeId = $createRes->json('challenge.id');

    // Update 200
    $updateRes = $this->actingAs($owner)->patchJson('/api/v1/challenges/'.$challengeId, [
        'command_id' => (string) Str::uuid(),
        'data_epoch' => 1,
        'base_version' => 1,
        'name' => 'Updated Challenge',
        'description' => 'Updated description',
    ]);
    $validator->validate('PATCH', '/api/v1/challenges/{id}', challengePsrResponse($updateRes));

    // Stale conflict 409
    $conflictRes = $this->actingAs($owner)->patchJson('/api/v1/challenges/'.$challengeId, [
        'command_id' => (string) Str::uuid(),
        'data_epoch' => 1,
        'base_version' => 1, // stale
        'name' => 'Stale Attempt',
    ]);
    $validator->validate('PATCH', '/api/v1/challenges/{id}', challengePsrResponse($conflictRes));

    // Validation error 422
    $invalidRes = $this->actingAs($owner)->postJson('/api/v1/challenges', [
        'command_id' => (string) Str::uuid(),
        'data_epoch' => 1,
        'name' => '',
        'target_days' => 9,
    ]);
    $validator->validate('POST', '/api/v1/challenges', challengePsrResponse($invalidRes));

    // Write fence 423
    DB::table('account_states')->where('owner_id', $owner->id)->update(['write_state' => 'locked_for_import']);
    $lockedRes = $this->actingAs($owner)->postJson('/api/v1/challenges', [
        'command_id' => (string) Str::uuid(),
        'data_epoch' => 1,
        'name' => 'Locked',
        'target_days' => 3,
    ]);
    $validator->validate('POST', '/api/v1/challenges', challengePsrResponse($lockedRes));

    expect(true)->toBeTrue();
});

test('journal read, write, conflict, validation, and write fence satisfy OpenAPI contract', function () {
    $owner = createContractOwner();
    $id = (string) Str::uuid();
    DB::table('challenges')->insert([
        'id' => $id,
        'owner_id' => $owner->id,
        'name' => 'Journal contract',
        'start_date' => '2026-09-19',
        'row_version' => 1,
        'created_at' => now(),
        'updated_at' => now(),
    ]);
    $path = '/api/v1/challenges/{id}/journals/{date}';
    $url = "/api/v1/challenges/{$id}/journals/2026-09-19";
    $validator = challengeContractValidator();

    $read = $this->actingAs($owner)->getJson($url);
    $read->assertOk();
    $validator->validate('GET', $path, challengePsrResponse($read));

    $write = $this->actingAs($owner)->putJson($url, [
        'command_id' => (string) Str::uuid(),
        'data_epoch' => 1,
        'base_version' => 0,
        'journal' => 'Saved text',
    ]);
    $write->assertOk();
    $validator->validate('PUT', $path, challengePsrResponse($write));

    $conflict = $this->actingAs($owner)->putJson($url, [
        'command_id' => (string) Str::uuid(),
        'data_epoch' => 1,
        'base_version' => 0,
        'journal' => 'Stale text',
    ]);
    $conflict->assertStatus(409)
        ->assertJsonPath('code', 'version_conflict')
        ->assertJsonPath('resource_id', $id)
        ->assertJsonPath('current_version', 1)
        ->assertJsonPath('current_snapshot.challenge_id', $id)
        ->assertJsonPath('current_snapshot.local_date', '2026-09-19')
        ->assertJsonPath('current_snapshot.journal', 'Saved text')
        ->assertJsonPath('current_snapshot.journal_version', 1);
    $validator->validate('PUT', $path, challengePsrResponse($conflict));

    $invalid = $this->actingAs($owner)->putJson($url, [
        'command_id' => (string) Str::uuid(),
        'data_epoch' => 1,
        'base_version' => 1,
        'journal' => ' ',
    ]);
    $invalid->assertStatus(422);
    $validator->validate('PUT', $path, challengePsrResponse($invalid));

    DB::table('account_states')->where('owner_id', $owner->id)->update(['write_state' => 'locked_for_import']);
    $locked = $this->actingAs($owner)->putJson($url, [
        'command_id' => (string) Str::uuid(),
        'data_epoch' => 1,
        'base_version' => 1,
        'journal' => 'Blocked',
    ]);
    $locked->assertStatus(423);
    $validator->validate('PUT', $path, challengePsrResponse($locked));
});

test('contract covers challenge list and detail authentication branches', function () {
    $owner = createContractOwner();
    $other = User::factory()->create(['is_owner' => false]);
    $validator = challengeContractValidator();
    $challengeId = (string) Str::uuid();

    assertChallengeContractResponse($validator, 'GET', '/api/v1/challenges', $this->getJson('/api/v1/challenges'), 401);
    assertChallengeContractResponse($validator, 'GET', '/api/v1/challenges', $this->actingAs($other)->getJson('/api/v1/challenges'), 403);

    $this->actingAsGuest('web');
    $this->actingAsGuest('sanctum');
    assertChallengeContractResponse($validator, 'GET', '/api/v1/challenges/{id}', $this->getJson('/api/v1/challenges/'.$challengeId), 401);
    assertChallengeContractResponse($validator, 'GET', '/api/v1/challenges/{id}', $this->actingAs($other)->getJson('/api/v1/challenges/'.$challengeId), 403);
    expect($owner->exists)->toBeTrue();
});

test('contract covers challenge mutation authentication, conflict, not-found, validation, and fence branches', function () {
    $owner = createContractOwner();
    $other = User::factory()->create(['is_owner' => false]);
    $validator = challengeContractValidator();
    $createPayload = [
        'command_id' => (string) Str::uuid(),
        'data_epoch' => 1,
        'name' => 'Contract mutation challenge',
        'target_days' => 3,
    ];
    $challengeId = $this->actingAs($owner)->postJson('/api/v1/challenges', $createPayload)->json('challenge.id');

    $this->actingAsGuest('web');
    $this->actingAsGuest('sanctum');
    assertChallengeContractResponse($validator, 'POST', '/api/v1/challenges', $this->postJson('/api/v1/challenges', $createPayload), 401);
    assertChallengeContractResponse($validator, 'POST', '/api/v1/challenges', $this->actingAs($other)->postJson('/api/v1/challenges', $createPayload), 403);

    DB::table('account_states')->where('owner_id', $owner->id)->update(['data_epoch' => 2]);
    assertChallengeContractResponse($validator, 'POST', '/api/v1/challenges', $this->actingAs($owner)->postJson('/api/v1/challenges', [
        ...$createPayload,
        'command_id' => (string) Str::uuid(),
    ]), 409);

    $this->actingAsGuest('web');
    $this->actingAsGuest('sanctum');
    assertChallengeContractResponse($validator, 'PATCH', '/api/v1/challenges/{id}', $this->patchJson('/api/v1/challenges/'.$challengeId, [
        'command_id' => (string) Str::uuid(),
        'data_epoch' => 1,
        'base_version' => 1,
        'name' => 'Guest update',
    ]), 401);
    assertChallengeContractResponse($validator, 'PATCH', '/api/v1/challenges/{id}', $this->actingAs($other)->patchJson('/api/v1/challenges/'.$challengeId, [
        'command_id' => (string) Str::uuid(),
        'data_epoch' => 1,
        'base_version' => 1,
        'name' => 'Other update',
    ]), 403);

    assertChallengeContractResponse($validator, 'PATCH', '/api/v1/challenges/{id}', $this->actingAs($owner)->patchJson('/api/v1/challenges/'.Str::uuid(), [
        'command_id' => (string) Str::uuid(),
        'data_epoch' => 2,
        'base_version' => 1,
        'name' => 'Missing challenge',
    ]), 404);
    assertChallengeContractResponse($validator, 'PATCH', '/api/v1/challenges/{id}', $this->actingAs($owner)->patchJson('/api/v1/challenges/'.$challengeId, [
        'command_id' => (string) Str::uuid(),
        'data_epoch' => 2,
        'base_version' => 1,
        'name' => '   ',
    ]), 422);

    DB::table('account_states')->where('owner_id', $owner->id)->update(['data_epoch' => 1, 'write_state' => 'locked_for_import']);
    assertChallengeContractResponse($validator, 'PATCH', '/api/v1/challenges/{id}', $this->actingAs($owner)->patchJson('/api/v1/challenges/'.$challengeId, [
        'command_id' => (string) Str::uuid(),
        'data_epoch' => 1,
        'base_version' => 1,
        'name' => 'Blocked update',
    ]), 423);
});

test('contract covers journal read authentication, not-found, and invalid-day branches', function () {
    $owner = createContractOwner();
    $other = User::factory()->create(['is_owner' => false]);
    $validator = challengeContractValidator();
    $challengeId = (string) Str::uuid();
    DB::table('challenges')->insert([
        'id' => $challengeId,
        'owner_id' => $owner->id,
        'name' => 'Journal contract branches',
        'start_date' => '2026-09-19',
        'row_version' => 1,
        'created_at' => now(),
        'updated_at' => now(),
    ]);
    $path = '/api/v1/challenges/{id}/journals/{date}';
    $url = "/api/v1/challenges/{$challengeId}/journals/2026-09-20";

    assertChallengeContractResponse($validator, 'GET', $path, $this->getJson($url), 401);
    assertChallengeContractResponse($validator, 'GET', $path, $this->actingAs($other)->getJson($url), 403);
    assertChallengeContractResponse($validator, 'GET', $path, $this->actingAs($owner)->getJson('/api/v1/challenges/'.Str::uuid().'/journals/2026-09-20'), 404);
    assertChallengeContractResponse($validator, 'GET', $path, $this->actingAs($owner)->getJson("/api/v1/challenges/{$challengeId}/journals/2026-09-18"), 422);
});

test('contract covers journal write authentication and not-found branches', function () {
    $owner = createContractOwner();
    $other = User::factory()->create(['is_owner' => false]);
    $validator = challengeContractValidator();
    $payload = [
        'command_id' => (string) Str::uuid(),
        'data_epoch' => 1,
        'base_version' => 0,
        'journal' => 'Contract journal branch',
    ];
    $path = '/api/v1/challenges/{id}/journals/{date}';
    $challengeId = (string) Str::uuid();
    $url = "/api/v1/challenges/{$challengeId}/journals/2026-09-20";

    assertChallengeContractResponse($validator, 'PUT', $path, $this->putJson($url, $payload), 401);
    assertChallengeContractResponse($validator, 'PUT', $path, $this->actingAs($other)->putJson($url, $payload), 403);
    assertChallengeContractResponse($validator, 'PUT', $path, $this->actingAs($owner)->putJson($url, $payload), 404);
});

test('journal conflict contract rejects a missing or wrong-family snapshot', function () {
    $validator = challengeContractValidator();
    $path = '/api/v1/challenges/{id}/journals/{date}';
    $headers = [
        'Content-Type' => 'application/problem+json',
        'Cache-Control' => 'private, no-store',
    ];

    foreach ([
        [
            'message' => 'Version conflict',
            'code' => 'version_conflict',
            'resource_id' => (string) Str::uuid(),
            'current_version' => 2,
        ],
        [
            'message' => 'Version conflict',
            'code' => 'version_conflict',
            'resource_id' => (string) Str::uuid(),
            'current_version' => 2,
            'current_snapshot' => [
                'id' => (string) Str::uuid(),
                'name' => 'Wrong family',
                'description' => null,
                'start_date' => '2026-09-19',
                'target_days' => 3,
                'row_version' => 2,
            ],
        ],
    ] as $payload) {
        expect(fn () => $validator->validate('PUT', $path, new Response(409, $headers, json_encode($payload, JSON_THROW_ON_ERROR))))
            ->toThrow(ValidationFailed::class);
    }
});
