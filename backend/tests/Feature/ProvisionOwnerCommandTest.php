<?php

use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

uses(RefreshDatabase::class);

test('the command provisions one owner without exposing the password as an option', function () {
    $this->artisan('noteflow:provision-owner', [
        'email' => ' OWNER@example.test ',
        '--name' => 'NoteFlow Owner',
    ])
        ->expectsQuestion('Owner password', 'strong-password')
        ->expectsQuestion('Confirm owner password', 'strong-password')
        ->expectsOutput('NoteFlow owner provisioned.')
        ->assertSuccessful();

    $owner = User::query()->sole();
    expect($owner->email)->toBe('owner@example.test')
        ->and($owner->name)->toBe('NoteFlow Owner')
        ->and($owner->is_owner)->toBeTrue()
        ->and(Hash::check('strong-password', $owner->password))->toBeTrue()
        ->and(DB::table('account_states')->where('owner_id', $owner->id)->sole()->timezone)
        ->toBe('Asia/Ho_Chi_Minh');
});

test('reprovisioning transfers owner admission and invalidates the old owner boundary', function () {
    $oldOwner = User::factory()->owner()->create();
    DB::table('sessions')->insert([
        'id' => 'old-owner-session',
        'user_id' => $oldOwner->id,
        'ip_address' => '127.0.0.1',
        'user_agent' => 'test',
        'payload' => 'test-payload',
        'last_activity' => now()->timestamp,
    ]);

    $this->artisan('noteflow:provision-owner', ['email' => 'new-owner@example.test'])
        ->expectsQuestion('Owner password', 'another-strong-password')
        ->expectsQuestion('Confirm owner password', 'another-strong-password')
        ->assertSuccessful();

    expect($oldOwner->refresh()->is_owner)->toBeFalse()
        ->and($newOwner = User::query()->where('is_owner', true)->sole())
        ->and($newOwner->email)->toBe('new-owner@example.test')
        ->and(DB::table('account_states')->pluck('owner_id')->all())->toBe([$newOwner->id])
        ->and(DB::table('account_states')->where('owner_id', $newOwner->id)->value('timezone'))
        ->toBe('Asia/Ho_Chi_Minh')
        ->and(DB::table('sessions')->count())->toBe(0);
});

test('the account state migration backfills an existing owner deterministically', function () {
    $migration = require database_path('migrations/2026_09_18_010000_create_account_states_table.php');
    $migration->down();
    $owner = User::factory()->owner()->create();

    $migration->up();

    expect(DB::table('account_states')->get()->map(fn (object $state): array => [
        'owner_id' => $state->owner_id,
        'timezone' => $state->timezone,
    ])->all())->toBe([[
        'owner_id' => $owner->id,
        'timezone' => 'Asia/Ho_Chi_Minh',
    ]]);
});

test('the database rejects a timezone other than the approved IANA identity', function () {
    $owner = User::factory()->owner()->create();

    expect(fn () => DB::table('account_states')->insert([
        'owner_id' => $owner->id,
        'timezone' => 'Asia/Bangkok',
    ]))->toThrow(QueryException::class);
});

test('invalid password confirmation does not change owner admission', function () {
    $owner = User::factory()->owner()->create();

    $this->artisan('noteflow:provision-owner', ['email' => 'new-owner@example.test'])
        ->expectsQuestion('Owner password', 'strong-password')
        ->expectsQuestion('Confirm owner password', 'different-password')
        ->expectsOutput('Passwords must match and contain at least 12 characters.')
        ->assertFailed();

    expect($owner->refresh()->is_owner)->toBeTrue()
        ->and(User::query()->count())->toBe(1);
});

test('reprovisioning A to B to A preserves scoped datasets and advances the owner epoch', function () {
    $insertChallenge = function (User $owner, string $name): string {
        $id = (string) Str::uuid();
        DB::table('challenges')->insert([
            'id' => $id,
            'owner_id' => $owner->id,
            'name' => $name,
            'description' => null,
            'start_date' => '2026-09-19',
            'row_version' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return $id;
    };
    $insertToken = function (User $owner, string $plainToken): void {
        DB::table('personal_access_tokens')->insert([
            'tokenable_type' => User::class,
            'tokenable_id' => $owner->id,
            'name' => 'audit-test',
            'token' => hash('sha256', $plainToken),
            'abilities' => json_encode(['*'], JSON_THROW_ON_ERROR),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    };

    $this->artisan('noteflow:provision-owner', ['email' => 'owner-a@example.test'])
        ->expectsQuestion('Owner password', 'owner-a-password')
        ->expectsQuestion('Confirm owner password', 'owner-a-password')
        ->assertSuccessful();
    $ownerA = User::query()->where('email', 'owner-a@example.test')->sole();
    $challengeA = $insertChallenge($ownerA, 'A dataset');
    DB::table('account_states')->where('owner_id', $ownerA->id)->update([
        'account_revision' => 7,
        'data_epoch' => 4,
    ]);
    $tokenA = 'audit-token-a-'.Str::random(32);
    $insertToken($ownerA, $tokenA);
    DB::table('sessions')->insert([
        'id' => 'owner-a-session',
        'user_id' => $ownerA->id,
        'ip_address' => '127.0.0.1',
        'user_agent' => 'test',
        'payload' => 'test-payload',
        'last_activity' => now()->timestamp,
    ]);

    $this->withHeader('Authorization', "Bearer {$tokenA}")
        ->getJson('/api/v1/session')->assertOk();

    $this->artisan('noteflow:provision-owner', ['email' => 'owner-b@example.test'])
        ->expectsQuestion('Owner password', 'owner-b-password')
        ->expectsQuestion('Confirm owner password', 'owner-b-password')
        ->assertSuccessful();
    $ownerB = User::query()->where('email', 'owner-b@example.test')->sole();

    expect($ownerA->refresh()->is_owner)->toBeFalse()
        ->and($ownerB->is_owner)->toBeTrue()
        ->and((int) DB::table('account_states')->where('owner_id', $ownerA->id)->value('data_epoch'))->toBe(4)
        ->and((int) DB::table('account_states')->where('owner_id', $ownerB->id)->value('data_epoch'))->toBe(1)
        ->and(DB::table('sessions')->where('user_id', $ownerA->id)->exists())->toBeFalse()
        ->and(DB::table('personal_access_tokens')->where('tokenable_id', $ownerA->id)->exists())->toBeFalse();
    $this->app['auth']->forgetGuards();
    $this->withHeader('Authorization', "Bearer {$tokenA}")
        ->getJson('/api/v1/session')->assertUnauthorized();

    $challengeB = $insertChallenge($ownerB, 'B dataset');
    $tokenB = 'audit-token-b-'.Str::random(32);
    $insertToken($ownerB, $tokenB);
    DB::table('sessions')->insert([
        'id' => 'owner-b-session',
        'user_id' => $ownerB->id,
        'ip_address' => '127.0.0.1',
        'user_agent' => 'test',
        'payload' => 'test-payload',
        'last_activity' => now()->timestamp,
    ]);
    $this->withHeader('Authorization', "Bearer {$tokenB}")
        ->getJson('/api/v1/challenges')->assertOk()->assertJsonPath('challenges.0.id', $challengeB);

    $this->artisan('noteflow:provision-owner', ['email' => 'owner-a@example.test'])
        ->expectsQuestion('Owner password', 'owner-a-password-new')
        ->expectsQuestion('Confirm owner password', 'owner-a-password-new')
        ->assertSuccessful();
    $ownerA->refresh();
    $ownerB->refresh();

    expect($ownerA->is_owner)->toBeTrue()
        ->and($ownerB->is_owner)->toBeFalse()
        ->and((int) DB::table('account_states')->where('owner_id', $ownerA->id)->value('data_epoch'))->toBe(5)
        ->and((int) DB::table('account_states')->where('owner_id', $ownerA->id)->value('account_revision'))->toBe(7)
        ->and(DB::table('sessions')->where('user_id', $ownerB->id)->exists())->toBeFalse()
        ->and(DB::table('personal_access_tokens')->where('tokenable_id', $ownerB->id)->exists())->toBeFalse();
    $this->app['auth']->forgetGuards();
    $this->withHeader('Authorization', "Bearer {$tokenA}")
        ->getJson('/api/v1/session')->assertUnauthorized();
    $this->withHeader('Authorization', "Bearer {$tokenB}")
        ->getJson('/api/v1/session')->assertUnauthorized();

    $this->actingAs($ownerA)->getJson('/api/v1/challenges')
        ->assertOk()
        ->assertJsonCount(1, 'challenges')
        ->assertJsonPath('challenges.0.id', $challengeA);
    $this->actingAs($ownerA)->getJson("/api/v1/challenges/{$challengeB}")->assertNotFound();
    $this->actingAs($ownerB)->getJson('/api/v1/challenges')->assertForbidden();

    $this->actingAs($ownerA)->postJson('/api/v1/challenges', [
        'command_id' => (string) Str::uuid(),
        'data_epoch' => 4,
        'name' => 'Replayed old boundary',
        'target_days' => 3,
    ])->assertStatus(409)->assertJsonPath('code', 'stale_data_epoch');
    expect(DB::table('challenges')->where('name', 'Replayed old boundary')->exists())->toBeFalse();
});
