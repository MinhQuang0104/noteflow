<?php

use App\Models\User;
use GuzzleHttp\Psr7\Response;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\Contract\OpenApiResponseValidator;

uses(RefreshDatabase::class);

function authContractValidator(): OpenApiResponseValidator
{
    return new OpenApiResponseValidator(dirname(__DIR__, 3).'/contracts/openapi.yaml');
}

function authPsrResponse(TestResponse $response): Response
{
    return new Response(
        $response->getStatusCode(),
        $response->headers->all(),
        $response->getContent(),
    );
}

test('the real login response satisfies the OpenAPI contract', function () {
    User::factory()->owner()->create([
        'email' => 'owner@example.test',
        'password' => 'correct-password',
    ]);

    $response = $this->postJson('/login', [
        'email' => 'owner@example.test',
        'password' => 'correct-password',
        'redirect_to' => '/notes',
    ]);

    authContractValidator()->validate('POST', '/login', authPsrResponse($response));
    expect(true)->toBeTrue();
});

test('authenticated and unauthenticated session responses satisfy the OpenAPI contract', function () {
    $guestResponse = $this->getJson('/api/v1/session');
    authContractValidator()->validate('GET', '/api/v1/session', authPsrResponse($guestResponse));

    $owner = User::factory()->owner()->create();
    $ownerResponse = $this->actingAs($owner)->getJson('/api/v1/session');
    authContractValidator()->validate('GET', '/api/v1/session', authPsrResponse($ownerResponse));

    $nonOwner = User::factory()->create();
    $forbiddenResponse = $this->actingAs($nonOwner)->getJson('/api/v1/session');
    authContractValidator()->validate('GET', '/api/v1/session', authPsrResponse($forbiddenResponse));

    expect(true)->toBeTrue();
});

test('invalid and throttled login responses satisfy the OpenAPI contract', function () {
    User::factory()->owner()->create([
        'email' => 'owner@example.test',
        'password' => 'correct-password',
    ]);

    $validationResponse = $this->postJson('/login', [
        'email' => 'owner@example.test',
        'password' => 'wrong-password',
    ]);
    authContractValidator()->validate('POST', '/login', authPsrResponse($validationResponse));

    foreach (range(2, 6) as $attempt) {
        $throttledResponse = $this->postJson('/login', [
            'email' => 'owner@example.test',
            'password' => 'wrong-password',
        ]);
    }
    authContractValidator()->validate('POST', '/login', authPsrResponse($throttledResponse));

    expect($throttledResponse->getStatusCode())->toBe(429);
});

test('the real logout response satisfies the OpenAPI contract', function () {
    $owner = User::factory()->owner()->create();
    $response = $this->actingAs($owner)->postJson('/logout');

    authContractValidator()->validate('POST', '/logout', authPsrResponse($response));
    expect(true)->toBeTrue();
});

test('the real csrf-expired response satisfies the OpenAPI contract', function () {
    $this->app->instance('env', 'local');
    $response = $this->withMiddleware(ValidateCsrfToken::class)->postJson('/login', [
        'email' => 'owner@example.test',
        'password' => 'correct-password',
    ]);

    authContractValidator()->validate('POST', '/login', authPsrResponse($response));
    expect(true)->toBeTrue();
});
