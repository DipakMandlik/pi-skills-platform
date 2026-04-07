param(
    [switch]$CleanOnly,
    [switch]$SkipUiRbac,
    [switch]$SkipApiSecurity
)

$ErrorActionPreference = 'Stop'

function Remove-IfExists {
    param([string]$PathToRemove)

    if (Test-Path -LiteralPath $PathToRemove) {
        Remove-Item -LiteralPath $PathToRemove -Recurse -Force -ErrorAction SilentlyContinue
    }
}

function Wait-ForHttp {
    param(
        [Parameter(Mandatory = $true)][string]$Url,
        [int]$TimeoutSeconds = 90,
        [int]$SleepSeconds = 2
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $response = Invoke-WebRequest -Uri $Url -Method GET -TimeoutSec 5 -UseBasicParsing
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
                return $true
            }
        }
        catch {
            Start-Sleep -Seconds $SleepSeconds
            continue
        }
    }

    throw "Timed out waiting for $Url"
}

function Invoke-CheckedCommand {
    param(
        [Parameter(Mandatory = $true)][string]$Command
    )

    Invoke-Expression $Command
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed with exit code ${LASTEXITCODE}: $Command"
    }
}

Write-Host '==> Cleaning artifacts' -ForegroundColor Cyan
$artifacts = @(
    'dist',
    'coverage',
    'coverage.xml',
    'htmlcov',
    'results',
    '.pytest_cache',
    '.coverage',
    '__pycache__',
    'apps\\api\\__pycache__',
    'apps\\mcp\\__pycache__',
    'backend\\__pycache__',
    'server\\__pycache__'
)

foreach ($item in $artifacts) {
    Remove-IfExists -PathToRemove $item
}

Get-ChildItem -Path . -Recurse -Directory -Filter '__pycache__' -ErrorAction SilentlyContinue | ForEach-Object {
    Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
}

if ($CleanOnly) {
    Write-Host '==> Clean complete (CleanOnly mode)' -ForegroundColor Green
    exit 0
}

Write-Host '==> Starting services' -ForegroundColor Cyan
$processes = @()

try {
    $processes += Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', 'npm run mcp:dev' -PassThru -WindowStyle Hidden
    $processes += Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', 'npm run backend:dev' -PassThru -WindowStyle Hidden
    $processes += Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', 'npm run dev' -PassThru -WindowStyle Hidden

    Write-Host '==> Waiting for service readiness' -ForegroundColor Cyan
    Wait-ForHttp -Url 'http://127.0.0.1:8000/health' -TimeoutSeconds 120
    Wait-ForHttp -Url 'http://127.0.0.1:5000/health' -TimeoutSeconds 120
    Wait-ForHttp -Url 'http://127.0.0.1:3000' -TimeoutSeconds 120

    Write-Host '==> Running Python + JS unit tests' -ForegroundColor Cyan
    Invoke-CheckedCommand 'npm run test:unit:py'
    Invoke-CheckedCommand 'npm run test:unit:js'

    if (-not $SkipApiSecurity) {
        Write-Host '==> Running API/security/log tests' -ForegroundColor Cyan
        Invoke-CheckedCommand 'npm run test:api'
        Invoke-CheckedCommand 'npm run test:security'
        Invoke-CheckedCommand 'npm run test:logs'
    }

    if (-not $SkipUiRbac) {
        Write-Host '==> Running frontend RBAC route guard tests' -ForegroundColor Cyan
        Invoke-CheckedCommand 'npm run test:ui:rbac'
    }

    Write-Host '==> All-in-one run completed successfully' -ForegroundColor Green
}
finally {
    Write-Host '==> Stopping spawned services' -ForegroundColor Yellow
    foreach ($proc in $processes) {
        if ($null -ne $proc -and -not $proc.HasExited) {
            Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
        }
    }
}
