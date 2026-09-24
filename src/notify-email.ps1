# notify-email: read or toggle the away switch, or verify SMTP.
#
#   notify-email            -> status
#   notify-email check      -> send a test email (verifies SMTP + recipient)
#   notify-email on / off   -> flip the away auto-push switch
#
# The switch lives in the config file and is read fresh on every event, so a
# change takes effect without restarting opencode.

param(
    [Parameter(Position = 0)][string]$Action = "status"
)

$ErrorActionPreference = "Stop"

$cfg = Join-Path $env:USERPROFILE ".config\opencode\notify-email.json"
$here = Split-Path $MyInvocation.MyCommand.Path -Parent

switch ($Action.ToLower()) {
    "check" {
        & bun run "$here\notify.ts" --check
        exit $LASTEXITCODE
    }
    "on"  { $set = $true }
    "off" { $set = $false }
    default { $set = $null }
}

if (-not (Test-Path $cfg)) {
    Write-Output "config not found: $cfg"
    Write-Output "create it with an smtp block + a to address (see README)."
    exit 1
}

$json = Get-Content $cfg -Raw | ConvertFrom-Json

if ($null -ne $set) {
    $json.awayNotify = [pscustomobject]@{ enabled = $set }
    $out = $json | ConvertTo-Json -Depth 12
    [System.IO.File]::WriteAllText($cfg, $out, (New-Object System.Text.UTF8Encoding($false)))
    Write-Output ("away auto-push: " + $(if ($set) { "ON" } else { "OFF" }) + "  (takes effect immediately)")
    exit 0
}

$on = if ($json.awayNotify -is [bool]) { $json.awayNotify } else { $json.awayNotify.enabled -eq $true }
Write-Output ("away auto-push: " + $(if ($on) { "ON" } else { "OFF" }))
Write-Output "config: $cfg"
