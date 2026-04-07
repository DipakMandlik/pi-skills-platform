[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = "High")]
param(
  [switch]$Hard,
  [switch]$ResetDb,
  [switch]$NoStart,
  [switch]$SkipInstall,
  [switch]$SkipEnvCheck,
  [switch]$Yes
)

$ErrorActionPreference = "Stop"

function Remove-IfExists {
  param([Parameter(Mandatory = $true)][string]$PathToRemove)
  if (Test-Path -LiteralPath $PathToRemove) {
    Remove-Item -LiteralPath $PathToRemove -Recurse -Force -ErrorAction SilentlyContinue
  }
}

function Invoke-Checked {
  param([Parameter(Mandatory = $true)][string]$Label, [Parameter(Mandatory = $true)][scriptblock]$Action)
  Write-Host "==> $Label" -ForegroundColor Cyan
  & $Action
  if ($LASTEXITCODE -ne 0) {
    throw "$Label failed with exit code $LASTEXITCODE"
  }
}

function Get-ListeningPidOnPort {
  param([Parameter(Mandatory = $true)][int]$Port)

  # Ensure we always iterate lines (not characters) when there's only one match.
  $lines = @(cmd /c "netstat -ano | findstr :$Port" 2>$null)
  foreach ($line in $lines) {
    if ($line -match "LISTENING\s+(\d+)\s*$") {
      return [int]$Matches[1]
    }
  }
  return $null
}

function Get-ProcessCommandLine {
  param([Parameter(Mandatory = $true)][int]$Pid)
  try {
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$Pid"
    return $proc.CommandLine
  } catch {
    return $null
  }
}

function Try-StopOurProcessOnPort {
  param(
    [Parameter(Mandatory = $true)][int]$Port,
    [Parameter(Mandatory = $true)][string[]]$CommandLineHints,
    [string[]]$ProcessNameHints = @()
  )

  $listenPid = Get-ListeningPidOnPort -Port $Port
  if (-not $listenPid) { return }

  $cmdLine = Get-ProcessCommandLine -Pid $listenPid
  $looksLikeOurs = $false

  if ($cmdLine) {
    foreach ($hint in $CommandLineHints) {
      if ($cmdLine -match $hint) { $looksLikeOurs = $true; break }
    }
  } else {
    try {
      $p = Get-Process -Id $listenPid -ErrorAction Stop
      foreach ($name in $ProcessNameHints) {
        if ($p.ProcessName -ieq $name) { $looksLikeOurs = $true; break }
      }
    } catch {
      $looksLikeOurs = $false
    }
  }

  if (-not $looksLikeOurs) {
    Write-Host "Port $Port is in use by PID $listenPid." -ForegroundColor Yellow
    if ($cmdLine) { Write-Host "Command line: $cmdLine" -ForegroundColor Yellow }
    Write-Host "Not stopping it automatically. Please stop it manually if it's part of this project." -ForegroundColor Yellow
    return
  }

  Write-Host "Stopping existing process on port $Port (PID $listenPid)..." -ForegroundColor Yellow
  Stop-Process -Id $listenPid -Force -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 300
}

function Confirm-OrThrow {
  param([Parameter(Mandatory = $true)][string]$Message)

  if ($Yes) { return }
  $ok = $PSCmdlet.ShouldContinue($Message, "Confirm")
  if (-not $ok) { throw "Cancelled." }
}

function Get-DotEnvKeys {
  param([Parameter(Mandatory = $true)][string]$Path)

  $keys = New-Object 'System.Collections.Generic.HashSet[string]'
  if (-not (Test-Path -LiteralPath $Path)) { return $keys }

  foreach ($line in (Get-Content -LiteralPath $Path -ErrorAction Stop)) {
    $lineText = if ($null -eq $line) { "" } else { [string]$line }
    $t = $lineText.Trim()
    if (-not $t) { continue }
    if ($t.StartsWith("#")) { continue }
    if ($t -notmatch "^[A-Za-z_][A-Za-z0-9_]*=") { continue }
    $k = $t.Substring(0, $t.IndexOf("="))
    [void]$keys.Add($k)
  }
  return $keys
}

function Get-DotEnvValue {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Key
  )

  if (-not (Test-Path -LiteralPath $Path)) { return $null }
  foreach ($line in (Get-Content -LiteralPath $Path -ErrorAction Stop)) {
    $lineText = if ($null -eq $line) { "" } else { [string]$line }
    $t = $lineText.Trim()
    if ($t -match ("^{0}=" -f [regex]::Escape($Key))) {
      return $t.Substring($Key.Length + 1)
    }
  }
  return $null
}

function Ensure-EnvLocal {
  $envLocal = ".env.local"
  $envExample = ".env.example"

  if (-not (Test-Path -LiteralPath $envLocal)) {
    if (Test-Path -LiteralPath $envExample) {
      Write-Host "==> Creating .env.local from .env.example" -ForegroundColor Cyan
      Copy-Item -LiteralPath $envExample -Destination $envLocal -Force
    } else {
      throw "Missing .env.local (and no .env.example to copy from). Create .env.local and re-run."
    }
  }

  $required = @(
    "JWT_SECRET",
    "POSTGRES_DSN",
    "MCP_BASE_URL",
    "ENABLE_BOOTSTRAP_SEED",
    "SNOWFLAKE_ACCOUNT",
    "SNOWFLAKE_USER",
    "SNOWFLAKE_PASSWORD",
    "SNOWFLAKE_ROLE",
    "SNOWFLAKE_WAREHOUSE",
    "SNOWFLAKE_DATABASE",
    "SNOWFLAKE_SCHEMA"
  )

  $keys = Get-DotEnvKeys -Path $envLocal
  $missing = @()
  foreach ($k in $required) {
    if (-not $keys.Contains($k)) { $missing += $k }
  }

  $jwt = Get-DotEnvValue -Path $envLocal -Key "JWT_SECRET"
  $jwtLooksOk = $false
  if ($jwt) {
    $v = $jwt.Trim('"').Trim("'")
    if ($v.Length -ge 32) { $jwtLooksOk = $true }
  }

  if ($missing.Count -gt 0 -or -not $jwtLooksOk) {
    Write-Host "==> .env.local needs attention" -ForegroundColor Yellow
    if ($missing.Count -gt 0) {
      Write-Host ("Missing keys: " + ($missing -join ", ")) -ForegroundColor Yellow
    }
    if (-not $jwtLooksOk) {
      Write-Host "JWT_SECRET looks too short (expected 32+ chars)." -ForegroundColor Yellow
    }
    throw "Fix .env.local and re-run. (Tip: open .env.local and fill any placeholders.)"
  }
}

if (-not $SkipEnvCheck) {
  Ensure-EnvLocal
}

Write-Host "==> Stopping local dev services (if running)" -ForegroundColor Cyan
Try-StopOurProcessOnPort -Port 8000 -CommandLineHints @("apps\.api\.main", "uvicorn") -ProcessNameHints @("python", "python3")
Try-StopOurProcessOnPort -Port 5000 -CommandLineHints @("apps\.mcp\.main", "uvicorn") -ProcessNameHints @("python", "python3")
Try-StopOurProcessOnPort -Port 3000 -CommandLineHints @("vite", "npm run dev", "vite --port=3000") -ProcessNameHints @()

Write-Host "==> Cleaning artifacts" -ForegroundColor Cyan
$artifacts = @(
  "dist",
  "coverage",
  "coverage.xml",
  "htmlcov",
  "results",
  ".pytest_cache",
  ".coverage",
  "__pycache__",
  "apps\\api\\__pycache__",
  "apps\\mcp\\__pycache__"
)

foreach ($item in $artifacts) {
  Remove-IfExists -PathToRemove $item
}

Get-ChildItem -Path . -Recurse -Directory -Filter "__pycache__" -ErrorAction SilentlyContinue | ForEach-Object {
  Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
}

if ($ResetDb) {
  Write-Host "==> Resetting local SQLite DB" -ForegroundColor Cyan
  Remove-IfExists -PathToRemove "ai_governance.db"
}

if ($Hard) {
  Confirm-OrThrow "Hard clean will delete .venv and node_modules and force reinstall. Continue?"
  Write-Host "==> Hard clean (dependencies)" -ForegroundColor Cyan
  Remove-IfExists -PathToRemove ".venv"
  Remove-IfExists -PathToRemove "node_modules"
}

if (-not $SkipInstall) {
  if ($Hard -or -not (Test-Path -LiteralPath "node_modules")) {
    Invoke-Checked -Label "Installing Node dependencies (npm ci)" -Action { npm ci }
  }

  if (-not (Test-Path -LiteralPath ".venv\\Scripts\\python.exe")) {
    Write-Host "==> Creating Python venv (.venv)" -ForegroundColor Cyan
    if (Get-Command py -ErrorAction SilentlyContinue) {
      py -3.12 -m venv .venv
    } else {
      python -m venv .venv
    }
  }

  Invoke-Checked -Label "Installing backend Python deps" -Action { npm run backend:install }
  Invoke-Checked -Label "Installing MCP Python deps" -Action { npm run mcp:install }
}

if ($NoStart) {
  Write-Host "==> Clean complete (NoStart)" -ForegroundColor Green
  exit 0
}

Write-Host "==> Starting all services (web + mcp + api)" -ForegroundColor Cyan
npm run dev:all
exit $LASTEXITCODE
