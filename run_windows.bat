@echo off
TITLE Gyropad Pro - Sim Companion & PC Game Controller
cd /d "%~dp0"

echo ==============================================================================
echo    🏎️  G Y R O P A D   P R O   -   W I N D O W S   C O M P A N I O N
echo ==============================================================================
echo.

:: 1. Verify Python Installation
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python 3 is not installed or not in your system PATH!
    echo.
    echo Please install Python 3 from: https://www.python.org/downloads/
    echo (IMPORTANT: Make sure to check the box "Add python.exe to PATH" during install)
    echo.
    pause
    exit /b 1
)

echo [1/3] Python environment verified.

:: 2. Check and Install Required Windows Drivers
echo [2/3] Checking driver dependencies (websockets, vgamepad for Xbox 360)...
python -m pip install websockets vgamepad >nul 2>&1

:: 3. Auto-open dashboard in browser after startup
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:8080/pc"

:: 4. Start Gyropad Companion & Xbox 360 Kernel Bridge
echo [3/3] Starting Gyropad PC Companion & Virtual Xbox 360 Controller...
echo.
echo ------------------------------------------------------------------------------
echo   Dashboard:  http://localhost:8080/pc
echo   Keep this window open while gaming!
echo ------------------------------------------------------------------------------
echo.
python server.py
pause
