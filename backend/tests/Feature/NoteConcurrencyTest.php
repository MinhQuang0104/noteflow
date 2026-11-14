<?php

use App\Models\User;
use App\Modules\Notes\Application\Commands\CreateNoteCommand;
use App\Modules\Notes\Application\Commands\UpdateNoteCommand;
use App\Modules\Notes\Application\DefaultNotebookProvisioner;
use App\Modules\Notes\Application\UseCases\CreateNoteUseCase;
use App\Modules\Notes\Application\UseCases\UpdateNoteUseCase;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

function resetNoteConcurrencyTables(): void
{
    DB::table('notes')->delete();
    DB::table('notebooks')->delete();
    DB::table('mutation_commands')->delete();
    DB::table('challenge_daily_records')->delete();
    DB::table('challenge_target_periods')->delete();
    DB::table('challenges')->delete();
    DB::table('account_states')->delete();
    DB::table('users')->delete();
}

beforeEach(function () {
    config(['database.connections.pgsql_second' => config('database.connections.pgsql')]);
    TestCase::assertSafeTestDatabase('pgsql_second');
    DB::setDefaultConnection('pgsql');

    resetNoteConcurrencyTables();
});

afterEach(function () {
    TestCase::assertSafeTestDatabase('pgsql_second');

    foreach (['pgsql', 'pgsql_second'] as $connection) {
        try {
            while (DB::connection($connection)->transactionLevel() > 0) {
                DB::connection($connection)->rollBack();
            }
        } catch (Throwable) {
        }
    }

    DB::disconnect('pgsql_second');
    DB::setDefaultConnection('pgsql');

    resetNoteConcurrencyTables();
});

/**
 * @return array{0: User, 1: string}
 */
function committedNoteOwner(): array
{
    $owner = User::factory()->owner()->create();
    DB::table('account_states')->insert([
        'owner_id' => $owner->id,
        'timezone' => 'Asia/Ho_Chi_Minh',
        'account_revision' => 0,
        'data_epoch' => 1,
        'write_state' => 'open',
    ]);
    app(DefaultNotebookProvisioner::class)->ensure($owner->id);

    return [$owner, (string) DB::table('notebooks')->where('owner_id', $owner->id)->value('id')];
}

test('two concurrent identical create commands leave one note and one account_revision step', function () {
    [$owner, $notebookId] = committedNoteOwner();
    $command = new CreateNoteCommand(
        ownerId: $owner->id,
        commandId: (string) Str::uuid(),
        dataEpoch: 1,
        notebookId: $notebookId,
        title: '',
        body: 'Gửi hai lần',
    );
    $conn1 = DB::connection('pgsql');
    $conn2 = DB::connection('pgsql_second');

    // The first request is still in flight: its transaction holds the account lock.
    $conn1->beginTransaction();
    $first = app(CreateNoteUseCase::class)->execute($command);

    // The duplicate arrives on a second PostgreSQL session and must wait on the account row.
    $conn2->statement("SET lock_timeout = '200ms'");
    DB::setDefaultConnection('pgsql_second');
    try {
        app(CreateNoteUseCase::class)->execute($command);
        $this->fail('Expected the duplicate to wait on the account-row lock.');
    } catch (QueryException $exception) {
        expect($exception->getCode())->toBe('55P03');
    }
    expect($conn2->table('notes')->where('owner_id', $owner->id)->count())->toBe(0);

    $conn1->commit();

    $replay = app(CreateNoteUseCase::class)->execute($command);

    expect($replay)->toEqual($first)
        ->and($conn2->table('notes')->where('owner_id', $owner->id)->count())->toBe(1)
        ->and($conn2->table('mutation_commands')->where('owner_id', $owner->id)->count())->toBe(1)
        ->and((int) $conn2->table('account_states')->where('owner_id', $owner->id)->value('account_revision'))->toBe(1);
});

test('two concurrent updates on the same base_version leave one winner and one version conflict', function () {
    [$owner, $notebookId] = committedNoteOwner();
    $noteId = app(CreateNoteUseCase::class)->execute(new CreateNoteCommand(
        ownerId: $owner->id,
        commandId: (string) Str::uuid(),
        dataEpoch: 1,
        notebookId: $notebookId,
        title: 'Gốc',
        body: '',
    ))['note']['id'];
    $update = fn (string $body, string $commandId): ?array => app(UpdateNoteUseCase::class)->execute(new UpdateNoteCommand(
        ownerId: $owner->id,
        noteId: $noteId,
        commandId: $commandId,
        dataEpoch: 1,
        baseVersion: 1,
        title: 'Gốc',
        body: $body,
    ));
    $conn1 = DB::connection('pgsql');
    $conn2 = DB::connection('pgsql_second');
    $loserCommand = (string) Str::uuid();

    $conn1->beginTransaction();
    $winner = $update('Người thắng', (string) Str::uuid());

    $conn2->statement("SET lock_timeout = '200ms'");
    DB::setDefaultConnection('pgsql_second');
    try {
        $update('Người thua', $loserCommand);
        $this->fail('Expected the second update to wait on the account-row lock.');
    } catch (QueryException $exception) {
        expect($exception->getCode())->toBe('55P03');
    }

    $conn1->commit();

    $loser = $update('Người thua', $loserCommand);

    $persisted = $conn2->table('notes')->where('id', $noteId)->first();
    expect($winner['note']['row_version'])->toBe(2)
        ->and(array_keys($loser))->toBe(['conflict'])
        ->and($loser['conflict']['row_version'])->toBe(2)
        ->and($loser['conflict']['body'])->toBe('Người thắng')
        ->and($persisted->body)->toBe('Người thắng')
        ->and((int) $persisted->row_version)->toBe(2)
        ->and((int) $conn2->table('account_states')->where('owner_id', $owner->id)->value('account_revision'))->toBe(2)
        ->and($conn2->table('mutation_commands')->where('owner_id', $owner->id)->count())->toBe(2);
});
