# tools/openbrain-up.ps1 — OpenBrain bring-up (PowerShell, primary per user_shell_preference).
#
# One command: docker compose up -d openbrain → wait for healthcheck → pnpm db:migrate.
# Runs without elevation on Windows 11 PowerShell 5.1.
#
# Usage (from repo root):
#   pwsh .\tools\openbrain-up.ps1
#   # or on Windows PowerShell:
#   powershell -ExecutionPolicy Bypass -File .\tools\openbrain-up.ps1

$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $repoRoot

Write-Host 'OpenBrain: starting docker compose service...'
docker compose up -d openbrain
if ($LASTEXITCODE -ne 0) { throw 'docker compose up failed' }

Write-Host 'OpenBrain: waiting for healthcheck...'
$timeoutSeconds = 60
$deadline = (Get-Date).AddSeconds($timeoutSeconds)
while ($true) {
    $health = (docker inspect --format '{{.State.Health.Status}}' openbrain 2>$null)
    if ($health -eq 'healthy') {
        Write-Host 'OpenBrain: healthy.'
        break
    }
    if ((Get-Date) -gt $deadline) {
        throw "OpenBrain did not become healthy within $timeoutSeconds seconds. Last status: $health"
    }
    Start-Sleep -Seconds 1
}

Write-Host 'OpenBrain: applying migrations...'
pnpm db:migrate
if ($LASTEXITCODE -ne 0) { throw 'pnpm db:migrate failed' }

Write-Host 'OpenBrain: ready.'
