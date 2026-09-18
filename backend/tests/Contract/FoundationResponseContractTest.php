<?php

use GuzzleHttp\Psr7\Response;
use League\OpenAPIValidation\PSR7\Exception\ValidationFailed;
use Tests\Contract\OpenApiResponseValidator;

function foundationContractValidator(): OpenApiResponseValidator
{
    return new OpenApiResponseValidator(dirname(__DIR__, 3).'/contracts/openapi.yaml');
}

test('the real foundation response satisfies the OpenAPI contract', function () {
    $laravelResponse = $this->getJson('/api/v1/foundation');
    $psrResponse = new Response(
        $laravelResponse->getStatusCode(),
        ['Content-Type' => $laravelResponse->headers->get('content-type')],
        $laravelResponse->getContent(),
    );

    foundationContractValidator()->validate('GET', '/api/v1/foundation', $psrResponse);

    expect(true)->toBeTrue();
});

test('a foundation response with a wrong service is rejected', function () {
    $invalidResponse = new Response(
        200,
        ['Content-Type' => 'application/json'],
        json_encode(['status' => 'ok', 'service' => 'wrong-api'], JSON_THROW_ON_ERROR),
    );

    expect(fn () => foundationContractValidator()->validate(
        'GET',
        '/api/v1/foundation',
        $invalidResponse,
    ))->toThrow(ValidationFailed::class);
});
