<?php

namespace Tests;

use Illuminate\Database\Connection;
use Illuminate\Database\Events\ConnectionEstablished;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Facades\Event;
use RuntimeException;

abstract class TestCase extends BaseTestCase
{
    protected const EXPECTED_TEST_DB = 'noteflow_test';

    protected const EXPECTED_TEST_ENV = 'testing';

    /**
     * Boot testing helper traits after verifying environment safety.
     *
     * @return array
     */
    protected function setUpTraits()
    {
        self::assertSafeTestDatabase();
        $this->registerDatabaseSafetyGuards();

        return parent::setUpTraits();
    }

    /**
     * Setup the test environment.
     */
    protected function setUp(): void
    {
        parent::setUp();
        self::assertSafeTestDatabase();
    }

    /**
     * Fail-closed guard against running tests or destructive operations on non-test databases.
     */
    public static function assertSafeTestDatabase(?string $connection = null): void
    {
        $appEnv = config('app.env') ?? env('APP_ENV');
        if ($appEnv !== self::EXPECTED_TEST_ENV) {
            throw new RuntimeException("Refusing test execution: APP_ENV is '{$appEnv}', expected '".self::EXPECTED_TEST_ENV."'.");
        }

        $defaultConn = config('database.default');
        $connectionsToCheck = array_filter(array_unique([
            $defaultConn,
            $connection,
            config('database.connections.pgsql_second') ? 'pgsql_second' : null,
        ]));

        foreach ($connectionsToCheck as $conn) {
            $database = config("database.connections.{$conn}.database");
            if ($database !== self::EXPECTED_TEST_DB) {
                throw new RuntimeException("Refusing test execution: connection '{$conn}' database is '{$database}', expected '".self::EXPECTED_TEST_DB."'.");
            }
        }
    }

    /**
     * Register runtime guards for any established database connection.
     */
    protected function registerDatabaseSafetyGuards(): void
    {
        Event::listen(ConnectionEstablished::class, function (ConnectionEstablished $event) {
            $appEnv = config('app.env') ?? env('APP_ENV');
            if ($appEnv !== self::EXPECTED_TEST_ENV) {
                throw new RuntimeException("Refusing database connection '{$event->connectionName}': APP_ENV is '{$appEnv}', expected '".self::EXPECTED_TEST_ENV."'.");
            }

            $dbName = $event->connection->getDatabaseName();
            if ($dbName !== self::EXPECTED_TEST_DB) {
                throw new RuntimeException("Refusing database connection '{$event->connectionName}': database is '{$dbName}', expected '".self::EXPECTED_TEST_DB."'.");
            }

            $event->connection->beforeExecuting(function ($query, $bindings, Connection $connection) {
                if ($connection->getDatabaseName() !== self::EXPECTED_TEST_DB) {
                    throw new RuntimeException("Refusing query on unsafe database: connection '{$connection->getName()}' database is '{$connection->getDatabaseName()}', expected '".self::EXPECTED_TEST_DB."'.");
                }
            });
        });
    }
}
