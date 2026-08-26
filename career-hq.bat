@echo off
cd /d "%~dp0"
set "PORT=8765"
for /f "usebackq delims=" %%P in (`python scripts\read_port.py 2^>nul`) do set "PORT=%%P"
powershell -NoProfile -Command "if (-not (Test-NetConnection 127.0.0.1 -Port %PORT% -InformationLevel Quiet -WarningAction SilentlyContinue)) { Start-Process -WindowStyle Minimized python -ArgumentList '-m','uvicorn','app.app:app','--host','127.0.0.1','--port','%PORT%' ; Start-Sleep 2 }"
start "" http://127.0.0.1:%PORT%
