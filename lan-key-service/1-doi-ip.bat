@echo off
chcp 65001 >nul
title Order Hub - Doi IP may khoa

REM Co dinh IP may khoa ve 192.168.100.44 (dung dia chi da luu trong Order Hub).
REM Bam chuot phai vao file nay, chon "Run as administrator".

net session >nul 2>&1
if errorlevel 1 (
  echo [!] Chua co quyen Admin.
  echo     Bam chuot phai vao file nay, chon "Run as administrator".
  pause
  exit /b 1
)

ping -n 2 -w 1000 192.168.100.44 | findstr /C:"TTL=" >nul
if not errorlevel 1 (
  ipconfig | findstr /C:"192.168.100.44" >nul
  if errorlevel 1 (
    echo [!] Co may khac dang dung 192.168.100.44. Chua doi gi ca.
    echo     Hay tat may do roi chay lai file nay.
    pause
    exit /b 1
  )
)

echo Dang doi IP cua card "Ethernet" sang 192.168.100.44 ...
netsh interface ipv4 set address name="Ethernet" static 192.168.100.44 255.255.255.0 192.168.100.1
if errorlevel 1 goto loi
netsh interface ipv4 set dnsservers name="Ethernet" static 192.168.100.1 primary validate=no
if errorlevel 1 goto loi

echo.
echo Xong. Thong tin hien tai:
ipconfig | findstr /C:"192.168.100."
echo.
pause
exit /b 0

:loi
echo.
echo [!] Khong doi duoc. Dang tra ve che do tu dong (DHCP)...
netsh interface ipv4 set address name="Ethernet" source=dhcp
netsh interface ipv4 set dnsservers name="Ethernet" source=dhcp
pause
exit /b 1
