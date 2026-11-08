@echo off
setlocal
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch-local.ps1" -Page game
set "LAUNCH_RESULT=%ERRORLEVEL%"
if not "%LAUNCH_RESULT%"=="0" (
  echo.
  echo The game could not be started. See the message above.
  pause
)
exit /b %LAUNCH_RESULT%
