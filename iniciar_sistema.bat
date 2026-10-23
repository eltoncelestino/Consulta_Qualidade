@echo off
title SQM Qualidade - Servidor
chcp 65001 > nul
echo ========================================================
echo   SQM QUALIDADE - HISTÓRICO DE MONITORIAS (6 MESES)
echo ========================================================
echo Conectando ao MySQL localhost (user: root, sem senha)...
echo.
cd /d "%~dp0\backend"

:: Abre o navegador automaticamente apos 2 segundos em segundo plano
start "" /b cmd /c "timeout /t 2 /nobreak > nul && start http://localhost:3002"

echo Iniciando o servidor na porta 3002...
echo Pressione CTRL+C para encerrar o servidor.
echo.
node src/server.js
pause
