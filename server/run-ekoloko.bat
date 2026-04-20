@echo off
REM Ekoloko Revived — launcher for Adobe Flash Projector (native Flash Player).
REM Assumes the server is already running on localhost:8766.

setlocal

REM Prefer a local copy next to this file; otherwise use the existing
REM flashplayer_debug.exe from the sibling ekoloko-authentic project.
set PROJECTOR=%~dp0flashplayer_32_sa.exe
if not exist "%PROJECTOR%" set PROJECTOR=%~dp0..\עבודות\ekoloko-authentic\bin\flashplayer_debug.exe
set URL=http://localhost:8766/shell.swf?language=iw

if not exist "%PROJECTOR%" (
  echo.
  echo [X] Flash Projector not found.
  echo     Looked at:
  echo       %~dp0flashplayer_32_sa.exe
  echo       %~dp0..\עבודות\ekoloko-authentic\bin\flashplayer_debug.exe
  echo.
  echo     Download flashplayer_32_sa.exe from:
  echo       https://archive.org/details/flashplayer_32_sa
  echo     Save next to this .bat and re-run.
  echo.
  pause
  exit /b 1
)

echo Checking server on localhost:8766...
powershell -NoProfile -Command "try { (Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://localhost:8766/shell.swf).StatusCode } catch { 0 }" > "%TEMP%\_ekoloko_probe.txt"
set /p HTTPSTATUS=<"%TEMP%\_ekoloko_probe.txt"
del "%TEMP%\_ekoloko_probe.txt" 2>nul

if not "%HTTPSTATUS%"=="200" (
  echo.
  echo [!] Server is not responding on http://localhost:8766
  echo     Start it first:  cd ..\best ^&^& node s.js
  echo.
  pause
  exit /b 1
)

echo Launching Flash Projector ^> %URL%
start "" "%PROJECTOR%" "%URL%"
