<?php

use App\Models\User;
use App\Modules\Identity\Contracts\Clock;
use DateTimeImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

uses(RefreshDatabase::class);

function setupChallengeOwner(string $timezone = 'Asia/Ho_Chi_Minh', int $epoch = 1, string $writeState = 'open'): User
{
    $owner = User::factory()->owner()->create();
    DB::table('account_states')->updateOrInsert(
        ['owner_id' => $owner->id],
        [
            'timezone' => $timezone,
            'account_revision' => 0,
            'data_epoch' => $epoch,
            'write_state' => $writeState,
        ]
    );

    return $owner;
}

test('guest cannot access challenge endpoints', function () {
    $this->getJson('/api/v1/challenges')->assertUnauthorized();
    $this->postJson('/api/v1/challenges', [])->assertUnauthorized();
    $this->getJson('/api/v1/challenges/'.Str::uuid())->assertUnauthorized();
    $this->patchJson('/api/v1/challenges/'.Str::uuid(), [])->assertUnauthorized();
});

test('non-owner cannot access challenge endpoints', function () {
    $user = User::factory()->create(['is_owner' => false]);

    $this->actingAs($user)->getJson('/api/v1/challenges')->assertForbidden();
    $this->actingAs($user)->postJson('/api/v1/challenges', [
        'command_id' => (string) Str::uuid(),
        'data_epoch' => 1,
        'name' => 'Chạy bộ',
        'target_days' => 3,
    ])->assertForbidden();
});

test('AC1 — create valid challenge with name, optional description, target 1-7', function () {
    $this->app->instance(Clock::class, new class implements Clock
    {
        public function now(): DateTimeImmutable
        {
            return new DateTimeImmutable('2026-09-19T10:00:00+00:00');
        }
    });

    $owner = setupChallengeOwner();
    $commandId = (string) Str::uuid();

    $response = $this->actingAs($owner)->postJson('/api/v1/challenges', [
        'command_id' => $commandId,
        'data_epoch' => 1,
        'name' => 'Tập thể dục 30 phút',
        'description' => 'Mỗi sáng thức dậy',
        'target_days' => 4,
    ]);

    $response->assertCreated()
        ->assertJsonPath('challenge.name', 'Tập thể dục 30 phút')
        ->assertJsonPath('challenge.description', 'Mỗi sáng thức dậy')
        ->assertJsonPath('challenge.start_date', '2026-09-19')
        ->assertJsonPath('challenge.target_days', 4)
        ->assertJsonPath('challenge.row_version', 1)
        ->assertJsonPath('account_revision', 1)
        ->assertJsonPath('data_epoch', 1);

    expect($response->headers->get('cache-control'))
        ->toContain('private')
        ->toContain('no-store');

    $challengeId = $response->json('challenge.id');

    // List reflects the created challenge
    $listResponse = $this->actingAs($owner)->getJson('/api/v1/challenges');
    $listResponse->assertOk()
        ->assertJsonCount(1, 'challenges')
        ->assertJsonPath('challenges.0.id', $challengeId)
        ->assertJsonPath('challenges.0.name', 'Tập thể dục 30 phút')
        ->assertJsonPath('challenges.0.target_days', 4);

    // Detail reflects the challenge
    $detailResponse = $this->actingAs($owner)->getJson('/api/v1/challenges/'.$challengeId);
    $detailResponse->assertOk()
        ->assertJsonPath('challenge.id', $challengeId)
        ->assertJsonPath('challenge.name', 'Tập thể dục 30 phút')
        ->assertJsonPath('challenge.target_days', 4);
});

test('AC2 — reject invalid target days and attach error to target_days field', function () {
    $owner = setupChallengeOwner();

    // Target > 7
    $res1 = $this->actingAs($owner)->postJson('/api/v1/challenges', [
        'command_id' => (string) Str::uuid(),
        'data_epoch' => 1,
        'name' => 'Challenge 1',
        'target_days' => 8,
    ]);
    $res1->assertStatus(422)
        ->assertJsonValidationErrors(['target_days']);

    // Target < 1
    $res2 = $this->actingAs($owner)->postJson('/api/v1/challenges', [
        'command_id' => (string) Str::uuid(),
        'data_epoch' => 1,
        'name' => 'Challenge 2',
        'target_days' => 0,
    ]);
    $res2->assertStatus(422)
        ->assertJsonValidationErrors(['target_days']);

    // Target not integer
    $res3 = $this->actingAs($owner)->postJson('/api/v1/challenges', [
        'command_id' => (string) Str::uuid(),
        'data_epoch' => 1,
        'name' => 'Challenge 3',
        'target_days' => 3.5,
    ]);
    $res3->assertStatus(422)
        ->assertJsonValidationErrors(['target_days']);

    // Empty name
    $res4 = $this->actingAs($owner)->postJson('/api/v1/challenges', [
        'command_id' => (string) Str::uuid(),
        'data_epoch' => 1,
        'name' => '   ',
        'target_days' => 3,
    ]);
    $res4->assertStatus(422)
        ->assertJsonValidationErrors(['name']);

    // Ensure no challenges created
    expect(DB::table('challenges')->count())->toBe(0);
});

test('AC3 — update metadata modifies name/description without changing start_date or target', function () {
    $owner = setupChallengeOwner();

    // Create challenge
    $createRes = $this->actingAs($owner)->postJson('/api/v1/challenges', [
        'command_id' => (string) Str::uuid(),
        'data_epoch' => 1,
        'name' => 'Tên gốc',
        'description' => 'Mô tả gốc',
        'target_days' => 3,
    ]);
    $challengeId = $createRes->json('challenge.id');
    $startDate = $createRes->json('challenge.start_date');

    // Update metadata
    $updateRes = $this->actingAs($owner)->patchJson('/api/v1/challenges/'.$challengeId, [
        'command_id' => (string) Str::uuid(),
        'data_epoch' => 1,
        'base_version' => 1,
        'name' => 'Tên mới cập nhật',
        'description' => 'Mô tả mới cập nhật',
    ]);

    $updateRes->assertOk()
        ->assertJsonPath('challenge.name', 'Tên mới cập nhật')
        ->assertJsonPath('challenge.description', 'Mô tả mới cập nhật')
        ->assertJsonPath('challenge.start_date', $startDate)
        ->assertJsonPath('challenge.target_days', 3)
        ->assertJsonPath('challenge.row_version', 2)
        ->assertJsonPath('account_revision', 2);

    // Verify in database
    $persisted = DB::table('challenges')->where('id', $challengeId)->first();
    expect($persisted->name)->toBe('Tên mới cập nhật')
        ->and($persisted->start_date)->toBe($startDate)
        ->and((int) $persisted->row_version)->toBe(2);

    $period = DB::table('challenge_target_periods')->where('challenge_id', $challengeId)->sole();
    expect((int) $period->target_days)->toBe(3);
});

test('strict mutation fields: POST and PATCH reject unexpected properties with 422', function () {
    $owner = setupChallengeOwner();

    // POST rejects unexpected properties
    $postRes = $this->actingAs($owner)->postJson('/api/v1/challenges', [
        'command_id' => (string) Str::uuid(),
        'data_epoch' => 1,
        'name' => 'Valid Name',
        'target_days' => 3,
        'unexpected_field' => 'not_allowed',
    ]);
    $postRes->assertStatus(422)
        ->assertJsonValidationErrors(['unexpected_field']);

    // Create challenge for PATCH test
    $createRes = $this->actingAs($owner)->postJson('/api/v1/challenges', [
        'command_id' => (string) Str::uuid(),
        'data_epoch' => 1,
        'name' => 'Original',
        'target_days' => 3,
    ]);
    $challengeId = $createRes->json('challenge.id');

    // PATCH rejects start_date, target_days, or other unknown fields
    $patchRes = $this->actingAs($owner)->patchJson('/api/v1/challenges/'.$challengeId, [
        'command_id' => (string) Str::uuid(),
        'data_epoch' => 1,
        'base_version' => 1,
        'name' => 'Updated Name',
        'start_date' => '2026-09-20',
        'target_days' => 5,
    ]);
    $patchRes->assertStatus(422)
        ->assertJsonValidationErrors(['start_date', 'target_days']);
});

test('blank or whitespace description normalizes to null and replays identically with same command_id', function () {
    $owner = setupChallengeOwner();
    $commandId = (string) Str::uuid();

    // First POST with description = ""
    $res1 = $this->actingAs($owner)->postJson('/api/v1/challenges', [
        'command_id' => $commandId,
        'data_epoch' => 1,
        'name' => 'Blank Description Challenge',
        'description' => '',
        'target_days' => 4,
    ]);
    $res1->assertCreated()
        ->assertJsonPath('challenge.description', null);

    // Replay with description = null using the same command_id -> succeeds and replays
    $res2 = $this->actingAs($owner)->postJson('/api/v1/challenges', [
        'command_id' => $commandId,
        'data_epoch' => 1,
        'name' => 'Blank Description Challenge',
        'description' => null,
        'target_days' => 4,
    ]);
    $res2->assertCreated()
        ->assertJsonPath('challenge.id', $res1->json('challenge.id'));

    // Replay with whitespace description = "   " using the same command_id -> succeeds and replays
    $res3 = $this->actingAs($owner)->postJson('/api/v1/challenges', [
        'command_id' => $commandId,
        'data_epoch' => 1,
        'name' => 'Blank Description Challenge',
        'description' => '   ',
        'target_days' => 4,
    ]);
    $res3->assertCreated()
        ->assertJsonPath('challenge.id', $res1->json('challenge.id'));

    $challengeId = $res1->json('challenge.id');

    // Update with description = ""
    $patchCmdId = (string) Str::uuid();
    $patchRes1 = $this->actingAs($owner)->patchJson('/api/v1/challenges/'.$challengeId, [
        'command_id' => $patchCmdId,
        'data_epoch' => 1,
        'base_version' => 1,
        'name' => 'Renamed Challenge',
        'description' => '',
    ]);
    $patchRes1->assertOk()
        ->assertJsonPath('challenge.description', null)
        ->assertJsonPath('challenge.row_version', 2);

    // Replay update with description = null and same command_id
    $patchRes2 = $this->actingAs($owner)->patchJson('/api/v1/challenges/'.$challengeId, [
        'command_id' => $patchCmdId,
        'data_epoch' => 1,
        'base_version' => 1,
        'name' => 'Renamed Challenge',
        'description' => null,
    ]);
    $patchRes2->assertOk()
        ->assertJsonPath('challenge.row_version', 2);
});

test('stale base_version update returns 409 version_conflict with current snapshot', function () {
    $owner = setupChallengeOwner();

    $createRes = $this->actingAs($owner)->postJson('/api/v1/challenges', [
        'command_id' => (string) Str::uuid(),
        'data_epoch' => 1,
        'name' => 'Version 1',
        'target_days' => 5,
    ]);
    $challengeId = $createRes->json('challenge.id');

    // Update to v2
    $this->actingAs($owner)->patchJson('/api/v1/challenges/'.$challengeId, [
        'command_id' => (string) Str::uuid(),
        'data_epoch' => 1,
        'base_version' => 1,
        'name' => 'Version 2',
    ])->assertOk();

    // Stale update with base_version = 1
    $staleRes = $this->actingAs($owner)->patchJson('/api/v1/challenges/'.$challengeId, [
        'command_id' => (string) Str::uuid(),
        'data_epoch' => 1,
        'base_version' => 1,
        'name' => 'Stale update',
    ]);

    $staleRes->assertStatus(409)
        ->assertHeader('content-type', 'application/problem+json')
        ->assertJsonPath('code', 'version_conflict')
        ->assertJsonPath('resource_id', $challengeId)
        ->assertJsonPath('current_version', 2)
        ->assertJsonPath('current_snapshot.name', 'Version 2')
        ->assertJsonPath('current_snapshot.row_version', 2);
});

test('idempotency: replay returns original response, key reuse returns 409', function () {
    $owner = setupChallengeOwner();
    $commandId = (string) Str::uuid();

    $payload = [
        'command_id' => $commandId,
        'data_epoch' => 1,
        'name' => 'Học Vue 3',
        'target_days' => 3,
    ];

    $res1 = $this->actingAs($owner)->postJson('/api/v1/challenges', $payload);
    $res1->assertCreated();

    // Replay exact payload
    $res2 = $this->actingAs($owner)->postJson('/api/v1/challenges', $payload);
    $res2->assertCreated()
        ->assertJsonPath('challenge.id', $res1->json('challenge.id'))
        ->assertJsonPath('account_revision', 1);

    expect(DB::table('challenges')->count())->toBe(1);

    // Key reuse with different payload
    $diffPayload = [
        'command_id' => $commandId,
        'data_epoch' => 1,
        'name' => 'Học React',
        'target_days' => 3,
    ];

    $res3 = $this->actingAs($owner)->postJson('/api/v1/challenges', $diffPayload);
    $res3->assertStatus(409)
        ->assertHeader('content-type', 'application/problem+json')
        ->assertJsonPath('code', 'idempotency_key_reused');
});

test('write fence and stale epoch protections return 423 and 409', function () {
    $owner = setupChallengeOwner(epoch: 2, writeState: 'locked_for_import');

    // Write fence
    $resLocked = $this->actingAs($owner)->postJson('/api/v1/challenges', [
        'command_id' => (string) Str::uuid(),
        'data_epoch' => 2,
        'name' => 'Test write fence',
        'target_days' => 2,
    ]);
    $resLocked->assertStatus(423)
        ->assertHeader('content-type', 'application/problem+json')
        ->assertJsonPath('code', 'write_fence_active');

    // Unlock but stale epoch
    DB::table('account_states')->where('owner_id', $owner->id)->update(['write_state' => 'open']);

    $resEpoch = $this->actingAs($owner)->postJson('/api/v1/challenges', [
        'command_id' => (string) Str::uuid(),
        'data_epoch' => 1, // stale
        'name' => 'Test stale epoch',
        'target_days' => 2,
    ]);
    $resEpoch->assertStatus(409)
        ->assertHeader('content-type', 'application/problem+json')
        ->assertJsonPath('code', 'stale_data_epoch');
});

test('accessing nonexistent challenge returns 404', function () {
    $owner = setupChallengeOwner();
    $randomUuid = (string) Str::uuid();

    $this->actingAs($owner)->getJson('/api/v1/challenges/'.$randomUuid)->assertNotFound();

    $this->actingAs($owner)->patchJson('/api/v1/challenges/'.$randomUuid, [
        'command_id' => (string) Str::uuid(),
        'data_epoch' => 1,
        'base_version' => 1,
        'name' => 'Update nonexistent',
    ])->assertNotFound();
});
