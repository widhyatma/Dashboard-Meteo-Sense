@echo off
title Rebuild ^& Start MeteoSense Dashboard (Port 3000)
cd /d "%~dp0"
call "%~dp0start-meteosense-local.bat" --rebuild
