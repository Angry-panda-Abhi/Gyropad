@echo off
TITLE Gyropad Windows PC Companion Setup
echo ===============================================================
echo     GYROPAD WINDOWS PC COMPANION SETUP
echo     Connect Phone Steering Wheel to any PC Game
echo ===============================================================
echo.

python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python 3 is not found in your PATH.
    echo Please install Python 3 from https://www.python.org/
    pause
    exit /b 1
)

echo [1/2] Installing required Python drivers (websockets, vgamepad)...
pip install websockets vgamepad
if errorlevel 1 (
    echo [ERROR] Failed to install Python packages. Check your internet connection.
    pause
    exit /b 1
)

echo.
echo [2/2] Launching Gyropad Windows Controller Bridge...
echo Keep this window open while gaming!
python gyropad_windows.py

pause
