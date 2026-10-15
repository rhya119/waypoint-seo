param([string]$Owner, [string]$Name = 'waypoint-seo')
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw 'Install GitHub CLI from https://cli.github.com, then run gh auth login.' }
gh auth status
if ($LASTEXITCODE -ne 0) { throw 'Run gh auth login first.' }
$existingOrigin = git config --get remote.origin.url
if ($existingOrigin) { throw 'An origin remote already exists. Inspect it before creating a new repository.' }
if (-not $Owner) { $Owner = gh api user --jq .login }
if ($Owner -notmatch '^[A-Za-z0-9-]+$' -or $Name -notmatch '^[A-Za-z0-9_.-]+$') { throw 'Invalid GitHub owner or repository name.' }
gh repo create "$Owner/$Name" --private --source . --remote origin --push --description 'Independent SEO research toolkit with demo providers and a local HTML audit'
if ($LASTEXITCODE -ne 0) { throw 'GitHub repository creation or push failed. Inspect gh output before retrying.' }
gh repo view "$Owner/$Name" --json url,isPrivate
