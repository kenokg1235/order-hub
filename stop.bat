@echo off
chcp 65001 >nul
title Order Hub - Stop
echo Dang tat Order Hub...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":4000" ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5173" ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
echo Da tat. (Cong 4000 + 5173 da dong)
timeout /t 2 >nul
