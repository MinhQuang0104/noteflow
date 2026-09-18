<?php

use App\Models\User;
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
        ->and(Hash::check('strong-password', $owner->password))->toBeTrue();
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
        ->and(User::query()->where('is_owner', true)->sole()->email)->toBe('new-owner@example.test')
        ->and(DB::table('sessions')->count())->toBe(0);
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
