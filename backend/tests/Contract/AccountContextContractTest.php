<?php

use App\Models\User;
use App\Modules\Identity\Contracts\Clock;
use GuzzleHttp\Psr7\Response;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use Tests\Contract\OpenApiResponseValidator;

uses(RefreshDatabase::class);

function accountContractValidator(): OpenApiResponseValidator
{
    return new OpenApiResponseValidator(dirname(__DIR__, 3).'/contracts/openapi.yaml');
}

function accountPsrResponse(TestResponse $response): Response
{
    return new Response(
        $response->getStatusCode(),
        $response->headers->all(),
        $response->getContent(),
    );
}

test('the real account time response satisfies the OpenAPI contract', function () {
    $this->app->instance(Clock::class, new class implements Clock
    {
        public function now(): DateTimeImmutable
        {
            return new DateTimeImmutable('2026-09-20T17:00:00+00:00');
        }
    });
    $owner = User::factory()->owner()->create();
    DB::table('account_states')->insert([
        'owner_id' => $owner->id,
        'timezone' => 'Asia/Ho_Chi_Minh',
    ]);

    $response = $this->actingAs($owner)->getJson('/api/v1/account');

    accountContractValidator()->validate('GET', '/api/v1/account', accountPsrResponse($response));
    expect(true)->toBeTrue();
});

test('the unauthenticated account response satisfies the OpenAPI contract', function () {
    $response = $this->getJson('/api/v1/account');

    accountContractValidator()->validate('GET', '/api/v1/account', accountPsrResponse($response));
    expect(true)->toBeTrue();
});
