$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$runner = Join-Path $projectRoot 'scripts\run-private-service.ps1'
$taskName = 'Waypoint SEO Private Service'
$task = Get-ScheduledTask -TaskName $taskName -TaskPath '\' -ErrorAction SilentlyContinue
if ($task) {
  $expectedPowerShell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $expectedArguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $runner + '"'
  if (@($task.Actions).Count -ne 1 -or $task.Actions[0].Execute -ine $expectedPowerShell -or $task.Actions[0].Arguments -ine $expectedArguments -or $task.Actions[0].WorkingDirectory -ine $projectRoot) {
    throw 'The named scheduled task belongs to a different configuration. No task or process was started.'
  }
}
$tailscalePath = Join-Path $env:ProgramFiles 'Tailscale\tailscale.exe'
$tailText = & $tailscalePath status --json
if ($LASTEXITCODE -ne 0) { throw 'Install Tailscale and sign in first.' }
$tail = $tailText | ConvertFrom-Json
if ($tail.BackendState -ne 'Running') { throw 'Sign in to Tailscale first.' }
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'dist\index.html'))) { throw 'Build the application before starting the private service.' }
if ($task -and $task.State -eq 'Running') {
  Write-Host 'The private service scheduled task is already running.'
  Write-Host ('Private URL: https://' + $tail.Self.DNSName.TrimEnd('.'))
  return
}
$listeners = Get-NetTCPConnection -State Listen -LocalPort 4321 -ErrorAction SilentlyContinue
if ($listeners) { throw 'Port 4321 is already in use. Check the existing private service before starting another.' }
if ($task) {
  Start-ScheduledTask -TaskName $taskName -TaskPath '\'
  Write-Host 'Started the private service through its verified scheduled task.'
} else {
  $runtimeDirectory = Join-Path $projectRoot 'artifacts'
  New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null
  $child = Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $runner + '"')) -WindowStyle Hidden -PassThru
  Write-Host "Started private service supervisor PID $($child.Id) for this session. Automatic sign-in startup requires a scheduled task."
}
Write-Host ('Private URL: https://' + $tail.Self.DNSName.TrimEnd('.'))
