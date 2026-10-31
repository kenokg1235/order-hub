@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "PATH=C:\Program Files\nodejs;%PATH%"
title Order Hub - Dich vu khoa the (KHONG DONG cua so nay)

REM Bam dup de chay (khong can quyen Admin). Dong cua so = the khoa lai tren moi may.
node keyserver.mjs

echo.
echo Dich vu khoa da dung.
pause
