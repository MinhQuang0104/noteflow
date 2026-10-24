Set-StrictMode -Version Latest

$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$modulePath = Join-Path $PSScriptRoot '../local-runtime.psm1'
$localScriptPath = Join-Path $PSScriptRoot '../local.ps1'

Describe 'Unchanged noteflow_test guards in repository boundary files' {
    It 'locks backend/phpunit.xml to the testing environment and noteflow_test database' {
        $xmlPath = Join-Path $repoRoot 'backend/phpunit.xml'
        (Test-Path $xmlPath) | Should Be $true
        [xml]$xml = Get-Content -LiteralPath $xmlPath

        $appEnv = $xml.SelectSingleNode('//env[@name="APP_ENV"]')
        $appEnv | Should Not Be $null
        $appEnv.value | Should Be 'testing'
        $appEnv.force | Should Be 'true'

        $dbConn = $xml.SelectSingleNode('//env[@name="DB_CONNECTION"]')
        $dbConn | Should Not Be $null
        $dbConn.value | Should Be 'pgsql'
        $dbConn.force | Should Be 'true'

        $dbHost = $xml.SelectSingleNode('//env[@name="DB_HOST"]')
        $dbHost | Should Not Be $null
        $dbHost.value | Should Be '127.0.0.1'
        $dbHost.force | Should Be 'true'

        $dbPort = $xml.SelectSingleNode('//env[@name="DB_PORT"]')
        $dbPort | Should Not Be $null
        $dbPort.value | Should Be '5432'
        $dbPort.force | Should Be 'true'

        $dbName = $xml.SelectSingleNode('//env[@name="DB_DATABASE"]')
        $dbName | Should Not Be $null
        $dbName.value | Should Be 'noteflow_test'
        $dbName.force | Should Be 'true'

        $dbUrl = $xml.SelectSingleNode('//env[@name="DB_URL"]')
        $dbUrl | Should Not Be $null
        $dbUrl.value | Should Be ''
        $dbUrl.force | Should Be 'true'
    }

    It 'locks backend/tests/TestCase.php to the expected test database and environment' {
        $testCasePath = Join-Path $repoRoot 'backend/tests/TestCase.php'
        (Test-Path $testCasePath) | Should Be $true
        $content = [IO.File]::ReadAllText($testCasePath)

        $content | Should Match 'const EXPECTED_TEST_DB\s*=\s*''noteflow_test'';'
        $content | Should Match 'const EXPECTED_TEST_ENV\s*=\s*''testing'';'
        $content | Should Match 'function assertSafeTestDatabase'
        $content | Should Match 'Refusing test execution: APP_ENV is'
        $content | Should Match 'EXPECTED_TEST_DB'
        $content | Should Match 'function registerDatabaseSafetyGuards'
    }

    It 'locks tests/e2e/helpers/db-helper.php to fail-closed on non-test environments and databases' {
        $dbHelperPath = Join-Path $repoRoot 'tests/e2e/helpers/db-helper.php'
        (Test-Path $dbHelperPath) | Should Be $true
        $content = [IO.File]::ReadAllText($dbHelperPath)

        $content | Should Match 'if \(\$appEnv !== ''testing''\)'
        $content | Should Match 'FATAL: db-helper is strictly fail-closed\. APP_ENV must be ''testing''\.'
        $content | Should Match 'if \(\$database !== ''noteflow_test''\)'
        $content | Should Match 'FATAL: db-helper is strictly forbidden to run on database'
        $content | Should Match 'if \(\$url !== ''''\)'
        $content | Should Match 'FATAL: db-helper requires DB_URL to be empty; refusing URL-based database identity\.'
        $content | Should Match '''postgres-test:5432'''
    }

    It 'ensures protected boundary files match the canonical baseline (git diff against main)' {
        Push-Location $repoRoot
        try {
            & git diff --exit-code main -- .github/workflows/ci.yml backend/phpunit.xml backend/tests/TestCase.php tests/e2e/helpers/db-helper.php | Out-Null
            $LASTEXITCODE | Should Be 0
        }
        finally {
            Pop-Location
        }
    }
}

Describe 'Assert-TestIdentity runtime guard' {
    $errors = $null
    $tokens = $null
    $ast = [Management.Automation.Language.Parser]::ParseFile($localScriptPath, [ref]$tokens, [ref]$errors)
    foreach ($name in @('Fail', 'Assert-TestIdentity')) {
        $definition = $ast.Find({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name }, $true)
        Invoke-Expression $definition.Extent.Text
    }

    It 'passes when container environment matches expected test identity' {
        function script:Invoke-ComposeCapture([string[]] $ComposeArguments, [switch] $TestProfile) {
            $name = $ComposeArguments[-1]
            switch ($name) {
                'APP_ENV' { return 'testing' }
                'DB_HOST' { return 'postgres-test' }
                'DB_PORT' { return '5432' }
                'DB_DATABASE' { return 'noteflow_test' }
                'DB_URL' { return '' }
                default { throw "Unexpected variable: $name" }
            }
        }

        { Assert-TestIdentity } | Should Not Throw
    }

    It 'fails closed when any test identity variable deviates' {
        $deviations = @(
            @{ Variable = 'APP_ENV'; BadValue = 'local' },
            @{ Variable = 'APP_ENV'; BadValue = 'production' },
            @{ Variable = 'DB_HOST'; BadValue = 'postgres' },
            @{ Variable = 'DB_HOST'; BadValue = '127.0.0.1' },
            @{ Variable = 'DB_PORT'; BadValue = '5433' },
            @{ Variable = 'DB_DATABASE'; BadValue = 'noteflow' },
            @{ Variable = 'DB_DATABASE'; BadValue = 'other_test' },
            @{ Variable = 'DB_URL'; BadValue = 'postgresql://noteflow:password@postgres:5432/noteflow' }
        )

        foreach ($case in $deviations) {
            function script:Invoke-ComposeCapture([string[]] $ComposeArguments, [switch] $TestProfile) {
                $name = $ComposeArguments[-1]
                if ($name -eq $case.Variable) {
                    return $case.BadValue
                }
                switch ($name) {
                    'APP_ENV' { return 'testing' }
                    'DB_HOST' { return 'postgres-test' }
                    'DB_PORT' { return '5432' }
                    'DB_DATABASE' { return 'noteflow_test' }
                    'DB_URL' { return '' }
                    default { throw "Unexpected variable: $name" }
                }
            }

            { Assert-TestIdentity } | Should Throw "Refusing to act on an unexpected test database identity: $($case.Variable)=$($case.BadValue)."
        }
    }
}

Describe 'Canonical-only dev action guards' {
    Import-Module $modulePath -Force

    $canonicalRepo = 'C:/repo'
    $canonicalGitDir = 'C:/repo/.git'
    $worktreeRepo = 'C:/worktrees/story-1-7'
    $worktreeGitDir = 'C:/repo/.git/worktrees/story-1-7'

    It 'refuses all dev actions from a linked worktree with the canonical error message' {
        $devActions = @('init', 'up', 'stop', 'status', 'logs', 'doctor', 'migrate', 'owner', 'rebuild', 'help')
        foreach ($action in $devActions) {
            { Get-LocalRuntimeConfiguration $worktreeRepo $worktreeGitDir $canonicalGitDir $action } |
                Should Throw 'Linked worktree is not allowed for the shared local runtime'
        }
    }

    It 'permits only test actions from a linked worktree' {
        $testActions = @('test', 'e2e', 'test-stop', 'test-down')
        foreach ($action in $testActions) {
            $config = Get-LocalRuntimeConfiguration $worktreeRepo $worktreeGitDir $canonicalGitDir $action
            $config.IsLinked | Should Be $true
            $config.ProjectName | Should Match '^noteflow-test-[a-f0-9]{12}$'
        }
    }

    It 'refuses test-down from canonical checkout while permitting test-stop' {
        { Get-LocalRuntimeConfiguration $canonicalRepo $canonicalGitDir $canonicalGitDir 'test-down' } |
            Should Throw 'test-down is only allowed in a linked worktree; canonical test data is retained.'

        $stopConfig = Get-LocalRuntimeConfiguration $canonicalRepo $canonicalGitDir $canonicalGitDir 'test-stop'
        $stopConfig.IsLinked | Should Be $false
        $stopConfig.ProjectName | Should Be 'noteflow-local'
    }
}

Describe 'Worktree test project cleanup guard (test-down)' {
    $errors = $null
    $tokens = $null
    $ast = [Management.Automation.Language.Parser]::ParseFile($localScriptPath, [ref]$tokens, [ref]$errors)
    foreach ($name in @('Fail', 'Remove-WorktreeTestProject')) {
        $definition = $ast.Find({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name }, $true)
        Invoke-Expression $definition.Extent.Text
    }

    It 'fails closed when invoked outside a linked worktree' {
        $script:Runtime = [pscustomobject]@{ IsLinked = $false }
        $script:ProjectName = 'noteflow-local'
        { Remove-WorktreeTestProject } | Should Throw 'Refusing cleanup outside the calling worktree test project.'
    }

    It 'fails closed when project name does not match expected worktree pattern' {
        $script:Runtime = [pscustomobject]@{ IsLinked = $true }
        $script:ProjectName = 'noteflow-local'
        { Remove-WorktreeTestProject } | Should Throw 'Refusing cleanup outside the calling worktree test project.'
    }
}
