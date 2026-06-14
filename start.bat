@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "PATH=C:\Program Files\nodejs;%PATH%"
title Order Hub Launcher

echo ============================================
echo    ORDER HUB - dang khoi dong...
echo ============================================
echo.

REM --- Tat phien cu (neu dang chay) de tranh trung cong ---
echo [1/3] Dong phien cu (neu co)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":4000" ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5173" ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
timeout /t 1 >nul

REM --- Kiem tra node_modules ---
if not exist "node_modules\" (
  echo [!] Chua cai thu vien - dang chay npm install lan dau...
  call npm install
)

echo [2/3] Khoi dong may chu API (cong 4000)...
start "Order Hub - API" cmd /k "set PORT=4000&& node server\server.js"
timeout /t 2 >nul

echo [3/3] Khoi dong giao dien Web (cong 5173)...
start "Order Hub - Web" cmd /k "npm run dev"
timeout /t 5 >nul

echo.
echo ============================================
echo    ORDER HUB da san sang!
echo    Mo trinh duyet: http://localhost:5173
echo    Dang nhap: admin@orderhub.local / admin123
echo ============================================
echo.
echo (Hai cua so den vua mo la 2 may chu - DUNG dong chung khi dang dung app)
echo (Muon tat app: chay stop.bat hoac dong 2 cua so do)
echo.

start "" "http://localhost:5173"
timeout /t 4 >nul
