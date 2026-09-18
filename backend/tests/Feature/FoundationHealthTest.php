<?php

test('foundation health returns the canonical JSON payload', function () {
    $response = $this->getJson('/api/v1/foundation');

    $response
        ->assertOk()
        ->assertHeader('content-type', 'application/json')
        ->assertExactJson([
            'status' => 'ok',
            'service' => 'noteflow-api',
        ]);
});
