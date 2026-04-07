$ErrorActionPreference = "Stop"

function Get-ListeningPidOnPort {
  param(
    [Parameter(Mandatory = $true)][int]$Port
  )

  # Use netstat (no admin required) to find a LISTENING PID for the port.
  # Ensure we always iterate lines (not characters) when there's only one match.
  $lines = @(cmd /c "netstat -ano | findstr :$Port" 2>$null)
  foreach ($line in $lines) {
    if ($line -match "LISTENING\s+(\d+)\s*$") {
      return [int]$Matches[1]
    }
  }
  return $null
}

function Try-StopExistingBackend {
  param(
    [Parameter(Mandatory = $true)][int]$Port
  )

  $listenPid = Get-ListeningPidOnPort -Port $Port
  if (-not $listenPid) { return }

  $cmdLine = $null
  try {
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$listenPid"
    $cmdLine = $proc.CommandLine
  } catch {
    # If CIM is unavailable, fall back to a conservative behavior.
    $cmdLine = $null
  }

  $looksLikeOurBackend = $false
  if ($cmdLine) {
    if ($cmdLine -match "apps\.api\.main" -or $cmdLine -match "uvicorn") {
      $looksLikeOurBackend = $true
    }
  } else {
    # Command line introspection can be blocked on Windows. If it's python.exe
    # listening on the backend port, it's overwhelmingly likely to be our dev API.
    try {
      $p = Get-Process -Id $listenPid -ErrorAction Stop
      if ($p.ProcessName -eq "python" -or $p.ProcessName -eq "python3") {
        $looksLikeOurBackend = $true
      }
    } catch {
      $looksLikeOurBackend = $false
    }
  }

  if (-not $looksLikeOurBackend) {
    Write-Host "Port $Port is already in use by PID $listenPid."
    if ($cmdLine) { Write-Host "Command line: $cmdLine" }
    throw "Please stop the process using port $Port and re-run 'npm run backend:dev'."
  }

  Write-Host "Stopping existing backend on port $Port (PID $listenPid)..."
  Stop-Process -Id $listenPid -Force -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 300
}

function Test-VenvGreenletOk {
  param(
    [Parameter(Mandatory = $true)][string]$PythonExe
  )

  if (-not (Test-Path $PythonExe)) { return $false }

  # Silent import test to avoid noisy stack traces on known-bad setups.
  $oldEap = $ErrorActionPreference
  $ErrorActionPreference = "SilentlyContinue"
  try {
    & $PythonExe -c "import greenlet" *> $null
  } finally {
    $ErrorActionPreference = $oldEap
  }
  return ($LASTEXITCODE -eq 0)
}

$port = 8000
if ($env:APP_PORT) {
  try { $port = [int]$env:APP_PORT } catch { $port = 8000 }
}

# Work around a common Windows/dev misconfiguration: proxy env vars pointing to 127.0.0.1:9.
# That breaks Snowflake auth and connector networking. We only disable when it clearly looks broken.
function Disable-BrokenLocalProxy {
  $proxyVars = @("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy")
  $values = @{}
  foreach ($name in $proxyVars) {
    $v = $null
    try {
      $v = (Get-Item -Path ("Env:{0}" -f $name) -ErrorAction Stop).Value
    } catch {
      $v = $null
    }
    if ($v) { $values[$name] = $v }
  }

  if ($values.Count -eq 0) { return }

  $looksBroken = $false
  foreach ($v in $values.Values) {
    if ($v -match "127\\.0\\.0\\.1:9\\b" -or $v -match "localhost:9\\b") {
      $looksBroken = $true
    }
  }

  if (-not $looksBroken) { return }

  Write-Host "Detected broken proxy env (127.0.0.1:9). Disabling proxy variables for this backend process..."
  foreach ($name in $proxyVars) {
    Remove-Item -Path ("Env:{0}" -f $name) -ErrorAction SilentlyContinue
  }

  # Ensure Snowflake domains bypass any remaining OS-level proxy configuration.
  $noProxy = $env:NO_PROXY
  if (-not $noProxy) { $noProxy = "" }
  if ($noProxy -notmatch "snowflakecomputing\\.com") {
    $env:NO_PROXY = ($noProxy.Trim(",") + ",.snowflakecomputing.com").Trim(",")
  }
}

Disable-BrokenLocalProxy

Try-StopExistingBackend -Port $port

$venvPy = Join-Path $PSScriptRoot "..\.venv\Scripts\python.exe"
$resolvedVenvPy = $null
try {
  $resolvedVenvPy = (Resolve-Path $venvPy -ErrorAction Stop).Path
} catch {
  $resolvedVenvPy = $null
}
$venvPy = $resolvedVenvPy

if ($venvPy -and (Test-VenvGreenletOk -PythonExe $venvPy)) {
  Write-Host "Starting backend using venv Python: $venvPy"
  & $venvPy -m apps.api.main
  exit $LASTEXITCODE
}

if (Get-Command py -ErrorAction SilentlyContinue) {
  Write-Host "Starting backend using system Python: py -3.12"
  py -3.12 -m apps.api.main
  exit $LASTEXITCODE
}

Write-Host "Starting backend using 'python' on PATH"
python -m apps.api.main
exit $LASTEXITCODE
