<?php

use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

test('local same-origin proxy hosts are configured as stateful Sanctum clients', function () {
    expect(config('sanctum.stateful'))
        ->toContain('127.0.0.1:5173')
        ->toContain('127.0.0.1:4173');
});

test('the provisioned owner can log in and receives a rotated session', function () {
    $owner = User::factory()->owner()->create([
        'email' => 'owner@example.test',
        'password' => 'correct-password',
    ]);
    $oldSessionId = session()->getId();

    $response = $this->postJson('/login', [
        'email' => ' OWNER@example.test ',
        'password' => 'correct-password',
        'redirect_to' => '/notes',
    ]);

    $response
        ->assertOk()
        ->assertExactJson([
            'owner' => [
                'id' => $owner->id,
                'name' => $owner->name,
                'email' => $owner->email,
            ],
            'redirect_to' => '/notes',
        ]);

    expect($response->headers->get('cache-control'))
        ->toContain('private')
        ->toContain('no-store');

    $this->assertAuthenticatedAs($owner);
    expect(session()->getId())->not->toBe($oldSessionId);
});

test('login falls back to today when the requested destination is not a private route', function () {
    User::factory()->owner()->create([
        'email' => 'owner@example.test',
        'password' => 'correct-password',
    ]);

    $this->postJson('/login', [
        'email' => 'owner@example.test',
        'password' => 'correct-password',
        'redirect_to' => 'https://attacker.example/steal',
    ])->assertOk()->assertJsonPath('redirect_to', '/today');
});

test('valid credentials for a non owner are rejected without creating a session', function () {
    User::factory()->create([
        'email' => 'other@example.test',
        'password' => 'correct-password',
    ]);

    $response = $this->postJson('/login', [
        'email' => 'other@example.test',
        'password' => 'correct-password',
    ]);
    $response->assertUnprocessable()->assertJsonValidationErrors('email');
    expect($response->headers->get('cache-control'))
        ->toContain('private')
        ->toContain('no-store');

    $this->assertGuest();
});

test('private session data is protected and never cacheable', function () {
    $guestResponse = $this->getJson('/api/v1/session');
    $guestResponse
        ->assertUnauthorized()
        ->assertJsonMissingPath('owner');
    expect($guestResponse->headers->get('cache-control'))
        ->toContain('private')
        ->toContain('no-store');

    $owner = User::factory()->owner()->create();

    $ownerResponse = $this->actingAs($owner)->getJson('/api/v1/session');
    $ownerResponse
        ->assertOk()
        ->assertExactJson([
            'owner' => [
                'id' => $owner->id,
                'name' => $owner->name,
                'email' => $owner->email,
            ],
        ]);
    expect($ownerResponse->headers->get('cache-control'))
        ->toContain('private')
        ->toContain('no-store');
});

test('a non owner session cannot cross the owner admission boundary', function () {
    $otherUser = User::factory()->create();

    $response = $this->actingAs($otherUser)->getJson('/api/v1/session');
    $response
        ->assertForbidden()
        ->assertJsonMissingPath('owner');
    expect($response->headers->get('cache-control'))
        ->toContain('private')
        ->toContain('no-store');
});

test('logout invalidates the current session and regenerates the csrf token', function () {
    $owner = User::factory()->owner()->create();
    $this->actingAs($owner);
    session()->put('_token', 'before-logout');
    $sessionId = session()->getId();

    $response = $this->postJson('/logout');
    $response->assertNoContent();
    expect($response->headers->get('cache-control'))
        ->toContain('private')
        ->toContain('no-store');

    $this->assertGuest();
    expect(session()->getId())->not->toBe($sessionId)
        ->and(session()->token())->not->toBe('before-logout');
});

test('public account creation and password reset routes do not exist', function (string $method, string $uri) {
    $this->json($method, $uri)->assertNotFound();
})->with([
    ['POST', '/register'],
    ['POST', '/forgot-password'],
    ['POST', '/reset-password'],
]);

test('the database rejects a second provisioned owner', function () {
    User::factory()->owner()->create();

    expect(fn () => User::factory()->owner()->create())->toThrow(QueryException::class);
});

test('login is csrf protected when the framework test bypass is disabled', function () {
    User::factory()->owner()->create([
        'email' => 'owner@example.test',
        'password' => 'correct-password',
    ]);

    $this->app->instance('env', 'local');
    $response = $this->withMiddleware(ValidateCsrfToken::class)
        ->postJson('/login', [
            'email' => 'owner@example.test',
            'password' => 'correct-password',
        ]);
    $response->assertStatus(419)->assertExactJson([
        'message' => 'Phiên bảo mật đã hết hạn. Vui lòng thử lại.',
        'code' => 'csrf_expired',
    ]);
    expect($response->headers->get('cache-control'))
        ->toContain('private')
        ->toContain('no-store');
});

test('login attempts are throttled by normalized email and ip', function () {
    User::factory()->owner()->create([
        'email' => 'owner@example.test',
        'password' => 'correct-password',
    ]);

    foreach (range(1, 5) as $attempt) {
        $this->postJson('/login', [
            'email' => $attempt % 2 === 0 ? ' OWNER@example.test ' : 'owner@example.test',
            'password' => 'wrong-password',
        ])->assertUnprocessable();
    }

    $response = $this->postJson('/login', [
        'email' => 'owner@example.test',
        'password' => 'wrong-password',
    ]);
    $response->assertTooManyRequests();
    expect($response->headers->get('cache-control'))
        ->toContain('private')
        ->toContain('no-store');
});
