[CmdletBinding()]
param(
    [switch] $SkipE2e
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$script:LastExternalExitCode = 0
$script:ScriptRoot = (Resolve-Path (Split-Path -Parent $MyInvocation.MyCommand.Path)).Path
$script:RepoRoot = (Resolve-Path (Join-Path $script:ScriptRoot '..')).Path
$script:LocalScript = Join-Path $script:RepoRoot 'scripts/local.ps1'
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
    $topLevel = (Invoke-GitText @('rev-parse', '--show-toplevel')).Trim()
    $gitDirRaw = (Invoke-GitText @('rev-parse', '--git-dir')).Trim()
    $commonDirRaw = (Invoke-GitText @('rev-parse', '--git-common-dir')).Trim()

    $topLevelResolved = (Resolve-Path $topLevel).Path.TrimEnd('\')
    if ($topLevelResolved -ne $script:RepoRoot.TrimEnd('\')) {
        Fail ("Verification must run from canonical checkout {0}; resolved {1}." -f $script:RepoRoot, $topLevelResolved)
    }

    function Resolve-GitPath([string] $PathValue) {
        if ([IO.Path]::IsPathRooted($PathValue)) {
            return [IO.Path]::GetFullPath($PathValue).TrimEnd('\')
        }

        return [IO.Path]::GetFullPath((Join-Path $script:RepoRoot $PathValue)).TrimEnd('\')
    }

    if ((Resolve-GitPath $gitDirRaw) -ne (Resolve-GitPath $commonDirRaw)) {
        Fail 'Verification refuses a linked worktree; use the canonical checkout.'
    }
}

function Assert-Docker {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Fail 'Docker CLI is unavailable.'
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
        Fail ("Docker context '{0}' is unavailable." -f $script:DockerContext)
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

function Invoke-ComposeCapture([string[]] $Arguments, [switch] $TestProfile) {
    $prefix = @(Get-ComposePrefix -TestProfile:$TestProfile)
    Push-Location $script:RepoRoot
    try {
        $output = & docker @prefix @Arguments 2>&1
        $script:LastExternalExitCode = $LASTEXITCODE
    }
    finally {
        Pop-Location
    }

    if ($script:LastExternalExitCode -ne 0) {
        Fail ("Compose command failed (exit {0}): {1}`n{2}" -f $script:LastExternalExitCode, ($Arguments -join ' '), ($output -join "`n"))
    }

    return (($output -join "`n").Trim())
}

function Invoke-Local([string[]] $Arguments) {
    $hostCommand = Get-Command pwsh -ErrorAction SilentlyContinue
    if ($null -eq $hostCommand) {
        $hostCommand = Get-Command powershell.exe -ErrorAction SilentlyContinue
    }

    if ($null -eq $hostCommand) {
        Fail 'A PowerShell host is required to invoke scripts/local.ps1.'
    }

    & $hostCommand.Source -NoProfile -ExecutionPolicy Bypass -File $script:LocalScript @Arguments
    $script:LastExternalExitCode = $LASTEXITCODE
    if ($script:LastExternalExitCode -ne 0) {
        Fail ("local.ps1 failed (exit {0}): {1}" -f $script:LastExternalExitCode, ($Arguments -join ' '))
    }
}

function Get-ServiceIds([switch] $TestProfile) {
    $services = if ($TestProfile) { @('backend', 'postgres', 'backend-test', 'postgres-test') } else { @('backend', 'postgres') }
    $output = Invoke-ComposeCapture (@('ps', '-a', '-q') + $services) -TestProfile:$TestProfile
    $ids = @($output -split "`r?`n" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    if ($ids.Count -ne $services.Count) {
        Fail ("Expected {0} services in project {1}; found {2}." -f $services.Count, $script:ProjectName, $ids.Count)
    }

    return $ids
}

function Assert-IdsEqual([string[]] $Expected, [string[]] $Actual, [string] $Label) {
    if ($Expected.Count -ne $Actual.Count) {
        Fail ("{0}: service count changed from {1} to {2}." -f $Label, $Expected.Count, $Actual.Count)
    }

    $expectedSet = @($Expected | Sort-Object)
    $actualSet = @($Actual | Sort-Object)
    if (($expectedSet -join ',') -ne ($actualSet -join ',')) {
        Fail ("{0}: container IDs changed unexpectedly.`nBefore: {1}`nAfter: {2}" -f $Label, ($expectedSet -join ', '), ($actualSet -join ', '))
    }
}

function Assert-HttpSmoke {
    $health = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8000/up' -Headers @{ Accept = 'application/json' }
    if ($health.StatusCode -ne 200) {
        Fail ("Dev /up returned HTTP {0}." -f $health.StatusCode)
    }

    $foundation = Invoke-RestMethod -Method Get -Uri 'http://127.0.0.1:8000/api/v1/foundation' -Headers @{ Accept = 'application/json' }
    if ($foundation.status -ne 'ok' -or $foundation.service -ne 'noteflow-api') {
        Fail 'Dev foundation endpoint returned an unexpected payload.'
    }
}

function Assert-RuntimeIdentity {
    $identity = @{}
    foreach ($name in @('APP_ENV', 'DB_HOST', 'DB_DATABASE', 'DB_URL')) {
        $identity[$name] = (Invoke-ComposeCapture @('exec', '-T', 'backend', 'printenv', $name)).Trim()
    }

    if ($identity['APP_ENV'] -ne 'local' -or $identity['DB_HOST'] -ne 'postgres' -or $identity['DB_DATABASE'] -ne 'noteflow' -or $identity['DB_URL'] -ne '') {
        Fail ("Unexpected dev identity: APP_ENV={0}, DB_HOST={1}, DB_DATABASE={2}, DB_URL={3}." -f $identity['APP_ENV'], $identity['DB_HOST'], $identity['DB_DATABASE'], $identity['DB_URL'])
    }

    $version = (Invoke-ComposeCapture @('exec', '-T', 'backend', 'php', '-r', 'echo PHP_VERSION;')).Trim()
    if ($version -notmatch '^8\.4\.') {
        Fail ("Dev PHP runtime is {0}; expected 8.4.x." -f $version)
    }

    $postgresVersion = (Invoke-ComposeCapture @('exec', '-T', 'postgres', 'psql', '-U', 'noteflow', '-d', 'noteflow', '-Atc', 'show server_version')).Trim()
    if ($postgresVersion -notmatch '^17\.') {
        Fail ("Dev PostgreSQL runtime is {0}; expected 17.x." -f $postgresVersion)
    }
}

function Assert-Topology {
    $devIds = Get-ServiceIds
    $backendPorts = (docker --context $script:DockerContext inspect $devIds[0] --format '{{json .NetworkSettings.Ports}}').Trim()
    $postgresPorts = (docker --context $script:DockerContext inspect $devIds[1] --format '{{json .NetworkSettings.Ports}}').Trim()
    if ($backendPorts -notmatch '127\.0\.0\.1' -or $backendPorts -notmatch '8000') {
        Fail ("Backend is not loopback-bound to port 8000: {0}" -f $backendPorts)
    }

    if ($postgresPorts -notmatch 'null' -and $postgresPorts -notin @('{}', '')) {
        Fail ("Dev PostgreSQL unexpectedly publishes a host port: {0}" -f $postgresPorts)
    }

    $mounts = (docker --context $script:DockerContext inspect $devIds[0] --format '{{range .Mounts}}{{.Destination}}={{.RW}};{{end}}').Trim()
    if ($mounts -notmatch '/workspace/backend=False' -or $mounts -notmatch '/workspace/contracts=False') {
        Fail ("Backend source mounts are not read-only: {0}" -f $mounts)
    }
}

function Assert-OldContainerPreserved {
    $old = docker --context $script:DockerContext inspect noteflow-backend-ci-postgres --format '{{.Id}}|{{.State.Status}}|{{.Config.Image}}|{{range .Mounts}}{{.Name}}={{.Destination}};{{end}}'
    $script:LastExternalExitCode = $LASTEXITCODE
    if ($script:LastExternalExitCode -ne 0) {
        Fail 'The pre-existing noteflow-backend-ci-postgres container is missing.'
    }

    if (($old -join '') -notmatch '^8974fcd63265e74e2f669780c2204da958b29b0f59ddfc9000579841bba6a92a\|exited\|postgres:17\|') {
        Fail ("The pre-existing PostgreSQL container identity changed: {0}" -f ($old -join ''))
    }

    $volume = docker --context $script:DockerContext volume inspect f9e66a1661ba96ecb617bd340f27f45ed9dff31e6aacb7cbde62fc494d313d0c --format '{{.Name}}|{{.Mountpoint}}'
    $script:LastExternalExitCode = $LASTEXITCODE
    if ($script:LastExternalExitCode -ne 0 -or ($volume -join '') -notmatch '^f9e66a1661ba96ecb617bd340f27f45ed9dff31e6aacb7cbde62fc494d313d0c\|') {
        Fail 'The pre-existing anonymous PostgreSQL volume is missing or changed.'
    }
}

try {
    Assert-CanonicalCheckout
    Assert-Docker
    if (-not (Test-Path $script:EnvFile)) {
        Fail 'deploy/local/.env is missing; run local.ps1 init before verification.'
    }

    Write-Host 'Verification: initialize/reuse dev services.'
    Invoke-Local @('up')
    $initialDevIds = @(Get-ServiceIds)

    for ($iteration = 1; $iteration -le 3; $iteration++) {
        Invoke-Local @('up')
        Assert-IdsEqual $initialDevIds @(Get-ServiceIds) ("up iteration {0}" -f $iteration)
    }

    Write-Host 'Verification: stop/up preserves dev IDs.'
    Invoke-Local @('stop')
    Invoke-Local @('up')
    Assert-IdsEqual $initialDevIds @(Get-ServiceIds) 'stop/up'
    Assert-RuntimeIdentity
    Assert-HttpSmoke
    Assert-Topology

    $envFingerprint = (Get-FileHash -LiteralPath $script:EnvFile -Algorithm SHA256).Hash
    Write-Host ("Local env fingerprint: {0}" -f $envFingerprint)

    Write-Host 'Verification: isolated backend tests preserve dev services.'
    Invoke-Local @('test')
    Assert-IdsEqual $initialDevIds @(Get-ServiceIds) 'dev after backend test'
    Assert-HttpSmoke

    if (-not $SkipE2e) {
        Write-Host 'Verification: Compose E2E.'
        Invoke-Local @('e2e')
        Assert-IdsEqual $initialDevIds @(Get-ServiceIds) 'dev after E2E'
        Invoke-Local @('test-stop')
    }
    else {
        Invoke-Local @('test-stop')
    }

    Assert-OldContainerPreserved
    $trackedEnv = @(git ls-files -- deploy/local/.env)
    $script:LastExternalExitCode = $LASTEXITCODE
    if ($script:LastExternalExitCode -ne 0) {
        Fail ("Unable to inspect Git tracking for deploy/local/.env (exit {0})." -f $script:LastExternalExitCode)
    }

    if ([string]::IsNullOrWhiteSpace(($trackedEnv -join ''))) {
        Write-Host 'Secret check: deploy/local/.env is not tracked.'
    }
    else {
        Fail 'Secret check failed: deploy/local/.env is tracked by Git.'
    }

    # Windows PowerShell 5.1 can promote native stderr warnings to terminating
    # errors; preserve the caller preference and validate the native exit code.
    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $diffCheck = & git diff --check -- README.md compose.local.yaml deploy/local scripts docs/development tests/e2e/helpers tests/e2e/playwright.config.ts docs/superpowers/plans/2026-09-29-unified-local-backend-plan.md 2>$null
        $script:LastExternalExitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
    if ($script:LastExternalExitCode -ne 0) {
        Fail ("git diff --check failed (exit {0}): {1}" -f $script:LastExternalExitCode, ($diffCheck -join "`n"))
    }

    Write-Host 'Negative cases not destructive-tested: Docker-off, port-holder kill, linked-worktree execution, and concurrent mutator race. The wrapper has explicit guards for these cases; this verification leaves all existing workloads untouched.'
    Write-Host 'Local runtime verification completed.'
}
catch {
    Write-Error $_.Exception.Message
    if ($script:LastExternalExitCode -ne 0) {
        exit $script:LastExternalExitCode
    }

    exit 1
}
