@echo off
cd /d "%~dp0"
powershell -NoProfile -Command "if (-not (Test-NetConnection 127.0.0.1 -Port 8765 -InformationLevel Quiet -WarningAction SilentlyContinue)) { Start-Process -WindowStyle Minimized python -ArgumentList '-m','uvicorn','app.app:app','--host','127.0.0.1','--port','8765' ; Start-Sleep 2 }"
start "" http://127.0.0.1:8765
