<?php

use App\Models\User;
use App\Modules\Notes\Application\Commands\CreateNotebookCommand;
use App\Modules\Notes\Application\Commands\RenameNotebookCommand;
use App\Modules\Notes\Application\DefaultNotebookProvisioner;
use App\Modules\Notes\Application\UseCases\CreateNotebookUseCase;
use App\Modules\Notes\Application\UseCases\RenameNotebookUseCase;
use App\Modules\Notes\Domain\Exceptions\VersionConflictException;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

function resetNotebookConcurrencyTables(): void
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

    resetNotebookConcurrencyTables();
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

    resetNotebookConcurrencyTables();
});

function committedNotebookOwner(): User
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

    return $owner;
}

test('two concurrent identical create commands leave one notebook and one account_revision step', function () {
    $owner = committedNotebookOwner();
    $command = new CreateNotebookCommand(
        ownerId: $owner->id,
        commandId: (string) Str::uuid(),
        dataEpoch: 1,
        name: 'Gửi hai lần',
    );
    $conn1 = DB::connection('pgsql');
    $conn2 = DB::connection('pgsql_second');

    // The first request is still in flight: its transaction holds the account lock.
    $conn1->beginTransaction();
    $first = app(CreateNotebookUseCase::class)->execute($command);

    // The duplicate arrives on a second PostgreSQL session and must wait on the account row.
    $conn2->statement("SET lock_timeout = '200ms'");
    DB::setDefaultConnection('pgsql_second');
    try {
        app(CreateNotebookUseCase::class)->execute($command);
        $this->fail('Expected the duplicate to wait on the account-row lock.');
    } catch (QueryException $exception) {
        expect($exception->getCode())->toBe('55P03');
    }
    expect($conn2->table('notebooks')->where('owner_id', $owner->id)->count())->toBe(1);

    $conn1->commit();

    $replay = app(CreateNotebookUseCase::class)->execute($command);

    expect($replay)->toEqual($first)
        ->and($conn2->table('notebooks')->where('owner_id', $owner->id)->where('is_default', false)->count())->toBe(1)
        ->and($conn2->table('mutation_commands')->where('owner_id', $owner->id)->count())->toBe(1)
        ->and((int) $conn2->table('account_states')->where('owner_id', $owner->id)->value('account_revision'))->toBe(1);
});

test('two concurrent renames on the same base_version leave one winner and one version conflict', function () {
    $owner = committedNotebookOwner();
    $notebookId = (string) DB::table('notebooks')->where('owner_id', $owner->id)->value('id');
    $rename = fn (string $name, string $commandId): ?array => app(RenameNotebookUseCase::class)->execute(new RenameNotebookCommand(
        ownerId: $owner->id,
        notebookId: $notebookId,
        commandId: $commandId,
        dataEpoch: 1,
        baseVersion: 1,
        name: $name,
    ));
    $conn1 = DB::connection('pgsql');
    $conn2 = DB::connection('pgsql_second');
    $loserCommand = (string) Str::uuid();

    $conn1->beginTransaction();
    $winner = $rename('Người thắng', (string) Str::uuid());

    $conn2->statement("SET lock_timeout = '200ms'");
    DB::setDefaultConnection('pgsql_second');
    try {
        $rename('Người thua', $loserCommand);
        $this->fail('Expected the second rename to wait on the account-row lock.');
    } catch (QueryException $exception) {
        expect($exception->getCode())->toBe('55P03');
    }

    $conn1->commit();

    try {
        $rename('Người thua', $loserCommand);
        $this->fail('Expected VersionConflictException.');
    } catch (VersionConflictException $exception) {
        expect($exception->currentVersion)->toBe(2)
            ->and($exception->currentSnapshot['name'])->toBe('Người thắng');
    }

    $persisted = $conn2->table('notebooks')->where('id', $notebookId)->first();
    expect($winner['notebook']['row_version'])->toBe(2)
        ->and($persisted->name)->toBe('Người thắng')
        ->and((int) $persisted->row_version)->toBe(2)
        ->and((bool) $persisted->is_default)->toBeTrue()
        ->and((int) $conn2->table('account_states')->where('owner_id', $owner->id)->value('account_revision'))->toBe(1)
        ->and($conn2->table('mutation_commands')->where('owner_id', $owner->id)->count())->toBe(1);
});
