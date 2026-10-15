# Run Waypoint as your private service on Windows

The production app remains on **127.0.0.1:4321**. **Tailscale Serve** provides private HTTPS access to authenticated devices allowed by your tailnet access policy. This is a single-owner/private-network deployment, not a multi-tenant public SaaS. Do not use Tailscale Funnel, router port forwarding, or bind the app to a LAN/public interface. Access is controlled by Tailscale, not by a separate Waypoint password page.

## Setup

1. Install Node.js 24+, dependencies (`npm ci`) and [Tailscale for Windows](https://tailscale.com/docs/install/windows). Sign in to your own Tailscale account.
2. Run `npm run build` in the checkout.
3. Run `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-private-service.ps1`.
4. Run `tailscale serve --bg --https=443 http://127.0.0.1:4321` and complete the Tailscale HTTPS/Serve enablement if prompted.
5. Open the HTTPS URL printed by Serve. On another device, install Tailscale, sign in to the same account/authorized tailnet, connect, then open that private URL.

The service launcher reads the device’s private DNS name from Tailscale and sets `WAYPOINT_PRIVATE_ORIGIN` only for the server process. It uses the same absolute local SQLite database as the app. The hostname guard accepts loopback and this one configured `.ts.net` hostname; browser writes must come from an allowed origin. No arbitrary trusted proxies or broad CORS are enabled. The source template contains no personal tailnet name, login URLs or account credentials.

`run-private-service.ps1` supervises the production process, retries startup when Tailscale is unavailable, and restarts a crashed process after ten seconds. Logs and the supervisor PID file live in ignored `artifacts/`. The process is launched with its window hidden. The development processes on ports 4318/5173 remain separate. The start helper prefers the registered task named **Waypoint SEO Private Service** after checking its executable, exact script arguments, and checkout directory. If that task is absent, it starts a hidden supervisor for the current session.

For this workspace, the service now runs through a verified **Windows Task Scheduler task** named “Waypoint SEO Private Service”. It starts at this user's Windows sign-in, runs with that user's ordinary permissions, ignores duplicate starts, and has no execution time limit. Task Scheduler can retry a failed supervisor up to three times at one-minute intervals. The former Waypoint Startup shortcut was removed only after the scheduled task served successful loopback and private HTTPS health checks. Other Startup shortcuts were preserved. A full reboot/logoff recovery was not tested.

The PC must remain powered on and awake; the app is not available while it sleeps, is shut down, or is signed out. No sleep/power policy was changed. Tailscale unattended mode is optional; it alone does not make a user-session app run before Windows sign-in.

## Optional sign-in startup on another Windows computer

The cloned source does not register a scheduled task or install Tailscale. To create the same per-user task, run this once in PowerShell from the project root, after installing dependencies and building the app. Stop an existing manually launched private service first with the stop helper. This registration deliberately does not overwrite an existing task with the same name.

```powershell
$projectRoot = (Get-Location).Path
$runner = Join-Path $projectRoot 'scripts\run-private-service.ps1'
$userId = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$powerShell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$action = New-ScheduledTaskAction -Execute $powerShell -Argument ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $runner + '"') -WorkingDirectory $projectRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $userId
$principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName 'Waypoint SEO Private Service' -Action $action -Trigger $trigger -Principal $principal -Settings $settings
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-private-service.ps1
```

Keep the checkout at the registered path. Moving it requires updating the task action and working directory; the helpers reject a task pointing at another checkout.

## Stop, restart and update

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/stop-private-service.ps1
git pull
npm ci
npm run build
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-private-service.ps1
```

The stop helper checks the task action, saved supervisor command line, and production worker's parent process before stopping anything. It stops the matching scheduled task first, cancelling task recovery, then stops only any verified supervisor/worker left running. A changed or unrelated PID is left untouched. Data and development servers are preserved. To stop private network serving separately, use `tailscale serve --https=443 off`. To disable automatic sign-in startup, stop the app with the helper and run `Disable-ScheduledTask -TaskName 'Waypoint SEO Private Service' -TaskPath '\'`. Enable the task again before using the start helper. Do not create a second Startup shortcut alongside the task.

Protect the Windows account and Tailscale account, review your tailnet access policy, and keep backups of the SQLite database. Anyone you authorize to this private service can access its shared workspace; there are no separate project/user roles. Do not share the tailnet service with friends unless you intend to share that data. Repository collaborator access does not automatically grant private service access.

The optional Claude subscription connection runs in **Claude Code on the host computer** through the local MCP server. It is not a remote subscription-backed web chat. Use `Start-Claude-SEO.cmd`. No separate API key is needed for that route; the in-app advisor remains an independent API feature.

Official references: [Serve examples](https://tailscale.com/docs/reference/examples/serve), [Serve CLI](https://tailscale.com/docs/reference/tailscale-cli/serve), [Windows unattended behavior](https://tailscale.com/docs/how-to/run-unattended), [Claude subscription in Claude Code](https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan).
