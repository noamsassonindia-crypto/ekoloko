@echo off
REM Ekoloko Revived — one-click launcher.
REM Starts the Node.js server in a new window, waits for it to come up,
REM then opens Flash Projector on http://localhost:8766/shell.swf.

setlocal
cd /d "%~dp0"

set GAME_PATH=C:\Users\sasso\Downloads\עבודות\ekoloko-real\ekoloko-both\ekoloko
set GAME_PATH_FALLBACK=C:\Users\sasso\Downloads\ekoloko_all_files\ekoloko_all_files\play.ekoloko.com\ekoloko
set HTTP_PORT=8766
set SOCKET_PORT=9339

REM Locate Flash Projector — prefer local .exe, fall back to the debug build
REM shipped with ekoloko-authentic.
set PROJECTOR=%~dp0flashplayer_32_sa.exe
if not exist "%PROJECTOR%" set PROJECTOR=%~dp0..\עבודות\ekoloko-authentic\bin\flashplayer_debug.exe
if not exist "%PROJECTOR%" (
  echo.
  echo [X] Flash Projector not found. Download flashplayer_32_sa.exe from
  echo       https://archive.org/details/flashplayer_32_sa
  echo     and save it next to this file.
  echo.
  pause
  exit /b 1
)

REM If the server is already listening, skip starting a new instance.
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 http://localhost:%HTTP_PORT%/shell.swf; exit [int]($r.StatusCode -ne 200) } catch { exit 1 }" >nul 2>&1
if errorlevel 1 (
  echo Starting server on port %HTTP_PORT%...
  start "Ekoloko Server" cmd /k "cd /d %~dp0 && set GAME_PATH=%GAME_PATH%&& set GAME_PATH_FALLBACK=%GAME_PATH_FALLBACK%&& set HTTP_PORT=%HTTP_PORT%&& set SOCKET_PORT=%SOCKET_PORT%&& node s.js"

  echo Waiting for server to come up...
  for /l %%i in (1,1,20) do (
    powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 http://localhost:%HTTP_PORT%/shell.swf; exit [int]($r.StatusCode -ne 200) } catch { exit 1 }" >nul 2>&1
    if not errorlevel 1 goto :server_ready
    timeout /t 1 /nobreak >nul
  )
  echo [X] Server did not come up after 20s. Check the server window for errors.
  pause
  exit /b 1
)

:server_ready
REM If the user passed "register" as the first argument, or if a
REM first-run marker doesn't exist yet, launch registration mode.
REM Otherwise do a normal launch (auto-login via SharedObject).
set URL=http://localhost:%HTTP_PORT%/shell.swf?language=iw
if /I "%~1"=="register" set URL=http://localhost:%HTTP_PORT%/shell.swf?language=iw^&register=1
if /I "%~1"=="reg"      set URL=http://localhost:%HTTP_PORT%/shell.swf?language=iw^&register=1

echo Launching Flash Projector: %URL%
start "" "%PROJECTOR%" "%URL%"
exit /b 0
