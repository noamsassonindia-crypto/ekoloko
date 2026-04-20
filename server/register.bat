@echo off
REM First-time user: launch Flash Projector directly into character-creation
REM / registration mode. After completing registration, close any browser
REM window that pops up and re-run start.bat — the game will auto-login.

call "%~dp0start.bat" register
