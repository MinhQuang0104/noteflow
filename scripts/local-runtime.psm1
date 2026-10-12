Set-StrictMode -Version Latest

function Get-NormalizedRuntimePath([string] $PathValue) {
    return [IO.Path]::GetFullPath($PathValue.Replace('/', '\')).TrimEnd('\').ToLowerInvariant()
}

function Get-LocalRuntimeConfiguration([string] $RepoRoot, [string] $GitDir, [string] $CommonDir, [string] $Action) {
    $linked = (Get-NormalizedRuntimePath $GitDir) -ne (Get-NormalizedRuntimePath $CommonDir)
    if ($linked -and $Action -notin @('test', 'e2e', 'test-stop', 'test-down')) {
        throw ("Linked worktree is not allowed for the shared local runtime. Run {0} from the canonical checkout." -f (Join-Path $RepoRoot 'scripts/local.ps1'))
    }
    if (-not $linked -and $Action -eq 'test-down') {
        throw 'test-down is only allowed in a linked worktree; canonical test data is retained.'
    }
    $project = 'noteflow-local'
    $backendPort = 8001
    $frontendPort = 4173
    if ($linked) {
        $hasher = [Security.Cryptography.SHA256]::Create()
        try { $digest = $hasher.ComputeHash([Text.Encoding]::UTF8.GetBytes((Get-NormalizedRuntimePath $RepoRoot))) }
        finally { $hasher.Dispose() }
        $hex = [BitConverter]::ToString($digest).Replace('-', '').ToLowerInvariant()
        $project = 'noteflow-test-' + $hex.Substring(0, 12)
        $backendPort = 20000 + ([Convert]::ToInt32($hex.Substring(0, 6), 16) % 10000) * 2
        $frontendPort = $backendPort + 1
    }
    return [pscustomobject]@{
        IsLinked = $linked
        ProjectName = $project
        BackendPort = $backendPort
        FrontendPort = $frontendPort
    }
}

function Get-TestMountPointPaths([string] $RepoRoot) {
    $root = [IO.Path]::GetFullPath($RepoRoot).TrimEnd('\', '/')
    foreach ($relative in @('backend/vendor', 'backend/storage', 'backend/bootstrap/cache')) {
        [IO.Path]::GetFullPath((Join-Path $root $relative))
    }
}

Export-ModuleMember -Function Get-LocalRuntimeConfiguration, Get-TestMountPointPaths
