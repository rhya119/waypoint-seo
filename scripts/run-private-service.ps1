$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
Set-Location -LiteralPath $projectRoot
$tailscalePath = Join-Path $env:ProgramFiles 'Tailscale\tailscale.exe'
$nodePath = (Get-Command node -ErrorAction Stop).Source
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'dist\index.html'))) { throw 'Run npm ci and npm run build first.' }
$logDirectory = Join-Path $projectRoot 'artifacts\private-service'
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
$pidFile = Join-Path $projectRoot 'artifacts\private-service-supervisor.pid'
if (Test-Path -LiteralPath $pidFile) {
  $previousSupervisorId = 0
  if ([int]::TryParse((Get-Content -LiteralPath $pidFile -Raw).Trim(), [ref]$previousSupervisorId) -and $previousSupervisorId -gt 0 -and $previousSupervisorId -ne $PID) {
    $previousSupervisor = Get-CimInstance Win32_Process -Filter "ProcessId = $previousSupervisorId" -ErrorAction SilentlyContinue
    if ($previousSupervisor -and $previousSupervisor.Name -in @('powershell.exe', 'pwsh.exe') -and $previousSupervisor.CommandLine -match [regex]::Escape((Join-Path $PSScriptRoot 'run-private-service.ps1'))) { throw 'This checkout already has a private service supervisor; another was not started.' }
  }
}
if (Get-NetTCPConnection -State Listen -LocalPort 4321 -ErrorAction SilentlyContinue) { throw 'Port 4321 is already in use; an additional supervisor was not started.' }
Set-Content -LiteralPath $pidFile -Value $PID
$env:HOST = '127.0.0.1'
$env:PORT = '4321'
$env:DATABASE_PATH = Join-Path $projectRoot 'data\waypoint.sqlite'
# A local production process; Tailscale Serve is the authenticated network boundary.
while ($true) {
  try {
    $statusText = & $tailscalePath status --json
    if ($LASTEXITCODE -ne 0) { throw 'Tailscale status unavailable.' }
    $status = $statusText | ConvertFrom-Json
    if ($status.BackendState -ne 'Running' -or -not $status.Self.DNSName) { throw 'Connect Tailscale before starting the private service.' }
    $env:WAYPOINT_PRIVATE_ORIGIN = 'https://' + $status.Self.DNSName.TrimEnd('.')
    & $nodePath --import tsx server/index.ts 1>> (Join-Path $logDirectory 'server.log') 2>> (Join-Path $logDirectory 'server-error.log')
    Add-Content -LiteralPath (Join-Path $logDirectory 'supervisor.log') -Value "$(Get-Date -Format o) Server exited ($LASTEXITCODE); restarting in 10 seconds."
  } catch { Add-Content -LiteralPath (Join-Path $logDirectory 'supervisor.log') -Value "$(Get-Date -Format o) Waiting for local runtime/Tailscale: $($_.Exception.Message)" }
  Start-Sleep -Seconds 10
}
