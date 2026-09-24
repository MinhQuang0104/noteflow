<?php

use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

uses(RefreshDatabase::class);

test('account_states includes revision fields with safe defaults and check constraints', function () {
    $owner = User::factory()->owner()->create();
    DB::table('account_states')->insert([
        'owner_id' => $owner->id,
        'timezone' => 'Asia/Ho_Chi_Minh',
    ]);

    $state = DB::table('account_states')->where('owner_id', $owner->id)->first();

    expect($state)->not->toBeNull()
        ->and((int) $state->account_revision)->toBe(0)
        ->and((int) $state->data_epoch)->toBe(1)
        ->and($state->write_state)->toBe('open');

    // Database rejects invalid write_state
    expect(fn () => DB::table('account_states')->where('owner_id', $owner->id)->update(['write_state' => 'invalid_state']))
        ->toThrow(QueryException::class);
});

test('challenges and initial target periods enforce relational invariants and owner scoping', function () {
    $owner = User::factory()->owner()->create();
    $otherUser = User::factory()->create(['is_owner' => false]);
    $challengeId = (string) Str::uuid();

    DB::table('challenges')->insert([
        'id' => $challengeId,
        'owner_id' => $owner->id,
        'name' => 'Chạy bộ mỗi ngày',
        'description' => 'Mục tiêu chạy bộ',
        'start_date' => '2026-09-19',
        'row_version' => 1,
        'created_at' => now(),
        'updated_at' => now(),
    ]);

    DB::table('challenge_target_periods')->insert([
        'owner_id' => $owner->id,
        'challenge_id' => $challengeId,
        'target_days' => 4,
        'effective_from' => '2026-09-19',
        'created_at' => now(),
        'updated_at' => now(),
    ]);

    $challenge = DB::table('challenges')->where('id', $challengeId)->first();
    expect($challenge)->not->toBeNull()
        ->and($challenge->name)->toBe('Chạy bộ mỗi ngày')
        ->and((int) $challenge->row_version)->toBe(1);

    $targetPeriod = DB::table('challenge_target_periods')->where('challenge_id', $challengeId)->first();
    expect($targetPeriod)->not->toBeNull()
        ->and((int) $targetPeriod->target_days)->toBe(4)
        ->and($targetPeriod->effective_from)->toBe('2026-09-19');

    // Target days outside 1-7 is rejected by database constraint
    expect(fn () => DB::table('challenge_target_periods')->insert([
        'owner_id' => $owner->id,
        'challenge_id' => $challengeId,
        'target_days' => 0,
        'effective_from' => '2026-09-22',
        'created_at' => now(),
        'updated_at' => now(),
    ]))->toThrow(QueryException::class);

    expect(fn () => DB::table('challenge_target_periods')->insert([
        'owner_id' => $owner->id,
        'challenge_id' => $challengeId,
        'target_days' => 8,
        'effective_from' => '2026-09-22',
        'created_at' => now(),
        'updated_at' => now(),
    ]))->toThrow(QueryException::class);

    // Duplicate (challenge_id, effective_from) is rejected by unique constraint
    expect(fn () => DB::table('challenge_target_periods')->insert([
        'owner_id' => $owner->id,
        'challenge_id' => $challengeId,
        'target_days' => 5,
        'effective_from' => '2026-09-19',
        'created_at' => now(),
        'updated_at' => now(),
    ]))->toThrow(QueryException::class);

    // Composite FK rejects owner mismatch between challenge and target period
    expect(fn () => DB::table('challenge_target_periods')->insert([
        'owner_id' => $otherUser->id, // Mismatched user!
        'challenge_id' => $challengeId, // Challenge belongs to $owner->id
        'target_days' => 5,
        'effective_from' => '2026-09-22',
        'created_at' => now(),
        'updated_at' => now(),
    ]))->toThrow(QueryException::class);
});

test('mutation_commands enforces unique (owner_id, data_epoch, command_id)', function () {
    $owner = User::factory()->owner()->create();
    $commandId = (string) Str::uuid();

    DB::table('mutation_commands')->insert([
        'owner_id' => $owner->id,
        'data_epoch' => 1,
        'command_id' => $commandId,
        'command_type' => 'create_challenge',
        'request_hash' => hash('sha256', 'test-payload'),
        'resource_id' => (string) Str::uuid(),
        'response_payload' => json_encode(['status' => 'ok']),
        'response_status' => 201,
        'created_at' => now(),
    ]);

    expect(fn () => DB::table('mutation_commands')->insert([
        'owner_id' => $owner->id,
        'data_epoch' => 1,
        'command_id' => $commandId,
        'command_type' => 'create_challenge',
        'request_hash' => hash('sha256', 'different-payload'),
        'resource_id' => (string) Str::uuid(),
        'response_payload' => json_encode(['status' => 'ok']),
        'response_status' => 201,
        'created_at' => now(),
    ]))->toThrow(QueryException::class);
});

test('daily records keep journal and completion versions separate with owner-scoped challenge and day uniqueness', function () {
    $owner = User::factory()->owner()->create();
    $other = User::factory()->create(['is_owner' => false]);
    $challengeId = (string) Str::uuid();
    DB::table('challenges')->insert([
        'id' => $challengeId,
        'owner_id' => $owner->id,
        'name' => 'Daily record',
        'start_date' => '2026-09-19',
        'row_version' => 1,
        'created_at' => now(),
        'updated_at' => now(),
    ]);

    $record = [
        'owner_id' => $owner->id,
        'challenge_id' => $challengeId,
        'local_date' => '2026-09-19',
        'journal' => 'Today',
        'created_at' => now(),
        'updated_at' => now(),
    ];
    DB::table('challenge_daily_records')->insert($record);
    $saved = DB::table('challenge_daily_records')->where('challenge_id', $challengeId)->first();
    expect((bool) $saved->is_done)->toBeFalse()
        ->and((int) $saved->completion_version)->toBe(0)
        ->and((int) $saved->journal_version)->toBe(0)
        ->and((int) $saved->row_version)->toBe(1);

    expect(fn () => DB::table('challenge_daily_records')->insert($record))->toThrow(QueryException::class);
    expect(fn () => DB::table('challenge_daily_records')->insert(array_replace($record, [
        'owner_id' => $other->id,
        'local_date' => '2026-09-20',
    ])))->toThrow(QueryException::class);
});

test('migrations roll back and remigrate cleanly', function () {
    $owner = User::factory()->owner()->create();

    $m4 = require database_path('migrations/2026_09_24_010000_create_challenge_daily_records_table.php');
    $m3 = require database_path('migrations/2026_09_19_030000_create_mutation_commands_table.php');
    $m2 = require database_path('migrations/2026_09_19_020000_create_challenges_and_target_periods_tables.php');
    $m1 = require database_path('migrations/2026_09_19_010000_add_revision_fields_to_account_states_table.php');

    // Rollback
    $m4->down();
    expect(Schema::hasTable('challenge_daily_records'))->toBeFalse();

    $m3->down();
    expect(Schema::hasTable('mutation_commands'))->toBeFalse();

    $m2->down();
    expect(Schema::hasTable('challenges'))->toBeFalse()
        ->and(Schema::hasTable('challenge_target_periods'))->toBeFalse();

    $m1->down();
    expect(Schema::hasColumn('account_states', 'account_revision'))->toBeFalse();

    // Re-migrate
    $m1->up();
    expect(Schema::hasColumn('account_states', 'account_revision'))->toBeTrue()
        ->and(Schema::hasColumn('account_states', 'data_epoch'))->toBeTrue()
        ->and(Schema::hasColumn('account_states', 'write_state'))->toBeTrue();

    $m2->up();
    expect(Schema::hasTable('challenges'))->toBeTrue()
        ->and(Schema::hasTable('challenge_target_periods'))->toBeTrue();

    $m3->up();
    expect(Schema::hasTable('mutation_commands'))->toBeTrue();

    $m4->up();
    expect(Schema::hasTable('challenge_daily_records'))->toBeTrue();
});
