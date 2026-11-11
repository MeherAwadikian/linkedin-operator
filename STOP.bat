@echo off
title LinkedIn Operator - Stop
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup\stop.ps1"
pause
