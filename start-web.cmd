@echo off
set PATH=C:\Program Files\nodejs;%PATH%
cd /d "%~dp0app"
call npx expo start --web
