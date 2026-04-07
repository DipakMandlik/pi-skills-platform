param(
  [string]$ConfigPath = "docs/tester/auth-e2e.config.json",
  [switch]$RunFullSuite = $false
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Info([string]$Message) {
  Write-Host "[INFO] $Message"
}

function Write-Pass([string]$Message) {
  Write-Host "[PASS] $Message" -ForegroundColor Green
}

function Write-Fail([string]$Message) {
  Write-Host "[FAIL] $Message" -ForegroundColor Red
}

function Invoke-JsonRequest {
  param(
    [string]$Method,
    [string]$Url,
    [hashtable]$Body,
    [hashtable]$Headers
  )

  $requestHeaders = @{}
  if ($Headers) {
    foreach ($k in $Headers.Keys) {
      $requestHeaders[$k] = $Headers[$k]
    }
  }

  $payload = $null
  if ($Body) {
    $payload = $Body | ConvertTo-Json -Depth 10
  }

  try {
    $response = Invoke-WebRequest -Uri $Url -Method $Method -Headers $requestHeaders -Body $payload -ContentType "application/json" -TimeoutSec 20
    $parsed = $null
    if ($response.Content) {
      try { $parsed = $response.Content | ConvertFrom-Json -Depth 20 } catch { $parsed = $response.Content }
    }
    return [pscustomobject]@{
      status = [int]$response.StatusCode
      ok = $true
      data = $parsed
      raw = $response.Content
      error = $null
    }
  } catch {
    $status = 0
    $parsedErr = $null
    $rawErr = ""
    if ($_.Exception.Response) {
      try {
        $status = [int]$_.Exception.Response.StatusCode.value__
      } catch {
        $status = 0
      }
      try {
        $stream = $_.Exception.Response.GetResponseStream()
        if ($stream) {
          $reader = New-Object System.IO.StreamReader($stream)
          $rawErr = $reader.ReadToEnd()
          $reader.Dispose()
        }
      } catch {}
      if ($rawErr) {
        try { $parsedErr = $rawErr | ConvertFrom-Json -Depth 20 } catch { $parsedErr = $rawErr }
      }
    }

    return [pscustomobject]@{
      status = $status
      ok = $false
      data = $parsedErr
      raw = $rawErr
      error = $_.Exception.Message
    }
  }
}

function Add-Result {
  param(
    [System.Collections.Generic.List[object]]$Store,
    [string]$Id,
    [string]$Title,
    [string]$Status,
    [string]$Expected,
    [string]$Actual,
    [object]$Evidence
  )

  $Store.Add([pscustomobject]@{
    id = $Id
    title = $Title
    status = $Status
    expected = $Expected
    actual = $Actual
    evidence = $Evidence
    timestamp = (Get-Date).ToString("o")
  }) | Out-Null

  if ($Status -eq "PASS") {
    Write-Pass "$Id $Title"
  } else {
    Write-Fail "$Id $Title"
    Write-Host "       expected: $Expected"
    Write-Host "       actual  : $Actual"
  }
}

if (-not (Test-Path $ConfigPath)) {
  throw "Config file not found: $ConfigPath. Copy docs/tester/auth-e2e.config.sample.json to auth-e2e.config.json and fill values."
}

$config = Get-Content $ConfigPath -Raw | ConvertFrom-Json -Depth 30

$results = New-Object 'System.Collections.Generic.List[object]'
$runtime = [pscustomobject]@{
  startedAt = (Get-Date).ToString("o")
  configPath = $ConfigPath
  runFullSuite = [bool]$RunFullSuite
}

$backendBase = ($config.backend.baseUrl).TrimEnd('/')
$mcpBase = ($config.mcp.baseUrl).TrimEnd('/')

Write-Info "Backend: $backendBase"
Write-Info "MCP    : $mcpBase"

# 1) Health checks
$h1 = Invoke-JsonRequest -Method "GET" -Url "$backendBase/health" -Body $null -Headers @{}
Add-Result -Store $results -Id "AUTH-E2E-001" -Title "Backend health" -Status ($(if ($h1.status -eq 200) {"PASS"} else {"FAIL"})) -Expected "HTTP 200" -Actual "HTTP $($h1.status)" -Evidence $h1.data

$h2 = Invoke-JsonRequest -Method "GET" -Url "$mcpBase/health" -Body $null -Headers @{}
Add-Result -Store $results -Id "AUTH-E2E-002" -Title "MCP health" -Status ($(if ($h2.status -eq 200) {"PASS"} else {"FAIL"})) -Expected "HTTP 200" -Actual "HTTP $($h2.status)" -Evidence $h2.data

# 2) Backend auth path (email/password)
$beCred = @{
  email = $config.backend.adminEmail
  password = $config.backend.adminPassword
}
$beLogin = Invoke-JsonRequest -Method "POST" -Url "$backendBase/auth/login" -Body $beCred -Headers @{}
$beToken = $null
if ($beLogin.status -eq 200 -and $beLogin.data -and $beLogin.data.access_token) { $beToken = [string]$beLogin.data.access_token }
Add-Result -Store $results -Id "AUTH-E2E-003" -Title "Backend login with configured admin" -Status ($(if ($beToken) {"PASS"} else {"FAIL"})) -Expected "HTTP 200 with access_token" -Actual "HTTP $($beLogin.status)" -Evidence $beLogin.data

if ($beToken) {
  $beMe = Invoke-JsonRequest -Method "GET" -Url "$backendBase/auth/me" -Body $null -Headers @{ Authorization = "Bearer $beToken" }
  Add-Result -Store $results -Id "AUTH-E2E-004" -Title "Backend /auth/me with token" -Status ($(if ($beMe.status -eq 200) {"PASS"} else {"FAIL"})) -Expected "HTTP 200" -Actual "HTTP $($beMe.status)" -Evidence $beMe.data
}

$beBad = Invoke-JsonRequest -Method "POST" -Url "$backendBase/auth/login" -Body @{ email = $config.backend.adminEmail; password = "wrong-password-123" } -Headers @{}
Add-Result -Store $results -Id "AUTH-E2E-005" -Title "Backend rejects wrong password" -Status ($(if ($beBad.status -eq 401) {"PASS"} else {"FAIL"})) -Expected "HTTP 401" -Actual "HTTP $($beBad.status)" -Evidence $beBad.data

# 3) MCP Snowflake auth path (account/username/password/role)
$mcpCred = @{
  account = $config.mcp.account
  username = $config.mcp.username
  password = $config.mcp.password
  role = $config.mcp.role
}
$mcpLogin = Invoke-JsonRequest -Method "POST" -Url "$mcpBase/auth/login" -Body $mcpCred -Headers @{}
$mcpToken = $null
if ($mcpLogin.status -eq 200 -and $mcpLogin.data -and $mcpLogin.data.token) { $mcpToken = [string]$mcpLogin.data.token }
Add-Result -Store $results -Id "AUTH-E2E-006" -Title "MCP Snowflake login with configured account user role" -Status ($(if ($mcpToken) {"PASS"} else {"FAIL"})) -Expected "HTTP 200 with token" -Actual "HTTP $($mcpLogin.status)" -Evidence $mcpLogin.data

if ($mcpToken) {
  $mcpMe = Invoke-JsonRequest -Method "GET" -Url "$mcpBase/users/me" -Body $null -Headers @{ Authorization = "Bearer $mcpToken" }
  Add-Result -Store $results -Id "AUTH-E2E-007" -Title "MCP /users/me with token" -Status ($(if ($mcpMe.status -eq 200) {"PASS"} else {"FAIL"})) -Expected "HTTP 200" -Actual "HTTP $($mcpMe.status)" -Evidence $mcpMe.data
}

$mcpWrongRole = Invoke-JsonRequest -Method "POST" -Url "$mcpBase/auth/login" -Body @{ account = $config.mcp.account; username = $config.mcp.username; password = $config.mcp.password; role = "ACCOUNTADMIN" } -Headers @{}
Add-Result -Store $results -Id "AUTH-E2E-008" -Title "MCP detects role mismatch (expected fail unless granted)" -Status ($(if ($mcpWrongRole.status -eq 401 -or $mcpWrongRole.status -eq 403) {"PASS"} else {"FAIL"})) -Expected "HTTP 401 or 403" -Actual "HTTP $($mcpWrongRole.status)" -Evidence $mcpWrongRole.data

$mcpWrongAccount = Invoke-JsonRequest -Method "POST" -Url "$mcpBase/auth/login" -Body @{ account = "invalid-account-xyz"; username = $config.mcp.username; password = $config.mcp.password; role = $config.mcp.role } -Headers @{}
Add-Result -Store $results -Id "AUTH-E2E-009" -Title "MCP rejects invalid account" -Status ($(if ($mcpWrongAccount.status -eq 401) {"PASS"} else {"FAIL"})) -Expected "HTTP 401" -Actual "HTTP $($mcpWrongAccount.status)" -Evidence $mcpWrongAccount.data

# 4) Optional full suite trigger
$fullSuiteSummary = @()
if ($RunFullSuite) {
  Write-Info "Running full API and UI auth-adjacent suites..."
  $commands = @(
    "npm run test:api:auth",
    "npm run test:api:governance",
    "npm run test:ui:e2e"
  )

  foreach ($cmd in $commands) {
    Write-Info "Executing: $cmd"
    $output = cmd /c $cmd 2>&1
    $exitCode = $LASTEXITCODE
    $fullSuiteSummary += [pscustomobject]@{
      command = $cmd
      exitCode = $exitCode
      outputTail = ($output | Select-Object -Last 40)
    }
  }
}

$passCount = ($results | Where-Object { $_.status -eq "PASS" }).Count
$failCount = ($results | Where-Object { $_.status -eq "FAIL" }).Count

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$resultsDir = "results"
if (-not (Test-Path $resultsDir)) {
  New-Item -ItemType Directory -Path $resultsDir | Out-Null
}

$jsonPath = Join-Path $resultsDir "auth_e2e_results_$timestamp.json"
$mdPath = Join-Path $resultsDir "auth_e2e_report_$timestamp.md"

$payload = [pscustomobject]@{
  runtime = $runtime
  summary = [pscustomobject]@{
    total = $results.Count
    passed = $passCount
    failed = $failCount
    status = if ($failCount -eq 0) { "PASS" } else { "FAIL" }
  }
  tests = $results
  fullSuite = $fullSuiteSummary
}

$payload | ConvertTo-Json -Depth 20 | Set-Content -Path $jsonPath -Encoding ascii

$md = @()
$md += "# Auth E2E Report"
$md += ""
$md += "- Started: $($runtime.startedAt)"
$md += "- Config: $ConfigPath"
$md += "- Total: $($results.Count)"
$md += "- Passed: $passCount"
$md += "- Failed: $failCount"
$md += ""
$md += "## Results"
$md += ""
$md += "| ID | Title | Status | Expected | Actual |"
$md += "|---|---|---|---|---|"
foreach ($r in $results) {
  $md += "| $($r.id) | $($r.title) | $($r.status) | $($r.expected) | $($r.actual) |"
}

if ($RunFullSuite) {
  $md += ""
  $md += "## Full Suite Commands"
  $md += ""
  foreach ($item in $fullSuiteSummary) {
    $md += "- $($item.command) => exitCode=$($item.exitCode)"
  }
}

$md | Set-Content -Path $mdPath -Encoding ascii

Write-Info "Saved JSON: $jsonPath"
Write-Info "Saved MD  : $mdPath"

if ($failCount -gt 0) {
  exit 1
}
exit 0
