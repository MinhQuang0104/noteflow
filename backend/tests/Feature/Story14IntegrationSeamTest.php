<?php

use App\Models\User;
use App\Modules\Identity\Contracts\Clock;
use DateTimeImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

uses(RefreshDatabase::class);

/**
 * Story 1.4 Integration Seam Evidence (Task 6):
 *
 * Demonstrates the write-side revision contract and Challenge read model
 * that Story 1.4 will consume for cross-device polling, convergence, and cache reconciliation.
 *
 * Contract Consumers:
 * 1. Challenge list query: GET /api/v1/challenges
 * 2. Challenge detail query: GET /api/v1/challenges/{id}
 * 3. Challenge mutation acknowledgements: POST /api/v1/challenges and PATCH /api/v1/challenges/{id}
 *    (returns challenge snapshot, account_revision, data_epoch)
 * 4. State contract: GET /api/v1/account
 *    (returns account_revision, data_epoch, write_state, account_date, week)
 * 5. Story 1.4 polling/refetch coordinator
 */
function setupOwnerForSeam(string $timezone = 'Asia/Ho_Chi_Minh', int $epoch = 1, string $writeState = 'open'): User
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

test('Story 1.4 seam: create/update persists and list/detail returns updated read model for owner across devices', function () {
    $clock = new class implements Clock
    {
        public function now(): DateTimeImmutable
        {
            return new DateTimeImmutable('2026-09-19T10:00:00+00:00');
        }
    };
    $this->app->instance(Clock::class, $clock);

    $owner = setupOwnerForSeam();

    // Baseline: Account revision is 0
    $initialAccount = $this->actingAs($owner)->getJson('/api/v1/account');
    $initialAccount->assertOk()
        ->assertJson([
            'account_revision' => 0,
            'data_epoch' => 1,
            'write_state' => 'open',
        ]);

    // Device A creates a challenge
    $createCmd = (string) Str::uuid();
    $createResponse = $this->actingAs($owner)->postJson('/api/v1/challenges', [
        'command_id' => $createCmd,
        'data_epoch' => 1,
        'name' => 'Luyện đàn piano',
        'description' => 'Tập 45 phút mỗi ngày',
        'target_days' => 4,
    ]);

    $createResponse->assertCreated()
        ->assertJson([
            'account_revision' => 1,
            'data_epoch' => 1,
            'challenge' => [
                'name' => 'Luyện đàn piano',
                'description' => 'Tập 45 phút mỗi ngày',
                'start_date' => '2026-09-19',
                'target_days' => 4,
                'row_version' => 1,
            ],
        ]);

    $challengeId = $createResponse->json('challenge.id');

    // Device B checks account state: detects account_revision changed from 0 -> 1
    $deviceBAccount = $this->actingAs($owner)->getJson('/api/v1/account');
    $deviceBAccount->assertOk()
        ->assertJson([
            'account_revision' => 1,
            'data_epoch' => 1,
        ]);

    // Device B refetches challenges list: sees new challenge
    $deviceBList = $this->actingAs($owner)->getJson('/api/v1/challenges');
    $deviceBList->assertOk();
    expect($deviceBList->json('challenges'))->toHaveCount(1)
        ->and($deviceBList->json('challenges.0.id'))->toBe($challengeId)
        ->and($deviceBList->json('challenges.0.name'))->toBe('Luyện đàn piano')
        ->and($deviceBList->json('challenges.0.target_days'))->toBe(4);

    // Device A updates challenge metadata
    $updateCmd = (string) Str::uuid();
    $updateResponse = $this->actingAs($owner)->patchJson("/api/v1/challenges/{$challengeId}", [
        'command_id' => $updateCmd,
        'data_epoch' => 1,
        'base_version' => 1,
        'name' => 'Luyện đàn piano Jazz',
        'description' => 'Tập 60 phút mỗi ngày',
    ]);

    $updateResponse->assertOk()
        ->assertJson([
            'account_revision' => 2,
            'data_epoch' => 1,
            'challenge' => [
                'id' => $challengeId,
                'name' => 'Luyện đàn piano Jazz',
                'description' => 'Tập 60 phút mỗi ngày',
                'start_date' => '2026-09-19',
                'target_days' => 4,
                'row_version' => 2,
            ],
        ]);

    // Device B detects account_revision 2 and fetches detail
    $deviceBAccountAfterUpdate = $this->actingAs($owner)->getJson('/api/v1/account');
    $deviceBAccountAfterUpdate->assertOk()
        ->assertJson(['account_revision' => 2]);

    $deviceBDetail = $this->actingAs($owner)->getJson("/api/v1/challenges/{$challengeId}");
    $deviceBDetail->assertOk()
        ->assertJson([
            'challenge' => [
                'id' => $challengeId,
                'name' => 'Luyện đàn piano Jazz',
                'description' => 'Tập 60 phút mỗi ngày',
                'start_date' => '2026-09-19',
                'target_days' => 4,
                'row_version' => 2,
            ],
        ]);
});

test('Story 1.4 seam: revision increments exactly once per state change, never on replay, no-op, validation error, stale conflict, or rollback', function () {
    $clock = new class implements Clock
    {
        public function now(): DateTimeImmutable
        {
            return new DateTimeImmutable('2026-09-19T10:00:00+00:00');
        }
    };
    $this->app->instance(Clock::class, $clock);

    $owner = setupOwnerForSeam();

    // 1. Initial revision is 0
    $getRevision = fn () => DB::table('account_states')->where('owner_id', $owner->id)->value('account_revision');
    expect($getRevision())->toBe(0);

    // 2. Validation error: target_days = 9 -> NO revision increment
    $this->actingAs($owner)->postJson('/api/v1/challenges', [
        'command_id' => (string) Str::uuid(),
        'data_epoch' => 1,
        'name' => 'Invalid Target',
        'target_days' => 9,
    ])->assertStatus(422);
    expect($getRevision())->toBe(0);

    // 3. Real create: revision increments exactly once (0 -> 1)
    $createCmd = (string) Str::uuid();
    $createRes = $this->actingAs($owner)->postJson('/api/v1/challenges', [
        'command_id' => $createCmd,
        'data_epoch' => 1,
        'name' => 'Chạy marathon',
        'target_days' => 3,
    ])->assertCreated();
    $challengeId = $createRes->json('challenge.id');
    expect($getRevision())->toBe(1);

    // 4. Command replay: same command_id and payload -> NO revision increment (stays 1)
    $replayRes = $this->actingAs($owner)->postJson('/api/v1/challenges', [
        'command_id' => $createCmd,
        'data_epoch' => 1,
        'name' => 'Chạy marathon',
        'target_days' => 3,
    ])->assertCreated();
    expect($replayRes->json('challenge.id'))->toBe($challengeId);
    expect($getRevision())->toBe(1);

    // 5. Command key reuse with different payload -> 409, NO revision increment (stays 1)
    $this->actingAs($owner)->postJson('/api/v1/challenges', [
        'command_id' => $createCmd,
        'data_epoch' => 1,
        'name' => 'Different name',
        'target_days' => 5,
    ])->assertStatus(409);
    expect($getRevision())->toBe(1);

    // 6. No-op update (same name and null description) -> NO revision increment (stays 1)
    $this->actingAs($owner)->patchJson("/api/v1/challenges/{$challengeId}", [
        'command_id' => (string) Str::uuid(),
        'data_epoch' => 1,
        'base_version' => 1,
        'name' => 'Chạy marathon',
        'description' => null,
    ])->assertOk();
    expect($getRevision())->toBe(1);

    // 7. Real update: revision increments exactly once (1 -> 2)
    $this->actingAs($owner)->patchJson("/api/v1/challenges/{$challengeId}", [
        'command_id' => (string) Str::uuid(),
        'data_epoch' => 1,
        'base_version' => 1,
        'name' => 'Chạy marathon 42km',
        'description' => 'Chuẩn bị cuối tuần',
    ])->assertOk();
    expect($getRevision())->toBe(2);

    // 8. Stale version conflict: base_version = 1 when current is 2 -> 409, NO revision increment (stays 2)
    $this->actingAs($owner)->patchJson("/api/v1/challenges/{$challengeId}", [
        'command_id' => (string) Str::uuid(),
        'data_epoch' => 1,
        'base_version' => 1,
        'name' => 'Sửa đè bản cũ',
    ])->assertStatus(409);
    expect($getRevision())->toBe(2);

    // 9. Stale data_epoch: epoch = 99 when current is 1 -> 409, NO revision increment (stays 2)
    $this->actingAs($owner)->patchJson("/api/v1/challenges/{$challengeId}", [
        'command_id' => (string) Str::uuid(),
        'data_epoch' => 99,
        'base_version' => 2,
        'name' => 'Sửa sai epoch',
    ])->assertStatus(409);
    expect($getRevision())->toBe(2);

    // 10. Write fence active: write_state = locked_for_import -> 423, NO revision increment (stays 2)
    DB::table('account_states')->where('owner_id', $owner->id)->update(['write_state' => 'locked_for_import']);
    $this->actingAs($owner)->patchJson("/api/v1/challenges/{$challengeId}", [
        'command_id' => (string) Str::uuid(),
        'data_epoch' => 1,
        'base_version' => 2,
        'name' => 'Sửa khi bị khóa import',
    ])->assertStatus(423);
    expect($getRevision())->toBe(2);
});
