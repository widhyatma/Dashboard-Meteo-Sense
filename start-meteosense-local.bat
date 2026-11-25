@echo off
title MeteoSense Dashboard - Production Server (Port 3000)
cd /d "%~dp0"

if not exist "node_modules" (
    echo [INFO] Folder node_modules belum ditemukan. Menjalankan npm install...
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install gagal!
        pause
        exit /b 1
    )
)

if /i "%~1"=="--rebuild" goto do_build
if not exist ".next\BUILD_ID" goto do_build
goto start_server

:do_build
echo [INFO] Menjalankan production build ^(npm run build^)...
call npm run build
if errorlevel 1 (
    echo [ERROR] Build produksi gagal!
    pause
    exit /b 1
)

:start_server
echo ============================================================================
echo   Dashboard MeteoSense - Local Production Server
echo   URL : http://localhost:3000
echo   Mode: next start ^(Tanpa Dev Mode^)
echo ============================================================================
echo.

if not "%NO_BROWSER%"=="1" start "" cmd /c "ping -n 3 127.0.0.1 >nul && start http://localhost:3000"
call npm run start
pause
