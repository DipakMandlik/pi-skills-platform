$ErrorActionPreference = "Stop"

function Get-ListeningPidOnPort {
  param(
    [Parameter(Mandatory = $true)][int]$Port
  )

  # Ensure we always iterate lines (not characters) when there's only one match.
  $lines = @(cmd /c "netstat -ano | findstr :$Port" 2>$null)
  foreach ($line in $lines) {
    if ($line -match "LISTENING\s+(\d+)\s*$") {
      return [int]$Matches[1]
    }
  }
  return $null
}

function Try-StopExistingMcp {
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
    $cmdLine = $null
  }

  $looksLikeOurMcp = $false
  if ($cmdLine) {
    if ($cmdLine -match "apps\.mcp\.main" -or $cmdLine -match "uvicorn") {
      $looksLikeOurMcp = $true
    }
  }

  if (-not $looksLikeOurMcp) {
    # Command line introspection can be blocked or incomplete on Windows. If it's python.exe
    # listening on the MCP dev port, it's overwhelmingly likely to be our MCP server.
    try {
      $p = Get-Process -Id $listenPid -ErrorAction Stop
      if ($p.ProcessName -eq "python" -or $p.ProcessName -eq "python3") {
        $looksLikeOurMcp = $true
      }
    } catch {
      $looksLikeOurMcp = $false
    }
  }

  if (-not $looksLikeOurMcp) {
    Write-Host "Port $Port is already in use by PID $listenPid."
    if ($cmdLine) { Write-Host "Command line: $cmdLine" }
    throw "Please stop the process using port $Port and re-run 'npm run mcp:dev'."
  }

  Write-Host "Stopping existing MCP on port $Port (PID $listenPid)..."
  Stop-Process -Id $listenPid -Force -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 300
}

function Test-VenvGreenletOk {
  param(
    [Parameter(Mandatory = $true)][string]$PythonExe
  )

  if (-not (Test-Path $PythonExe)) { return $false }

  $oldEap = $ErrorActionPreference
  $ErrorActionPreference = "SilentlyContinue"
  try {
    & $PythonExe -c "import greenlet" *> $null
  } finally {
    $ErrorActionPreference = $oldEap
  }
  return ($LASTEXITCODE -eq 0)
}

$port = 5000
if ($env:MCP_PORT) {
  try { $port = [int]$env:MCP_PORT } catch { $port = 5000 }
}

Try-StopExistingMcp -Port $port

$venvPy = Join-Path $PSScriptRoot "..\.venv\Scripts\python.exe"
$resolvedVenvPy = $null
try {
  $resolvedVenvPy = (Resolve-Path $venvPy -ErrorAction Stop).Path
} catch {
  $resolvedVenvPy = $null
}
$venvPy = $resolvedVenvPy

if ($venvPy -and (Test-VenvGreenletOk -PythonExe $venvPy)) {
  Write-Host "Starting MCP using venv Python: $venvPy"
  & $venvPy -m apps.mcp.main
  exit $LASTEXITCODE
}

if (Get-Command py -ErrorAction SilentlyContinue) {
  Write-Host "Starting MCP using system Python: py -3.12"
  py -3.12 -m apps.mcp.main
  exit $LASTEXITCODE
}

Write-Host "Starting MCP using 'python' on PATH"
python -m apps.mcp.main
exit $LASTEXITCODE
