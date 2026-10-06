<?php

use Tests\TestCase;

afterEach(function () {
    config([
        'app.env' => 'testing',
        'database.connections.pgsql.database' => 'noteflow_test',
    ]);
});

test('the guard accepts the isolated test database', function () {
    TestCase::assertSafeTestDatabase();

    expect(config('database.connections.pgsql.database'))->toBe('noteflow_test');
});

test('the guard refuses a non-test database name', function () {
    config(['database.connections.pgsql.database' => 'noteflow']);

    expect(fn () => TestCase::assertSafeTestDatabase())
        ->toThrow(RuntimeException::class, "database is 'noteflow'");
});

test('the guard refuses a non-testing app environment', function () {
    config(['app.env' => 'local']);

    expect(fn () => TestCase::assertSafeTestDatabase())
        ->toThrow(RuntimeException::class, "APP_ENV is 'local'");
});
