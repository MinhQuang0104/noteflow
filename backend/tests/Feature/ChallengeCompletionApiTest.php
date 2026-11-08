<?php

use App\Models\User;
use App\Modules\Identity\Contracts\Clock;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

uses(RefreshDatabase::class);

beforeEach(function () {
    // 2026-09-21 03:00 in Asia/Ho_Chi_Minh: account-today is Monday 2026-09-21.
    $this->app->instance(Clock::class, new class implements Clock
    {
        public function now(): DateTimeImmutable
        {
            return new DateTimeImmutable('2026-09-20T20:00:00+00:00');
        }
    });
});

function completionApiOwner(int $epoch = 1, string $writeState = 'open'): User
{
    $owner = User::factory()->owner()->create();
    DB::table('account_states')->updateOrInsert(['owner_id' => $owner->id], [
        'timezone' => 'Asia/Ho_Chi_Minh',
        'account_revision' => 0,
        'data_epoch' => $epoch,
        'write_state' => $writeState,
    ]);

    return $owner;
}

function completionApiChallenge(User $owner, string $startDate = '2026-09-19', int $targetDays = 3): string
{
    $id = (string) Str::uuid();
    DB::table('challenges')->insert([
        'id' => $id,
        'owner_id' => $owner->id,
        'name' => 'Read daily',
        'start_date' => $startDate,
        'row_version' => 1,
        'created_at' => now(),
        'updated_at' => now(),
    ]);
    DB::table('challenge_target_periods')->insert([
        'owner_id' => $owner->id,
        'challenge_id' => $id,
        'effective_from' => $startDate,
        'target_days' => $targetDays,
        'created_at' => now(),
        'updated_at' => now(),
    ]);

    return $id;
}

function completionApiPayload(?string $commandId = null, int $epoch = 1, bool $isDone = true): array
{
    return [
        'command_id' => $commandId ?? (string) Str::uuid(),
        'data_epoch' => $epoch,
        'is_done' => $isDone,
    ];
}

test('Done over HTTP records account-today once and returns the shared projection', function () {
    $owner = completionApiOwner();
    $id = completionApiChallenge($owner);
    $url = "/api/v1/challenges/{$id}/completions/2026-09-21";

    $response = $this->actingAs($owner)->putJson($url, completionApiPayload());
    $response->assertOk()
        ->assertExactJson([
            'completion' => ['challenge_id' => $id, 'local_date' => '2026-09-21', 'is_done' => true, 'completion_version' => 1],
            'week_progress' => ['start_date' => '2026-09-21', 'end_date' => '2026-09-27', 'done_days' => 1, 'target_days' => 3],
            'account_revision' => 1,
            'data_epoch' => 1,
        ]);
    expect($response->headers->get('cache-control'))->toContain('no-store');

    // A second Done for the same day with a new command converges without a new completion or revision.
    $this->actingAs($owner)->putJson($url, completionApiPayload())->assertOk()
        ->assertJsonPath('completion.completion_version', 1)
        ->assertJsonPath('week_progress.done_days', 1)
        ->assertJsonPath('account_revision', 1);
    expect(DB::table('challenge_daily_records')->where('challenge_id', $id)->count())->toBe(1)
        ->and((int) DB::table('account_states')->where('owner_id', $owner->id)->value('account_revision'))->toBe(1);
});

test('Done over HTTP replays an identical command and rejects a reused command ID', function () {
    $owner = completionApiOwner();
    $id = completionApiChallenge($owner);
    $url = "/api/v1/challenges/{$id}/completions/2026-09-21";
    $command = completionApiPayload();

    $first = $this->actingAs($owner)->putJson($url, $command)->assertOk();
    $replay = $this->actingAs($owner)->putJson($url, $command)->assertOk();
    expect($replay->json())->toEqual($first->json());

    $other = completionApiChallenge($owner);
    $this->actingAs($owner)->putJson("/api/v1/challenges/{$other}/completions/2026-09-21", $command)
        ->assertStatus(409)
        ->assertHeader('content-type', 'application/problem+json')
        ->assertExactJson(['code' => 'idempotency_key_reused', 'message' => 'Idempotency key has already been used with a different request payload.']);
    expect(DB::table('challenge_daily_records')->where('challenge_id', $other)->count())->toBe(0)
        ->and(DB::table('mutation_commands')->where('owner_id', $owner->id)->count())->toBe(1);
});

test('Done over HTTP is authenticated, owner scoped and private', function () {
    $owner = completionApiOwner();
    $id = completionApiChallenge($owner);
    $url = "/api/v1/challenges/{$id}/completions/2026-09-21";

    $this->putJson($url, completionApiPayload())->assertUnauthorized();
    $intruder = User::factory()->create(['is_owner' => false]);
    $this->actingAs($intruder)->putJson($url, completionApiPayload())->assertForbidden();

    $this->actingAsGuest('web');
    $this->actingAsGuest('sanctum');
    $foreign = (string) Str::uuid();
    DB::table('challenges')->insert([
        'id' => $foreign, 'owner_id' => $intruder->id, 'name' => 'Not mine', 'start_date' => '2026-09-19',
        'row_version' => 1, 'created_at' => now(), 'updated_at' => now(),
    ]);
    $this->actingAs($owner)->putJson("/api/v1/challenges/{$foreign}/completions/2026-09-21", completionApiPayload())
        ->assertNotFound();
    $this->actingAs($owner)->putJson('/api/v1/challenges/'.Str::uuid().'/completions/2026-09-21', completionApiPayload())
        ->assertNotFound();
    $this->actingAs($owner)->putJson('/api/v1/challenges/not-a-uuid/completions/2026-09-21', completionApiPayload())
        ->assertNotFound();
    expect(DB::table('challenge_daily_records')->count())->toBe(0)
        ->and(DB::table('mutation_commands')->count())->toBe(0);
});

test('Done over HTTP rejects unknown fields, other days, is_done false and malformed input', function () {
    $owner = completionApiOwner();
    $id = completionApiChallenge($owner);
    $base = "/api/v1/challenges/{$id}/completions";

    $this->actingAs($owner)->putJson("{$base}/2026-09-21", completionApiPayload() + ['journal' => 'x'])
        ->assertStatus(422)->assertJsonValidationErrors(['journal']);
    foreach (['2026-09-20', '2026-09-22', 'not-a-date'] as $day) {
        $this->actingAs($owner)->putJson("{$base}/{$day}", completionApiPayload())
            ->assertStatus(422)->assertJsonValidationErrors(['local_date']);
    }
    $this->actingAs($owner)->putJson("{$base}/2026-09-21", completionApiPayload(isDone: false))
        ->assertStatus(422)->assertJsonValidationErrors(['is_done']);
    $this->actingAs($owner)->putJson("{$base}/2026-09-21", ['command_id' => (string) Str::uuid(), 'data_epoch' => 1, 'is_done' => 'true'])
        ->assertStatus(422)->assertJsonValidationErrors(['is_done']);
    $this->actingAs($owner)->putJson("{$base}/2026-09-21", ['command_id' => 'nope', 'data_epoch' => 0])
        ->assertStatus(422)->assertJsonValidationErrors(['command_id', 'data_epoch', 'is_done']);

    $late = completionApiChallenge($owner, '2026-09-22');
    $this->actingAs($owner)->putJson("/api/v1/challenges/{$late}/completions/2026-09-21", completionApiPayload())
        ->assertStatus(422)->assertJsonValidationErrors(['local_date']);
    expect(DB::table('challenge_daily_records')->count())->toBe(0)
        ->and(DB::table('mutation_commands')->count())->toBe(0);
});

test('Done over HTTP returns problem details for a stale epoch and the write fence', function () {
    $owner = completionApiOwner(epoch: 2);
    $id = completionApiChallenge($owner);
    $url = "/api/v1/challenges/{$id}/completions/2026-09-21";

    $this->actingAs($owner)->putJson($url, completionApiPayload(epoch: 1))
        ->assertStatus(409)->assertHeader('content-type', 'application/problem+json')
        ->assertJsonPath('code', 'stale_data_epoch');
    DB::table('account_states')->where('owner_id', $owner->id)->update(['write_state' => 'locked_for_import']);
    $this->actingAs($owner)->putJson($url, completionApiPayload(epoch: 2))
        ->assertStatus(423)->assertHeader('content-type', 'application/problem+json')
        ->assertJsonPath('code', 'write_fence_active');
    expect(DB::table('challenge_daily_records')->count())->toBe(0);
});

test('challenge list carries the shared week progress and today state for each challenge', function () {
    $owner = completionApiOwner();
    $id = completionApiChallenge($owner, '2026-09-19', 4);

    $list = $this->actingAs($owner)->getJson('/api/v1/challenges')->assertOk();
    $list->assertJsonPath('challenges.0.id', $id)
        ->assertJsonPath('challenges.0.week_progress', ['start_date' => '2026-09-21', 'end_date' => '2026-09-27', 'done_days' => 0, 'target_days' => 4])
        ->assertJsonPath('challenges.0.today', ['local_date' => '2026-09-21', 'is_done' => false, 'completion_version' => 0]);

    $this->actingAs($owner)->putJson("/api/v1/challenges/{$id}/completions/2026-09-21", completionApiPayload())->assertOk();
    $this->actingAs($owner)->getJson('/api/v1/challenges')->assertOk()
        ->assertJsonPath('challenges.0.week_progress.done_days', 1)
        ->assertJsonPath('challenges.0.today', ['local_date' => '2026-09-21', 'is_done' => true, 'completion_version' => 1]);
});
