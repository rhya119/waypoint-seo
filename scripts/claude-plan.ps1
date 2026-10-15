$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$claudePath = Join-Path $env:USERPROFILE '.local\bin\claude.exe'
if (-not (Test-Path -LiteralPath $claudePath)) { $claudePath = (Get-Command claude -ErrorAction Stop).Source }
# Change this launcher's environment only. Preserve the user's .env and account settings.
Remove-Item Env:ANTHROPIC_API_KEY -ErrorAction SilentlyContinue
Remove-Item Env:ANTHROPIC_AUTH_TOKEN -ErrorAction SilentlyContinue
Remove-Item Env:ANTHROPIC_BASE_URL -ErrorAction SilentlyContinue
$authText = & $claudePath auth status --json
if ($LASTEXITCODE -ne 0) { throw 'Run claude auth login and choose your Claude subscription account first.' }
$auth = $authText | ConvertFrom-Json
if (-not $auth.loggedIn -or $auth.authMethod -ne 'claude.ai') { throw 'Sign in through claude auth login with your Claude subscription account.' }
Write-Host 'Using your Claude account in Claude Code. Plan usage limits still apply.'
Write-Host 'Try: Analyze my imported SEO data for mydomain.com using the Waypoint tools.'
Write-Host 'For CSVs: ask Claude to validate the file first, then explicitly request the import.'
& $claudePath mcp get waypoint *> $null
if ($LASTEXITCODE -eq 0) { & $claudePath } else { & $claudePath --plugin-dir $projectRoot }
exit $LASTEXITCODE
