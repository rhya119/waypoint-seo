$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$runner = Join-Path $projectRoot 'scripts\run-private-service.ps1'
$taskName = 'Waypoint SEO Private Service'
$task = Get-ScheduledTask -TaskName $taskName -TaskPath '\' -ErrorAction SilentlyContinue
if ($task) {
  $expectedPowerShell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $expectedArguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $runner + '"'
  if (@($task.Actions).Count -ne 1 -or $task.Actions[0].Execute -ine $expectedPowerShell -or $task.Actions[0].Arguments -ine $expectedArguments -or $task.Actions[0].WorkingDirectory -ine $projectRoot) {
    throw 'The named scheduled task belongs to a different configuration. Nothing was stopped.'
  }
}
$pidFile = Join-Path $projectRoot 'artifacts\private-service-supervisor.pid'
$verifiedSupervisor = $null
if (Test-Path -LiteralPath $pidFile) {
  $supervisorId = 0
  if (-not [int]::TryParse((Get-Content -LiteralPath $pidFile -Raw).Trim(), [ref]$supervisorId) -or $supervisorId -le 0) { throw 'The private service PID file is invalid; nothing was stopped.' }
  $supervisor = Get-CimInstance Win32_Process -Filter "ProcessId = $supervisorId" -ErrorAction SilentlyContinue
  if ($supervisor) {
    if ($supervisor.Name -notin @('powershell.exe', 'pwsh.exe') -or $supervisor.CommandLine -notmatch [regex]::Escape($runner)) { throw 'The recorded PID belongs to a different process; nothing was stopped.' }
    $verifiedSupervisor = $supervisor
  }
}
$listener = Get-NetTCPConnection -State Listen -LocalPort 4321 -ErrorAction SilentlyContinue | Select-Object -First 1
$verifiedWorker = $null
if ($listener) {
  $worker = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)"
  if ($worker.Name -ne 'node.exe' -or $worker.CommandLine -notmatch ' --import tsx server/index\.ts(?:\s|$)' -or -not $verifiedSupervisor -or $worker.ParentProcessId -ne $verifiedSupervisor.ProcessId) { throw 'The port 4321 process could not be attributed to the verified supervisor; nothing was stopped.' }
  $verifiedWorker = $worker
}
# Cancel Task Scheduler recovery before terminating a supervisor or remaining child.
if ($task) { Stop-ScheduledTask -TaskName $taskName -TaskPath '\' }
foreach ($capturedProcess in @($verifiedSupervisor, $verifiedWorker)) {
  if (-not $capturedProcess) { continue }
  $remainingProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $($capturedProcess.ProcessId)" -ErrorAction SilentlyContinue
  if ($remainingProcess) {
    if ($remainingProcess.CreationDate -ne $capturedProcess.CreationDate -or $remainingProcess.CommandLine -cne $capturedProcess.CommandLine) { throw 'A recorded process identity changed during shutdown; the new process was left unchanged.' }
    Stop-Process -Id $remainingProcess.ProcessId
  }
}
Write-Host 'Private service stopped. Data and the development server were preserved.'
