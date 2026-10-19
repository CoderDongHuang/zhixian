$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if (!(Test-Path -LiteralPath (Join-Path $projectRoot '.env'))) { throw 'Configure DATABASE_URL in .env first.' }
$nodeExecutable = (Get-Command node -ErrorAction Stop).Source
if (!(Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules\@prisma\client'))) { throw 'Run npm ci first.' }
$runner = Join-Path $PSScriptRoot 'run-free-collection.ps1'
$powershellExecutable = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$action = New-ScheduledTaskAction -Execute $powershellExecutable -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -File "' + $runner + '" -NodeExecutable "' + $nodeExecutable + '"') -WorkingDirectory $projectRoot
$triggers = @((New-ScheduledTaskTrigger -Daily -At '08:15'), (New-ScheduledTaskTrigger -Daily -At '20:15'))
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 20) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 30) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName 'ZhiXian-Free-Collection' -Action $action -Trigger $triggers -Settings $settings -Principal $principal -Description 'Collect public RSS and APIs twice daily; no paid AI or notifications.' -Force | Select-Object TaskName,State
