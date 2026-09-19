<?php

use App\Models\User;
use App\Modules\Identity\Contracts\Clock;
use DateTimeImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;

uses(RefreshDatabase::class);

test('the account context endpoint is private and never cacheable for guests', function () {
    $response = $this->getJson('/api/v1/account');

    $response
        ->assertUnauthorized()
        ->assertJsonMissingPath('timezone')
        ->assertJsonMissingPath('account_date')
        ->assertJsonMissingPath('week');

    expect($response->headers->get('cache-control'))
        ->toContain('private')
        ->toContain('no-store');
});

test('the owner receives one server-authoritative account date and Monday to Sunday week', function () {
    $clock = new class implements Clock
    {
        public int $calls = 0;

        public function now(): DateTimeImmutable
        {
            $this->calls++;

            return $this->calls === 1
                ? new DateTimeImmutable('2026-09-20T16:59:59+00:00')
                : new DateTimeImmutable('2026-09-20T17:00:00+00:00');
        }
    };
    $this->app->instance(Clock::class, $clock);

    $owner = User::factory()->owner()->create();
    DB::table('account_states')->insert([
        'owner_id' => $owner->id,
        'timezone' => 'Asia/Ho_Chi_Minh',
    ]);

    $response = $this->actingAs($owner)
        ->withHeader('X-Timezone', 'America/Los_Angeles')
        ->getJson('/api/v1/account?timezone=Asia%2FBangkok');

    $response->assertOk()->assertExactJson([
        'timezone' => 'Asia/Ho_Chi_Minh',
        'account_date' => '2026-09-20',
        'week' => [
            'start_date' => '2026-09-14',
            'end_date' => '2026-09-20',
        ],
    ]);
    expect($clock->calls)->toBe(1);
    expect($response->headers->get('cache-control'))
        ->toContain('private')
        ->toContain('no-store');
});

test('a non owner cannot read account time context', function () {
    $response = $this->actingAs(User::factory()->create())->getJson('/api/v1/account');

    $response
        ->assertForbidden()
        ->assertJsonMissingPath('timezone')
        ->assertJsonMissingPath('account_date')
        ->assertJsonMissingPath('week');
});

test('a missing account state fails closed instead of falling back to runtime time', function () {
    $owner = User::factory()->owner()->create();
    $this->withoutExceptionHandling();

    expect(fn () => $this->actingAs($owner)->getJson('/api/v1/account'))
        ->toThrow(LogicException::class, 'The provisioned owner is missing account state.');
});
