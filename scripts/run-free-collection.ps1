param([string]$NodeExecutable = 'node')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$logDirectory = Join-Path $projectRoot 'test-results\local-collection'
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
$logFile = Join-Path $logDirectory ((Get-Date -Format 'yyyy-MM-dd-HHmmss') + '.log')
try {
    $ErrorActionPreference = 'Continue'
    & $NodeExecutable (Join-Path $PSScriptRoot 'collect-free.mjs') *> $logFile
    $collectionExitCode = $LASTEXITCODE
} catch {
    'Local collection could not start; check Node.js, .env and network.' | Out-File -LiteralPath $logFile -Append
    $collectionExitCode = 1
}
$ErrorActionPreference = 'Stop'
Get-ChildItem -LiteralPath $logDirectory -Filter '*.log' | Where-Object LastWriteTime -LT (Get-Date).AddDays(-14) | Remove-Item
exit $collectionExitCode
