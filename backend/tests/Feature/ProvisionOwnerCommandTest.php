<?php

use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

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
