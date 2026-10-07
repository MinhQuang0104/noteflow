<?php

use App\Models\User;
use App\Modules\Identity\Contracts\Clock;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->app->instance(Clock::class, new class implements Clock
    {
        public function now(): DateTimeImmutable
        {
            return new DateTimeImmutable('2026-09-20T20:00:00+00:00');
        }
    });
});

function journalApiOwner(int $epoch = 1, string $writeState = 'open'): User
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

function journalApiChallenge(User $owner): string
{
    $id = (string) Str::uuid();
    DB::table('challenges')->insert([
        'id' => $id,
        'owner_id' => $owner->id,
        'name' => 'Read daily',
        'start_date' => '2026-09-19',
        'row_version' => 1,
        'created_at' => now(),
        'updated_at' => now(),
    ]);

    return $id;
}

function journalApiPayload(string $text, int $baseVersion = 0, ?string $commandId = null): array
{
    return [
        'command_id' => $commandId ?? (string) Str::uuid(),
        'data_epoch' => 1,
        'base_version' => $baseVersion,
        'journal' => $text,
    ];
}

test('journal HTTP save and read preserve completion, versions, and account revision', function () {
    $owner = journalApiOwner();
    $id = journalApiChallenge($owner);
    $url = "/api/v1/challenges/{$id}/journals/2026-09-20";

    $this->actingAs($owner)->getJson($url)->assertOk()
        ->assertJsonPath('journal.journal', null)
        ->assertJsonPath('journal.journal_version', 0);

    $first = $this->actingAs($owner)->putJson($url, journalApiPayload('A useful day'));
    $first->assertOk()->assertJsonPath('journal.journal', 'A useful day')
        ->assertJsonPath('journal.journal_version', 1)
        ->assertJsonPath('account_revision', 1);
    $this->actingAs($owner)->getJson($url)->assertOk()
        ->assertJsonPath('journal.journal', 'A useful day')
        ->assertJsonPath('journal.journal_version', 1);

    DB::table('challenge_daily_records')->where('challenge_id', $id)->update([
        'is_done' => true,
        'completion_version' => 1,
        'row_version' => 2,
    ]);
    $this->actingAs($owner)->putJson($url, journalApiPayload('Edited', 1))->assertOk()
        ->assertJsonPath('journal.journal_version', 2)
        ->assertJsonPath('account_revision', 2);
    $row = DB::table('challenge_daily_records')->where('challenge_id', $id)->sole();
    expect($row->journal)->toBe('Edited')
        ->and((bool) $row->is_done)->toBeTrue()
        ->and((int) $row->completion_version)->toBe(1)
        ->and((int) DB::table('challenges')->where('id', $id)->value('row_version'))->toBe(1);
});

test('journal HTTP conflict and command replay preserve saved content', function () {
    $owner = journalApiOwner();
    $id = journalApiChallenge($owner);
    $url = "/api/v1/challenges/{$id}/journals/2026-09-20";
    $command = journalApiPayload('Saved');

    $this->actingAs($owner)->putJson($url, $command)->assertOk();
    $this->actingAs($owner)->putJson($url, $command)->assertOk()
        ->assertJsonPath('account_revision', 1);
    $this->actingAs($owner)->putJson($url, journalApiPayload('Different', 0, $command['command_id']))
        ->assertStatus(409)->assertJsonPath('code', 'idempotency_key_reused');
    $conflict = $this->actingAs($owner)->putJson($url, journalApiPayload('Stale draft'));
    $conflict->assertStatus(409)->assertHeader('content-type', 'application/problem+json')
        ->assertJsonPath('code', 'version_conflict')
        ->assertJsonPath('resource_id', $id)
        ->assertJsonPath('current_version', 1)
        ->assertJsonPath('current_snapshot.challenge_id', $id)
        ->assertJsonPath('current_snapshot.local_date', '2026-09-20')
        ->assertJsonPath('current_snapshot.journal', 'Saved')
        ->assertJsonPath('current_snapshot.journal_version', 1);
    expect($conflict->getContent())->not->toContain('Stale draft');
    expect(DB::table('challenge_daily_records')->where('challenge_id', $id)->value('journal'))->toBe('Saved')
        ->and((int) DB::table('account_states')->where('owner_id', $owner->id)->value('account_revision'))->toBe(1)
        ->and(DB::table('mutation_commands')->where('owner_id', $owner->id)->count())->toBe(1);
});

test('journal HTTP access is authenticated, owner scoped, and private', function () {
    $owner = journalApiOwner();
    $id = journalApiChallenge($owner);
    $url = "/api/v1/challenges/{$id}/journals/2026-09-20";
    $this->getJson($url)->assertUnauthorized();
    $this->putJson($url, journalApiPayload('Secret'))->assertUnauthorized();
    $other = User::factory()->create(['is_owner' => false]);
    $this->actingAs($other)->getJson($url)->assertForbidden();
    $this->actingAs($other)->putJson($url, journalApiPayload('Secret'))->assertForbidden();
    $this->actingAs($owner)->getJson('/api/v1/challenges/'.Str::uuid().'/journals/2026-09-20')->assertNotFound();
    $this->actingAs($owner)->putJson('/api/v1/challenges/'.Str::uuid().'/journals/2026-09-20', journalApiPayload('Hidden'))
        ->assertNotFound();
    $this->actingAs($owner)->getJson("/api/v1/challenges/{$id}/journals/2026-09-22")
        ->assertStatus(422)->assertJsonValidationErrors(['local_date']);
    $response = $this->actingAs($owner)->getJson($url);
    $response->assertOk();
    expect($response->headers->get('cache-control'))->toContain('no-store');
});

test('journal HTTP rejects invalid day, blank text, unknown fields, fence, and stale epoch', function () {
    $owner = journalApiOwner();
    $id = journalApiChallenge($owner);
    $url = "/api/v1/challenges/{$id}/journals/2026-09-20";
    $this->actingAs($owner)->putJson($url, journalApiPayload('Saved'))->assertOk();
    $this->actingAs($owner)->putJson($url, journalApiPayload(" \n ", 1))
        ->assertStatus(422)->assertJsonValidationErrors(['journal']);
    $this->actingAs($owner)->putJson($url, journalApiPayload("NUL\0text", 1))
        ->assertStatus(422)->assertJsonValidationErrors(['journal']);
    $this->actingAs($owner)->putJson($url, journalApiPayload('Wrong day', 1) + ['is_done' => true])
        ->assertStatus(422)->assertJsonValidationErrors(['is_done']);
    $this->actingAs($owner)->putJson("/api/v1/challenges/{$id}/journals/2026-09-22", journalApiPayload('Future'))
        ->assertStatus(422)->assertJsonValidationErrors(['local_date']);
    DB::table('account_states')->where('owner_id', $owner->id)->update(['write_state' => 'locked_for_import']);
    $this->actingAs($owner)->putJson($url, journalApiPayload('Blocked', 1))
        ->assertStatus(423)->assertJsonPath('code', 'write_fence_active');
    DB::table('account_states')->where('owner_id', $owner->id)->update(['write_state' => 'open', 'data_epoch' => 2]);
    $this->actingAs($owner)->putJson($url, journalApiPayload('Stale', 1))
        ->assertStatus(409)->assertJsonPath('code', 'stale_data_epoch');
    expect(DB::table('challenge_daily_records')->where('challenge_id', $id)->value('journal'))->toBe('Saved');
});

test('journal HTTP preserves boundary whitespace without changing other field normalization or digest', function () {
    $owner = journalApiOwner();
    $id = journalApiChallenge($owner);
    $url = "/api/v1/challenges/{$id}/journals/2026-09-20";
    $commandId = (string) Str::uuid();
    $journal = " \n  Keep this text exactly  \n\t";

    $response = $this->actingAs($owner)->putJson($url, [
        'command_id' => "  {$commandId}  ",
        'data_epoch' => 1,
        'base_version' => 0,
        'journal' => $journal,
    ]);

    $response->assertOk();
    expect($response->json('journal.journal'))->toBe($journal)
        ->and(DB::table('challenge_daily_records')->where('challenge_id', $id)->value('journal'))->toBe($journal)
        ->and(DB::table('mutation_commands')->where('owner_id', $owner->id)->value('command_id'))->toBe($commandId)
        ->and((int) DB::table('challenge_daily_records')->where('challenge_id', $id)->value('journal_version'))->toBe(1)
        ->and((int) DB::table('account_states')->where('owner_id', $owner->id)->value('account_revision'))->toBe(1);

    $canonicalData = [
        'base_version' => 0,
        'challenge_id' => $id,
        'journal' => $journal,
        'local_date' => '2026-09-20',
    ];
    ksort($canonicalData);
    expect(DB::table('mutation_commands')->where('owner_id', $owner->id)->value('request_hash'))
        ->toBe(hash('sha256', (string) json_encode($canonicalData, JSON_THROW_ON_ERROR)));

    $this->actingAs($owner)->putJson($url, [
        'command_id' => (string) Str::uuid(),
        'data_epoch' => 1,
        'base_version' => 1,
        'journal' => " \nNUL\0text\n ",
    ])->assertStatus(422)->assertJsonValidationErrors(['journal']);
});
