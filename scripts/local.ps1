[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet('init', 'up', 'stop', 'status', 'logs', 'doctor', 'migrate', 'owner', 'rebuild', 'test', 'e2e', 'test-stop', 'help')]
    [string] $Action = 'help',

    [string] $OwnerEmail
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$script:LastExternalExitCode = 0
$script:LockStream = $null
$script:ScriptRoot = (Resolve-Path (Split-Path -Parent $MyInvocation.MyCommand.Path)).Path
$script:RepoRoot = (Resolve-Path (Join-Path $script:ScriptRoot '..')).Path
$script:ComposeFile = Join-Path $script:RepoRoot 'compose.local.yaml'
$script:EnvFile = Join-Path $script:RepoRoot 'deploy/local/.env'
$script:ProjectName = 'noteflow-local'
$script:DockerContext = 'desktop-linux'

function Fail([string] $Message) {
    throw $Message
}

function Invoke-GitText([string[]] $Arguments) {
    Push-Location $script:RepoRoot
    try {
        $output = & git @Arguments 2>&1
        $script:LastExternalExitCode = $LASTEXITCODE
    }
    finally {
        Pop-Location
    }

    if ($script:LastExternalExitCode -ne 0) {
        Fail ("Git command failed (exit {0}): git {1}" -f $script:LastExternalExitCode, ($Arguments -join ' '))
    }

    return (($output -join "`n").Trim())
}

function Assert-CanonicalCheckout {
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        Fail 'Git is required to identify the canonical checkout.'
    }

    $topLevel = (Invoke-GitText @('rev-parse', '--show-toplevel')).Trim()
    $gitDirRaw = (Invoke-GitText @('rev-parse', '--git-dir')).Trim()
    $commonDirRaw = (Invoke-GitText @('rev-parse', '--git-common-dir')).Trim()

    $topLevelResolved = (Resolve-Path $topLevel).Path.TrimEnd('\')
    $repoResolved = $script:RepoRoot.TrimEnd('\')
    if ($topLevelResolved -ne $repoResolved) {
        Fail ("Script must run from the canonical checkout at {0}; resolved repo is {1}." -f $repoResolved, $topLevelResolved)
    }

    function Resolve-GitPath([string] $PathValue) {
        if ([IO.Path]::IsPathRooted($PathValue)) {
            return [IO.Path]::GetFullPath($PathValue).TrimEnd('\')
        }

        return [IO.Path]::GetFullPath((Join-Path $script:RepoRoot $PathValue)).TrimEnd('\')
    }

    $gitDir = Resolve-GitPath $gitDirRaw
    $commonDir = Resolve-GitPath $commonDirRaw
    if ($gitDir -ne $commonDir) {
        Fail ("Linked worktree is not allowed for the shared local runtime. Run {0} from the canonical checkout." -f (Join-Path $script:RepoRoot 'scripts/local.ps1'))
    }
}

function Assert-RepositoryFiles {
    foreach ($path in @($script:ComposeFile, $script:EnvFile | Where-Object { Test-Path $_ })) {
        if ($path -and -not (Test-Path $path)) {
            Fail ("Required local runtime path is missing: {0}" -f $path)
        }
    }

    if (-not (Test-Path $script:ComposeFile)) {
        Fail ("Compose file is missing: {0}" -f $script:ComposeFile)
    }
}

function Assert-Docker {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Fail 'Docker CLI is not installed or not available on PATH.'
    }

    Push-Location $script:RepoRoot
    try {
        & docker --context $script:DockerContext version --format '{{.Server.Version}}' 2>&1 | Out-Null
        $script:LastExternalExitCode = $LASTEXITCODE
    }
    finally {
        Pop-Location
    }

    if ($script:LastExternalExitCode -ne 0) {
        Fail ("Docker context '{0}' is unavailable. Start Docker Desktop and retry." -f $script:DockerContext)
    }
}

function Get-ComposePrefix([switch] $TestProfile) {
    $prefix = @('--context', $script:DockerContext, 'compose')
    if ($TestProfile) {
        $prefix += @('--profile', 'test')
    }

    $prefix += @(
        '--project-directory', $script:RepoRoot,
        '--file', $script:ComposeFile,
        '--env-file', $script:EnvFile,
        '--project-name', $script:ProjectName
    )

    return ,$prefix
}

function Invoke-Compose([string[]] $ComposeArguments, [switch] $TestProfile) {
    $prefix = @(Get-ComposePrefix -TestProfile:$TestProfile)
    Push-Location $script:RepoRoot
    try {
        & docker @prefix @ComposeArguments
        $script:LastExternalExitCode = $LASTEXITCODE
    }
    finally {
        Pop-Location
    }

    if ($script:LastExternalExitCode -ne 0) {
        Fail ("Docker Compose command failed (exit {0}): {1}" -f $script:LastExternalExitCode, ($ComposeArguments -join ' '))
    }
}

function Invoke-ComposeCapture([string[]] $ComposeArguments, [switch] $TestProfile) {
    $prefix = @(Get-ComposePrefix -TestProfile:$TestProfile)
    Push-Location $script:RepoRoot
    try {
        $output = & docker @prefix @ComposeArguments 2>&1
        $script:LastExternalExitCode = $LASTEXITCODE
    }
    finally {
        Pop-Location
    }

    if ($script:LastExternalExitCode -ne 0) {
        Fail ("Docker Compose command failed (exit {0}): {1}`n{2}" -f $script:LastExternalExitCode, ($ComposeArguments -join ' '), ($output -join "`n"))
    }

    return (($output -join "`n").Trim())
}

function New-RandomSecret {
    $bytes = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $rng.GetBytes($bytes)
    }
    finally {
        $rng.Dispose()
    }

    return [Convert]::ToBase64String($bytes)
}

function Read-LocalEnv {
    $values = @{}
    if (-not (Test-Path $script:EnvFile)) {
        return $values
    }

    foreach ($line in Get-Content -LiteralPath $script:EnvFile) {
        if ($line -match '^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$') {
            $values[$matches[1]] = $matches[2]
        }
    }

    return $values
}

function Ensure-LocalEnv([switch] $CreateIfMissing) {
    if (Test-Path $script:EnvFile) {
        $values = Read-LocalEnv
        $required = @(
            'LOCAL_APP_KEY',
            'LOCAL_DB_PASSWORD',
            'LOCAL_TEST_APP_KEY',
            'LOCAL_TEST_DB_PASSWORD'
        )
        $missing = @($required | Where-Object { -not $values.ContainsKey($_) -or [string]::IsNullOrWhiteSpace([string]$values[$_]) })
        if ($missing.Count -gt 0) {
            Fail ("Local env exists but is incomplete ({0}). Restore deploy/local/.env instead of generating a new DB password." -f ($missing -join ', '))
        }

        return
    }

    if (-not $CreateIfMissing) {
        Fail ("Local env is missing: {0}. Run 'scripts/local.ps1 init' once to create it." -f $script:EnvFile)
    }

    $lines = @(
        '# Generated by scripts/local.ps1 init. Keep this file private.',
        ('LOCAL_APP_KEY=base64:{0}' -f (New-RandomSecret)),
        'LOCAL_DB_DATABASE=noteflow',
        'LOCAL_DB_USERNAME=noteflow',
        ('LOCAL_DB_PASSWORD={0}' -f (New-RandomSecret)),
        ('LOCAL_TEST_APP_KEY=base64:{0}' -f (New-RandomSecret)),
        'LOCAL_TEST_DB_DATABASE=noteflow_test',
        'LOCAL_TEST_DB_USERNAME=noteflow',
        ('LOCAL_TEST_DB_PASSWORD={0}' -f (New-RandomSecret))
    )

    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [IO.File]::WriteAllText($script:EnvFile, ($lines -join "`n") + "`n", $utf8NoBom)
    Write-Host ("Created local env at {0}; generated secrets are not printed." -f $script:EnvFile)
}

function Get-LockPath {
    $hash = [System.Security.Cryptography.SHA256]::Create()
    try {
        $inputBytes = [Text.Encoding]::UTF8.GetBytes($script:RepoRoot.ToLowerInvariant())
        $digest = $hash.ComputeHash($inputBytes)
    }
    finally {
        $hash.Dispose()
    }

    # Windows PowerShell 5.1/.NET Framework does not provide Convert.ToHexString.
    $hexDigest = [BitConverter]::ToString($digest).Replace('-', '')
    $shortDigest = $hexDigest.ToLowerInvariant().Substring(0, 16)
    return (Join-Path ([IO.Path]::GetTempPath()) ("noteflow-local-{0}.lock" -f $shortDigest))
}

function Enter-RuntimeLock {
    $lockPath = Get-LockPath
    try {
        $script:LockStream = [IO.File]::Open($lockPath, [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    }
    catch {
        Fail ("Another local runtime operation is already running for {0}." -f $script:RepoRoot)
    }
}

function Assert-DevIdentity {
    $names = @('APP_ENV', 'DB_HOST', 'DB_DATABASE', 'DB_URL')
    $values = @{}
    foreach ($name in $names) {
        $values[$name] = (Invoke-ComposeCapture @('exec', '-T', 'backend', 'printenv', $name)).Trim()
    }

    if ($values['APP_ENV'] -ne 'local' -or $values['DB_HOST'] -ne 'postgres' -or $values['DB_DATABASE'] -ne 'noteflow' -or $values['DB_URL'] -ne '') {
        Fail ("Refusing to act on an unexpected dev database identity: APP_ENV={0}, DB_HOST={1}, DB_DATABASE={2}, DB_URL={3}." -f $values['APP_ENV'], $values['DB_HOST'], $values['DB_DATABASE'], $values['DB_URL'])
    }
}

function Assert-TestIdentity {
    $names = @('APP_ENV', 'DB_HOST', 'DB_PORT', 'DB_DATABASE', 'DB_URL')
    $expected = @{
        APP_ENV = 'testing'
        DB_HOST = 'postgres-test'
        DB_PORT = '5432'
        DB_DATABASE = 'noteflow_test'
        DB_URL = ''
    }
    $values = @{}
    foreach ($name in $names) {
        $values[$name] = (Invoke-ComposeCapture @('exec', '-T', 'backend-test', 'printenv', $name) -TestProfile).Trim()
    }

    foreach ($name in $names) {
        if ($values[$name] -ne $expected[$name]) {
            Fail ("Refusing to act on an unexpected test database identity: {0}={1}." -f $name, $values[$name])
        }
    }
}

function Invoke-NodeTestCommand([string[]] $Arguments) {
    Push-Location (Join-Path $script:RepoRoot 'tests/e2e')
    try {
        & npm.cmd @Arguments
        $script:LastExternalExitCode = $LASTEXITCODE
    }
    finally {
        Pop-Location
    }

    if ($script:LastExternalExitCode -ne 0) {
        Fail ("Node test command failed (exit {0}): npm {1}" -f $script:LastExternalExitCode, ($Arguments -join ' '))
    }
}

function Invoke-TestServices {
    Invoke-Compose @('up', '-d', '--wait', 'postgres-test', 'backend-test') -TestProfile
    Assert-TestIdentity
    Invoke-Compose @('exec', '-T', 'backend-test', 'php', 'artisan', 'migrate', '--force') -TestProfile
}

function Invoke-BackendTests {
    Invoke-TestServices
    Invoke-Compose @('exec', '-T', 'backend-test', 'php', 'artisan', 'test') -TestProfile
}

function Invoke-ComposeE2e {
    Invoke-TestServices

    $names = @('NOTEFLOW_E2E_MODE', 'APP_ENV', 'DB_CONNECTION', 'DB_HOST', 'DB_PORT', 'DB_DATABASE', 'DB_USERNAME', 'DB_PASSWORD', 'DB_URL')
    $saved = @{}
    foreach ($name in $names) {
        $saved[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
    }

    try {
        $env:NOTEFLOW_E2E_MODE = 'compose'
        $env:APP_ENV = 'testing'
        $env:DB_CONNECTION = 'pgsql'
        $env:DB_HOST = 'postgres-test'
        $env:DB_PORT = '5432'
        $env:DB_DATABASE = 'noteflow_test'
        $env:DB_USERNAME = 'noteflow'
        $env:DB_PASSWORD = 'compose-managed'
        $env:DB_URL = ''
        Invoke-NodeTestCommand @('test')
    }
    finally {
        foreach ($name in $names) {
            [Environment]::SetEnvironmentVariable($name, $saved[$name], 'Process')
        }
    }
}

function Write-Help {
    @'
Usage: .\scripts\local.ps1 <action> [options]

Dev actions:
  init       Create deploy/local/.env once, build, start dev services, migrate, and verify PHP platform requirements.
  up         Start or reuse backend and postgres without rebuilding or deleting data.
  stop       Stop backend and postgres while retaining containers and volumes.
  status     Show services in the fixed noteflow-local Compose project.
  logs       Show the last 200 backend log lines.
  doctor     Validate Docker, canonical checkout, Compose model, and safe runtime identity.
  migrate    Run normal Laravel migrations against the verified dev database.
  owner      Run the interactive owner provisioning command; requires -OwnerEmail.
  rebuild    Rebuild the backend image and apply it while preserving env and volumes.

Test actions:
  test       Start the isolated test profile, migrate test DB, and run backend tests.
  e2e        Start the isolated test profile and run Playwright in Compose mode.
  test-stop  Stop only the isolated test services while retaining their volumes.
'@ | Write-Host
}

try {
    Assert-CanonicalCheckout
    Assert-RepositoryFiles

    if ($Action -eq 'help') {
        Write-Help
        exit 0
    }

    Assert-Docker
    $createsEnv = $Action -eq 'init'
    Ensure-LocalEnv -CreateIfMissing:$createsEnv

    $mutatingActions = @('init', 'up', 'stop', 'migrate', 'owner', 'rebuild', 'test', 'e2e', 'test-stop')
    if ($mutatingActions -contains $Action) {
        Enter-RuntimeLock
    }

    switch ($Action) {
        'init' {
            Invoke-Compose @('build', 'backend')
            Invoke-Compose @('up', '-d', '--wait', 'postgres', 'backend')
            Assert-DevIdentity
            Invoke-Compose @('exec', '-T', 'backend', 'php', 'artisan', 'migrate', '--force')
            Invoke-Compose @('exec', '-T', 'backend', 'composer', 'check-platform-reqs')
            Write-Host 'Local backend initialized and healthy.'
        }
        'up' {
            Invoke-Compose @('up', '-d', '--wait', '--no-build', 'postgres', 'backend')
            Assert-DevIdentity
            Write-Host 'Local backend is running.'
        }
        'stop' {
            Invoke-Compose @('stop', 'backend', 'postgres')
            Write-Host 'Local backend services stopped; containers and volumes were retained.'
        }
        'status' {
            Invoke-Compose @('ps')
        }
        'logs' {
            Invoke-Compose @('logs', '--tail', '200', 'backend')
        }
        'doctor' {
            Write-Host ("Canonical checkout: {0}" -f $script:RepoRoot)
            Write-Host ("HEAD: {0}" -f (Invoke-GitText @('rev-parse', '--short', 'HEAD')))
            Write-Host ("Compose project: {0}" -f $script:ProjectName)
            Invoke-Compose @('config', '--quiet')
            Invoke-Compose @('ps')
            try {
                Assert-DevIdentity
                Write-Host 'Dev database identity: local/postgres/noteflow (verified; secrets omitted).'
            }
            catch {
                Write-Warning $_.Exception.Message
            }
        }
        'migrate' {
            Assert-DevIdentity
            Invoke-Compose @('exec', '-T', 'backend', 'php', 'artisan', 'migrate', '--force')
        }
        'owner' {
            if ([string]::IsNullOrWhiteSpace($OwnerEmail)) {
                Fail "The owner action requires -OwnerEmail; it will prompt for the password interactively."
            }

            Assert-DevIdentity
            Invoke-Compose @('exec', 'backend', 'php', 'artisan', 'noteflow:provision-owner', $OwnerEmail)
        }
        'rebuild' {
            Invoke-Compose @('build', 'backend')
            Invoke-Compose @('up', '-d', '--wait', 'postgres', 'backend')
            Assert-DevIdentity
            Write-Host 'Local backend image rebuilt; database and generated secrets were retained.'
        }
        'test' {
            Invoke-BackendTests
        }
        'e2e' {
            Invoke-ComposeE2e
        }
        'test-stop' {
            Invoke-Compose @('stop', 'backend-test', 'postgres-test') -TestProfile
            Write-Host 'Test services stopped; test containers and volumes were retained.'
        }
    }
}
catch {
    Write-Error $_.Exception.Message
    if ($script:LastExternalExitCode -ne 0) {
        exit $script:LastExternalExitCode
    }

    exit 1
}
finally {
    if ($null -ne $script:LockStream) {
        $script:LockStream.Dispose()
        $script:LockStream = $null
    }
}
