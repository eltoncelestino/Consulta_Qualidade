@echo off
title SQD - Robô de Sincronização
chcp 65001 > nul
echo ========================================================
echo   ROBÔ DE SINCRONIZAÇÃO DE ANALISTAS ATIVOS (RF05)
echo ========================================================
echo.
cd /d "%~dp0\backend"
node src/scripts/sync.js
echo.
echo ========================================================
echo Processamento concluído.
pause
