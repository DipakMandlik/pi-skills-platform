@echo off
setlocal

set "EXIT_CODE=9009"
set "PYTEST_ROOT=%CD%\results\pytest-root"

if not exist "%CD%\results" mkdir "%CD%\results" >nul 2>&1
if not exist "%PYTEST_ROOT%" mkdir "%PYTEST_ROOT%" >nul 2>&1
set "PYTEST_DEBUG_TEMPROOT=%PYTEST_ROOT%"

if exist ".\.venv\Scripts\python.exe" (
  .\.venv\Scripts\python.exe -c "import pytest" >nul 2>&1
  if not errorlevel 1 (
    .\.venv\Scripts\python.exe -m pytest %*
    set "EXIT_CODE=%ERRORLEVEL%"
    goto cleanup
  )
)

py -3.12 -c "import pytest" >nul 2>&1
if not errorlevel 1 (
  py -3.12 -m pytest %*
  set "EXIT_CODE=%ERRORLEVEL%"
  goto cleanup
)

python -c "import pytest" >nul 2>&1
if not errorlevel 1 (
  python -m pytest %*
  set "EXIT_CODE=%ERRORLEVEL%"
  goto cleanup
)

echo No Python interpreter with pytest available. 1>&2

:cleanup
if exist "%PYTEST_ROOT%" rmdir /s /q "%PYTEST_ROOT%" >nul 2>&1
exit /b %EXIT_CODE%
