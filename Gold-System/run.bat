@echo off
setlocal
cd /d "%~dp0"

where docker >nul 2>&1
if errorlevel 1 (
  set "PATH=%LOCALAPPDATA%\Programs\DockerDesktop\resources\bin;%PATH%"
)

echo Starting postgres...
docker compose up -d postgres
if errorlevel 1 (
  echo Docker failed. Start Docker Desktop and try again.
  pause
  exit /b 1
)

echo Building shared-types...
call pnpm --filter @gold/shared-types build
if errorlevel 1 (
  echo Build failed.
  pause
  exit /b 1
)

echo Starting API and web...
start "Gold API" cmd /k "cd /d "%~dp0" && pnpm dev:api"
start "Gold Web" cmd /k "cd /d "%~dp0" && pnpm dev:web"

echo.
echo Web: http://localhost:4000
echo API: http://localhost:4001/api/v1
echo.
echo Close the Gold API / Gold Web windows to stop the servers.
endlocal
