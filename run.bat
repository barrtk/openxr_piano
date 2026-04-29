@echo off
title Piano Viewer Local
echo -----------------------------------------

python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [BLAD] Brak zainstalowanego srodowiska Python!
    echo.
    echo Aby uruchomic ten program, pobierz i zainstaluj Pythona ze strony:
    echo https://www.python.org/downloads/
    echo.
    echo PAMIETAJ: Podczas instalacji koniecznie zaznacz opcje "Add Python to PATH"!
    echo -----------------------------------------
    pause
    exit /b
)

echo Uruchamianie serwera na http://127.0.0.1:8000...
start "Server" cmd /k "python mini-bridge.py"

timeout /t 2 >nul
start http://127.0.0.1:8000
