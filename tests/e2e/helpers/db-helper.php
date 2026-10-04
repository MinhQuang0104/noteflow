<?php

declare(strict_types=1);

$requiredEnvironment = ['APP_ENV', 'DB_DATABASE', 'DB_HOST', 'DB_PORT', 'DB_USERNAME', 'DB_PASSWORD'];
$missingEnvironment = array_values(array_filter(
    $requiredEnvironment,
    static fn (string $name): bool => getenv($name) === false || trim((string) getenv($name)) === '',
));

if ($missingEnvironment !== []) {
    fwrite(STDERR, 'FATAL: db-helper requires explicit test identity environment: '.implode(', ', $missingEnvironment)."\n");
    exit(1);
}

$appEnv = (string) getenv('APP_ENV');
$database = (string) getenv('DB_DATABASE');

if ($appEnv !== 'testing') {
    fwrite(STDERR, "FATAL: db-helper is strictly fail-closed. APP_ENV must be 'testing'. Got: '{$appEnv}'\n");
    exit(1);
}

if ($database !== 'noteflow_test') {
    fwrite(STDERR, "FATAL: db-helper is strictly forbidden to run on database '{$database}'. Only 'noteflow_test' is permitted.\n");
    exit(1);
}

$host = (string) getenv('DB_HOST');
$port = (string) getenv('DB_PORT');
$user = (string) getenv('DB_USERNAME');
$pass = (string) getenv('DB_PASSWORD');

try {
    $dsn = "pgsql:host={$host};port={$port};dbname={$database}";
    $pdo = new PDO($dsn, $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
} catch (PDOException $e) {
    fwrite(STDERR, "Failed to connect to PostgreSQL at {$host}:{$port}/{$database}: ".$e->getMessage()."\n");
    exit(1);
}

$action = $argv[1] ?? 'reset';

switch ($action) {
    case 'reset':
        $pdo->exec('DELETE FROM mutation_commands');
        $pdo->exec('DELETE FROM challenge_target_periods');
        $pdo->exec('DELETE FROM challenges');
        if ($pdo->query("SELECT to_regclass('public.sessions')")->fetchColumn()) {
            $pdo->exec('DELETE FROM sessions');
        }

        $passwordHash = password_hash('secret123', PASSWORD_BCRYPT);

        $stmt = $pdo->prepare('SELECT id FROM users WHERE email = :email');
        $stmt->execute(['email' => 'owner@example.test']);
        $ownerId = $stmt->fetchColumn();

        if ($ownerId) {
            $updateUser = $pdo->prepare("UPDATE users SET name = 'NoteFlow Owner', password = :password, is_owner = true, updated_at = NOW() WHERE id = :id");
            $updateUser->execute(['password' => $passwordHash, 'id' => $ownerId]);
        } else {
            $insertUser = $pdo->prepare("INSERT INTO users (name, email, password, is_owner, created_at, updated_at) VALUES ('NoteFlow Owner', 'owner@example.test', :password, true, NOW(), NOW()) RETURNING id");
            $insertUser->execute(['password' => $passwordHash]);
            $ownerId = $insertUser->fetchColumn();
        }

        $upsertAccount = $pdo->prepare("
            INSERT INTO account_states (owner_id, timezone, account_revision, data_epoch, write_state)
            VALUES (:owner_id, 'Asia/Ho_Chi_Minh', 0, 1, 'open')
            ON CONFLICT (owner_id) DO UPDATE
            SET timezone = 'Asia/Ho_Chi_Minh', account_revision = 0, data_epoch = 1, write_state = 'open'
        ");
        $upsertAccount->execute(['owner_id' => $ownerId]);

        echo json_encode(['status' => 'ok', 'owner_id' => $ownerId, 'database' => $database, 'app_env' => $appEnv]);
        break;

    case 'set-write-state':
        $state = $argv[2] ?? 'open';
        if (! in_array($state, ['open', 'locked_for_import'], true)) {
            fwrite(STDERR, "Invalid write state: {$state}\n");
            exit(1);
        }
        $stmt = $pdo->prepare("
            UPDATE account_states
            SET write_state = :state
            FROM users
            WHERE account_states.owner_id = users.id AND users.email = 'owner@example.test'
        ");
        $stmt->execute(['state' => $state]);
        echo json_encode(['status' => 'ok', 'write_state' => $state]);
        break;

    case 'get-journal-state':
        $challengeId = $argv[2] ?? '';
        $localDate = $argv[3] ?? '';
        $date = DateTimeImmutable::createFromFormat('!Y-m-d', $localDate);
        if (preg_match('/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iD', $challengeId) !== 1
            || $date === false || $date->format('Y-m-d') !== $localDate) {
            fwrite(STDERR, "Invalid journal identity\n");
            exit(1);
        }
        $stmt = $pdo->prepare("
            SELECT c.id AS challenge_id, CAST(:local_date AS date) AS local_date,
                   c.start_date, r.journal, COALESCE(r.journal_version, 0) AS journal_version,
                   COALESCE(r.completion_version, 0) AS completion_version,
                   COALESCE(r.is_done, false) AS is_done, a.account_revision,
                   (SELECT COUNT(*) FROM mutation_commands m
                    WHERE m.owner_id = c.owner_id AND m.resource_id = c.id
                      AND m.command_type = 'save_challenge_journal') AS journal_commands
            FROM challenges c
            JOIN users u ON u.id = c.owner_id AND u.email = 'owner@example.test'
            JOIN account_states a ON a.owner_id = c.owner_id
            LEFT JOIN challenge_daily_records r
              ON r.owner_id = c.owner_id AND r.challenge_id = c.id AND r.local_date = :record_date
            WHERE c.id = :challenge_id
        ");
        $stmt->execute(['local_date' => $localDate, 'record_date' => $localDate, 'challenge_id' => $challengeId]);
        $state = $stmt->fetch();
        if ($state !== false) {
            foreach (['journal_version', 'completion_version', 'account_revision', 'journal_commands'] as $field) {
                $state[$field] = (int) $state[$field];
            }
            $state['is_done'] = filter_var($state['is_done'], FILTER_VALIDATE_BOOLEAN);
        }
        echo json_encode($state === false ? null : $state, JSON_THROW_ON_ERROR);
        break;

    case 'get-revision':
        $stmt = $pdo->prepare("
            SELECT account_states.account_revision
            FROM account_states
            JOIN users ON account_states.owner_id = users.id
            WHERE users.email = 'owner@example.test'
        ");
        $stmt->execute();
        $rev = $stmt->fetchColumn();
        echo json_encode(['status' => 'ok', 'account_revision' => (int) $rev]);
        break;

    case 'get-epoch':
        $stmt = $pdo->prepare("
            SELECT account_states.data_epoch
            FROM account_states
            JOIN users ON account_states.owner_id = users.id
            WHERE users.email = 'owner@example.test'
        ");
        $stmt->execute();
        $epoch = $stmt->fetchColumn();
        echo json_encode(['status' => 'ok', 'data_epoch' => (int) $epoch]);
        break;

    case 'bump-revision':
        $stmt = $pdo->prepare("
            UPDATE account_states
            SET account_revision = account_revision + 1
            FROM users
            WHERE account_states.owner_id = users.id AND users.email = 'owner@example.test'
            RETURNING account_states.account_revision
        ");
        $stmt->execute();
        $rev = $stmt->fetchColumn();
        echo json_encode(['status' => 'ok', 'account_revision' => (int) $rev]);
        break;

    default:
        fwrite(STDERR, "Unknown action: {$action}\n");
        exit(1);
}
