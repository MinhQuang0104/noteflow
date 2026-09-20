<?php

use App\Models\User;
use GuzzleHttp\Psr7\Response;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
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
