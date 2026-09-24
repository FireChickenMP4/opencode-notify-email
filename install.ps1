# Install opencode-notify-email into the global opencode config.
#
# Copies the plugin + its client sources into ~/.config/opencode/plugins/,
# installs a `notify-email` shell function, and checks the config.
#
# Idempotent: safe to re-run.

param(
    [switch]$SkipShellFunction
)

$ErrorActionPreference = "Stop"

$repo = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }
$configDir = Join-Path $env:USERPROFILE ".config\opencode"
$pluginsDir = Join-Path $configDir "plugins"
$srcDir = Join-Path $pluginsDir "notify-email"

if (-not (Test-Path (Join-Path $repo "src\mail.ts"))) {
    throw "cannot find src/mail.ts under '$repo'. Run this script from the repo root."
}

Write-Output "installing from: $repo"
Write-Output "target:          $pluginsDir"

New-Item -ItemType Directory -Force -Path $srcDir | Out-Null

# All client sources travel with the plugin (a sibling dir, so opencode does not
# treat their exports as plugins).
$modules = @("config.ts", "mail.ts", "render.ts", "retry.ts", "transcript.ts", "client.ts", "notify.ts")
foreach ($m in $modules) {
    Copy-Item (Join-Path $repo "src\$m") (Join-Path $srcDir $m) -Force
}
Copy-Item (Join-Path $repo "plugins\notify-email.ts") (Join-Path $pluginsDir "notify-email.ts") -Force
Copy-Item (Join-Path $repo "src\notify-email.ps1") (Join-Path $srcDir "notify-email.ps1") -Force

# Runtime deps must be resolvable from the installed plugin; they are not bundled.
# Note: install one at a time. `npm install @missing` with an array splats each
# element as a separate arg AND can split single-char names, installing junk.
$deps = @("nodemailer", "marked")
foreach ($dep in $deps) {
    if (-not (Test-Path (Join-Path $configDir "node_modules\$dep"))) {
        Write-Output "installing missing dep into the global config: $dep..."
        $env:NODE_OPTIONS = "--use-system-ca"
        & npm install $dep --prefix $configDir --no-audit --no-fund | Out-Null
    }
}

# Shell function so `notify-email on|off|status|check` works anywhere.
if (-not $SkipShellFunction) {
    $cliScript = Join-Path $srcDir "notify-email.ps1"
    $begin = "# >>> opencode-notify-email >>>"
    $end = "# <<< opencode-notify-email <<<"
    $block = @"
$begin
function notify-email {
    param([Parameter(Position = 0)][string]`$Action = 'status')
    & "$cliScript" `$Action
}
$end
"@

    $docs = [Environment]::GetFolderPath("MyDocuments")
    foreach ($profilePath in @((Join-Path $docs "WindowsPowerShell\profile.ps1"), (Join-Path $docs "PowerShell\profile.ps1"))) {
        $dir = Split-Path $profilePath -Parent
        if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
        if (-not (Test-Path $profilePath)) { New-Item -ItemType File -Force -Path $profilePath | Out-Null }
        $existing = Get-Content $profilePath -Raw -ErrorAction SilentlyContinue
        if ($null -eq $existing) { $existing = "" }
        $pattern = "(?s)" + [regex]::Escape($begin) + ".*?" + [regex]::Escape($end)
        if ($existing -match $pattern) {
            $updated = [regex]::Replace($existing, $pattern, $block)
        } else {
            $sep = if ($existing.TrimEnd().Length -gt 0) { "`r`n`r`n" } else { "" }
            $updated = $existing.TrimEnd() + $sep + $block + "`r`n"
        }
        [System.IO.File]::WriteAllText($profilePath, $updated, (New-Object System.Text.UTF8Encoding($false)))
        Write-Output "shell function installed in: $profilePath"
    }
    Write-Output "  (open a new terminal, then: notify-email status|check|on|off)"
}

$cfg = Join-Path $configDir "notify-email.json"
Write-Output ""
if (Test-Path $cfg) {
    Write-Output "config found: $cfg"
} else {
    Write-Output "config MISSING: $cfg"
    Write-Output "Create it with an smtp block + a to address (see README)."
}

Write-Output ""
Write-Output "installed. Restart opencode, then the agent has the notify_email tool."
