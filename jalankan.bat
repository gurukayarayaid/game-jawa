@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

set "PORT=8080"
set "URL=http://localhost:%PORT%/index.html"

powershell -NoProfile -Command "$c=New-Object Net.Sockets.TcpClient;try{$c.Connect('127.0.0.1',%PORT%);$c.Close();exit 0}catch{exit 1}" >nul 2>&1
if %ERRORLEVEL%==0 goto :open

set "PY="
python --version >nul 2>&1 && set "PY=python"
if defined PY goto :havepy
py -3 --version >nul 2>&1 && set "PY=py -3"
if defined PY goto :havepy
goto :nopy

:havepy
echo.
echo   Menjalankan server lokal: %URL%
echo   Biarkan jendela server tetap terbuka selama bermain.
echo.
start "Gesture Battle - server" /min cmd /c "%PY% -m http.server %PORT% --bind 127.0.0.1"

set /a N=0
:wait
timeout /t 1 /nobreak >nul
powershell -NoProfile -Command "$c=New-Object Net.Sockets.TcpClient;try{$c.Connect('127.0.0.1',%PORT%);$c.Close();exit 0}catch{exit 1}" >nul 2>&1
if %ERRORLEVEL%==0 goto :open
set /a N+=1
if %N% LSS 10 goto :wait
echo   Server gagal dijalankan. Coba buka %URL% secara manual.
pause
exit /b 1

:open
start "" "%URL%"
exit /b 0

:nopy
echo.
echo   Python tidak ditemukan.
echo   Install Python 3 dari https://www.python.org/downloads/ lalu jalankan ulang file ini.
echo.
pause
exit /b 1
