$modulePath = Join-Path $PSScriptRoot '../local-runtime.psm1'
Describe 'Per-worktree test runtime decisions' {
    Import-Module $modulePath -Force

    It 'keeps the canonical project and ports' {
        $runtime = Get-LocalRuntimeConfiguration 'C:/repo' 'C:/repo/.git' 'C:/repo/.git' 'test'
        $runtime.IsLinked | Should Be $false
        $runtime.ProjectName | Should Be 'noteflow-local'
        $runtime.BackendPort | Should Be 8001
        $runtime.FrontendPort | Should Be 4173
    }
    It 'derives distinct stable projects from normalized absolute worktree paths' {
        $first = Get-LocalRuntimeConfiguration 'C:/worktree one' 'D:/repo/.git/worktrees/one' 'D:/repo/.git' 'test'
        $same = Get-LocalRuntimeConfiguration 'c:\worktree one\' 'D:/repo/.git/worktrees/one' 'D:/repo/.git' 'e2e'
        $other = Get-LocalRuntimeConfiguration 'C:/worktree two' 'D:/repo/.git/worktrees/two' 'D:/repo/.git' 'test'
        $first.ProjectName | Should Match '^noteflow-test-[a-f0-9]{12}$'
        $first.ProjectName | Should Be $same.ProjectName
        $first.BackendPort | Should Be $same.BackendPort
        $first.ProjectName | Should Not Be $other.ProjectName
        ($first.BackendPort -ge 20000 -and $first.FrontendPort -le 39999) | Should Be $true
        $first.FrontendPort | Should Be ($first.BackendPort + 1)
    }
    It 'allows only test actions in linked worktrees and refuses canonical test-down' {
        foreach ($action in @('test', 'e2e', 'test-stop', 'test-down')) {
            (Get-LocalRuntimeConfiguration 'C:/one' 'D:/repo/.git/worktrees/one' 'D:/repo/.git' $action).IsLinked | Should Be $true
        }
        foreach ($action in @('init', 'up', 'stop', 'status', 'logs', 'doctor', 'migrate', 'owner', 'rebuild', 'help')) {
            { Get-LocalRuntimeConfiguration 'C:/one' 'D:/repo/.git/worktrees/one' 'D:/repo/.git' $action } | Should Throw 'Linked worktree is not allowed'
        }
        { Get-LocalRuntimeConfiguration 'C:/repo' 'C:/repo/.git' 'C:/repo/.git' 'test-down' } | Should Throw 'only allowed in a linked worktree'
    }
    It 'resolves mount points inside only the calling checkout' {
        $paths = @(Get-TestMountPointPaths 'C:/worktree one')
        $paths.Count | Should Be 3
        $paths[0] | Should Be 'C:\worktree one\backend\vendor'
        $paths[1] | Should Be 'C:\worktree one\backend\storage'
        $paths[2] | Should Be 'C:\worktree one\backend\bootstrap\cache'
    }
}

Describe 'Test runtime port and Compose boundaries' {
    $repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
    $errors = $null
    $tokens = $null
    $ast = [Management.Automation.Language.Parser]::ParseFile((Join-Path $repo 'scripts/local.ps1'), [ref]$tokens, [ref]$errors)
    foreach ($name in @('Fail', 'Assert-TestPortAvailable')) {
        $definition = $ast.Find({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name }, $true)
        Invoke-Expression $definition.Extent.Text
    }
    It 'refuses an occupied frontend port instead of choosing another port' {
        $listener = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, 0)
        $listener.Start()
        try {
            $script:ProjectName = 'noteflow-test-abcdef123456'
            { Assert-TestPortAvailable $listener.LocalEndpoint.Port } | Should Throw 'is occupied'
        }
        finally { $listener.Stop() }
    }
    It 'releases a successful port probe immediately' {
        $listener = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, 0)
        $listener.Start()
        $port = $listener.LocalEndpoint.Port
        $listener.Stop()
        Assert-TestPortAvailable $port
        $probe = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, $port)
        try { $probe.Start() }
        finally { $probe.Stop() }
    }
    It 'keeps every Compose default stateful host and appends both worktree hosts' {
        foreach ($name in @('Invoke-GitText', 'Set-CheckoutRuntime')) {
            $definition = $ast.Find({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name }, $true)
            Invoke-Expression $definition.Extent.Text
        }
        $fixtureCompose = Join-Path $TestDrive 'compose-stateful.yaml'
        $compose = [IO.File]::ReadAllText((Join-Path $repo 'compose.local.yaml'))
        # An extra fixture host proves the wrapper consumes the file's defaults.
        $compose = $compose.Replace('NOTEFLOW_TEST_STATEFUL_DOMAINS:-localhost,', 'NOTEFLOW_TEST_STATEFUL_DOMAINS:-fixture.example:1234,localhost,')
        [IO.File]::WriteAllText($fixtureCompose, $compose)
        $script:RepoRoot = $repo
        $script:ComposeFile = $fixtureCompose
        $script:SavedRuntimeEnv = @{}
        $Action = 'test'
        try {
            Set-CheckoutRuntime
            $script:Runtime.IsLinked | Should Be $true
            $domains = $env:NOTEFLOW_TEST_STATEFUL_DOMAINS.Split(',')
            foreach ($domain in @('fixture.example:1234', 'localhost', 'localhost:3000', 'localhost:4173', 'localhost:5173', '127.0.0.1', '127.0.0.1:4173', '127.0.0.1:5173', '127.0.0.1:8000', '::1', '127.0.0.1:8001')) {
                ($domains -contains $domain) | Should Be $true
            }
            $domains[-2] | Should Be ('127.0.0.1:' + $script:Runtime.FrontendPort)
            $domains[-1] | Should Be ('127.0.0.1:' + $script:Runtime.BackendPort)
        }
        finally {
            foreach ($name in $script:SavedRuntimeEnv.Keys) {
                [Environment]::SetEnvironmentVariable($name, $script:SavedRuntimeEnv[$name], 'Process')
            }
        }
    }
    It 'renders independent test resources while leaving dev defaults unchanged' {
        $names = @('LOCAL_APP_KEY', 'LOCAL_DB_PASSWORD', 'LOCAL_TEST_APP_KEY', 'LOCAL_TEST_DB_PASSWORD', 'NOTEFLOW_TEST_PROJECT', 'NOTEFLOW_TEST_BACKEND_PORT', 'NOTEFLOW_TEST_STATEFUL_DOMAINS')
        $saved = @{}
        foreach ($name in $names) { $saved[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
        try {
            $env:LOCAL_APP_KEY = 'unused-fixture'
            $env:LOCAL_DB_PASSWORD = 'unused-fixture'
            $env:LOCAL_TEST_APP_KEY = 'unused-fixture'
            $env:LOCAL_TEST_DB_PASSWORD = 'unused-fixture'
            $env:NOTEFLOW_TEST_PROJECT = 'noteflow-test-abcdef123456'
            $env:NOTEFLOW_TEST_BACKEND_PORT = '23456'
            $env:NOTEFLOW_TEST_STATEFUL_DOMAINS = '127.0.0.1:23457'
            $model = (& docker compose --project-directory $repo --file (Join-Path $repo 'compose.local.yaml') --profile test config --format json | Out-String) | ConvertFrom-Json
            $LASTEXITCODE | Should Be 0
            $model.networks.test.name | Should Be 'noteflow-test-abcdef123456-test'
            $model.volumes.'postgres-test-data'.name | Should Be 'noteflow-test-abcdef123456-postgres-test-data'
            $model.volumes.'backend-test-vendor'.name | Should Be 'noteflow-test-abcdef123456-backend-test-vendor'
            $model.services.'backend-test'.ports[0].published | Should Be '23456'
            $model.services.'backend-test'.environment.SANCTUM_STATEFUL_DOMAINS | Should Be '127.0.0.1:23457'
            $model.services.'backend-test'.environment.DB_DATABASE | Should Be 'noteflow_test'
            $model.services.'backend-test'.environment.DB_URL | Should Be ''
            $model.services.backend.ports[0].published | Should Be '8000'
            $model.networks.dev.name | Should Be 'noteflow-local-dev'
            $model.volumes.'postgres-data'.name | Should Be 'noteflow-local-postgres-data'
            foreach ($name in @('NOTEFLOW_TEST_PROJECT', 'NOTEFLOW_TEST_BACKEND_PORT', 'NOTEFLOW_TEST_STATEFUL_DOMAINS')) {
                [Environment]::SetEnvironmentVariable($name, $null, 'Process')
            }
            $canonical = (& docker compose --project-directory $repo --file (Join-Path $repo 'compose.local.yaml') --profile test config --format json | Out-String) | ConvertFrom-Json
            $LASTEXITCODE | Should Be 0
            $canonical.services.'backend-test'.ports[0].published | Should Be '8001'
            $canonical.networks.test.name | Should Be 'noteflow-local-test'
            $canonical.services.'backend-test'.image | Should Be 'noteflow-local/backend:dev'
        }
        finally {
            foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $saved[$name], 'Process') }
        }
    }
}
