<?php

use GuzzleHttp\Psr7\Response;
use League\OpenAPIValidation\PSR7\Exception\ValidationFailed;
use Tests\Contract\OpenApiResponseValidator;

function cacheControlContractValidator(): OpenApiResponseValidator
{
    return new OpenApiResponseValidator(dirname(__DIR__, 3).'/contracts/openapi.yaml');
}

test('private API contract rejects Cache-Control headers missing either private or no-store', function () {
    $body = json_encode([
        'timezone' => 'Asia/Ho_Chi_Minh',
        'account_date' => '2026-09-20',
        'week' => ['start_date' => '2026-09-14', 'end_date' => '2026-09-20'],
        'account_revision' => 0,
        'data_epoch' => 1,
        'write_state' => 'open',
    ], JSON_THROW_ON_ERROR);

    foreach (['private', 'no-store', 'public, no-store'] as $cacheControl) {
        expect(fn () => cacheControlContractValidator()->validate(
            'GET',
            '/api/v1/account',
            new Response(200, [
                'Content-Type' => 'application/json',
                'Cache-Control' => $cacheControl,
            ], $body),
        ))->toThrow(ValidationFailed::class);
    }
});
