param([string]$Id, [string]$Directory, [string]$Command)
$ErrorActionPreference = 'Continue'
$auditRoot = $PSScriptRoot
Set-Location -LiteralPath $Directory
$env:npm_config_cache = Join-Path $auditRoot '.npm-cache'
$env:npm_config_yes = 'false'
$env:PYTHONDONTWRITEBYTECODE = '1'
$env:PYTEST_ADDOPTS = "-o cache_dir=$auditRoot/pytest-cache"
$env:COMPOSER_CACHE_DIR = Join-Path $auditRoot '.composer-cache'
$logPath = Join-Path $auditRoot "$Id.log"
$started = [DateTime]::UtcNow.ToString('o')
$timer = [Diagnostics.Stopwatch]::StartNew()
$global:LASTEXITCODE = 0
try { & ([scriptblock]::Create($Command)) *>&1 | Out-File -LiteralPath $logPath -Encoding utf8; $code = $LASTEXITCODE } catch { $_ | Out-File -LiteralPath $logPath -Append -Encoding utf8; $code = 1 }
$timer.Stop()
$record = [ordered]@{ id=$Id; command=$Command; cwd=$Directory; started_utc=$started; seconds=$timer.Elapsed.TotalSeconds; exit_code=$code; log="$Id.log" }
$record | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $auditRoot "$Id.meta.json") -Encoding utf8
$record | ConvertTo-Json -Compress
Get-Content -LiteralPath $logPath -Tail 30
exit $code
