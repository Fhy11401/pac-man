@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if not errorlevel 1 (
  node server.mjs
  pause
  exit /b
)
if exist "C:\Program Files\WindowsApps\OpenAI.CodexPrimaryRuntime.v26-1017-2736-0_26.1017.2736.0_x64__3k8sg7r9htsxt\dependencies\node\bin\node.exe" (
  "C:\Program Files\WindowsApps\OpenAI.CodexPrimaryRuntime.v26-1017-2736-0_26.1017.2736.0_x64__3k8sg7r9htsxt\dependencies\node\bin\node.exe" server.mjs
  pause
  exit /b
)
where py >nul 2>nul
if not errorlevel 1 (
  echo Open http://127.0.0.1:5180/ in your browser.
  py -3 -m http.server 5180 --bind 127.0.0.1
  pause
  exit /b
)
echo Node.js or Python 3 is required. See README.md for exact run steps.
pause
