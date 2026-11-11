@echo off
title LinkedIn Operator - Verify
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup\verify.ps1"
pause
