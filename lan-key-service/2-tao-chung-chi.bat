@echo off
chcp 65001 >nul
setlocal
title Order Hub - Tao chung chi may khoa
cd /d "%~dp0"

REM Tao chung chi HTTPS cho 192.168.100.44 tu rootCA cu (may nhan vien khong phai cai lai)
REM va mo cong 8443. Bam chuot phai vao file nay, chon "Run as administrator".

set "IP=192.168.100.44"
set "NGUON=C:\Users\binhk_2\Downloads\Telegram Desktop"
set "CAROOT=%LOCALAPPDATA%\mkcert"

net session >nul 2>&1
if errorlevel 1 (
  echo [!] Chua co quyen Admin.
  echo     Bam chuot phai vao file nay, chon "Run as administrator".
  goto loi
)

echo [1/4] Chep rootCA vao noi luu rieng...
if not exist "%CAROOT%\" mkdir "%CAROOT%"
if not exist "%CAROOT%\rootCA-key.pem" (
  copy /Y "%NGUON%\rootCA.pem" "%CAROOT%\" >nul || goto loi_ca
  copy /Y "%NGUON%\rootCA-key.pem" "%CAROOT%\" >nul || goto loi_ca
)

echo [2/4] Cai mkcert...
winget install --id FiloSottile.mkcert -e --accept-package-agreements --accept-source-agreements
set "MK="
if exist "%LOCALAPPDATA%\Microsoft\WinGet\Links\mkcert.exe" set "MK=%LOCALAPPDATA%\Microsoft\WinGet\Links\mkcert.exe"
if exist "%ProgramFiles%\WinGet\Links\mkcert.exe" set "MK=%ProgramFiles%\WinGet\Links\mkcert.exe"
if not defined MK for /f "delims=" %%f in ('dir /s /b "%LOCALAPPDATA%\Microsoft\WinGet\Packages\mkcert*.exe" 2^>nul') do set "MK=%%f"
if not defined MK for /f "delims=" %%f in ('dir /s /b "%ProgramFiles%\WinGet\Packages\mkcert*.exe" 2^>nul') do set "MK=%%f"
if not defined MK (
  echo [!] Khong tim thay mkcert sau khi cai.
  goto loi
)

echo [3/4] Tao chung chi cho %IP%...
"%MK%" -install || goto loi
if not exist cert mkdir cert
"%MK%" -cert-file cert\server.pem -key-file cert\server-key.pem %IP% || goto loi

echo [4/4] Mo cong 8443 cho mang Private...
netsh advfirewall firewall delete rule name="OrderHub KeyService" >nul 2>&1
netsh advfirewall firewall add rule name="OrderHub KeyService" dir=in action=allow protocol=TCP localport=8443 profile=private || goto loi

echo.
echo ============================================
echo    XONG. Tiep theo chay file 3-chay-khoa.bat
echo ============================================
pause
exit /b 0

:loi_ca
echo [!] Khong chep duoc rootCA tu: %NGUON%
:loi
echo.
echo CO LOI - hay chup man hinh nay gui lai.
pause
exit /b 1
