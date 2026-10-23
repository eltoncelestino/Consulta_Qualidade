@echo off
setlocal
title SQM Qualidade - Acesso pela Intranet
chcp 65001 >nul

cd /d "%~dp0\backend"
if errorlevel 1 (
  echo ERRO: nao foi possivel localizar a pasta backend.
  pause
  exit /b 1
)

echo ========================================================
echo   SQM QUALIDADE - ACESSO PELA INTRANET
echo ========================================================
echo.
echo Nome da VM: %COMPUTERNAME%
echo Links para compartilhar com usuarios da rede:
echo   http://%COMPUTERNAME%:3002/SQD

powershell -NoProfile -Command "Get-NetIPConfiguration | Where-Object { $_.NetAdapter.Status -eq 'Up' -and $_.IPv4Address } | ForEach-Object { Write-Output ('  http://' + $_.IPv4Address.IPAddress + ':3002/SQD') }"

echo.
echo Se os usuarios nao conseguirem acessar, execute liberar_firewall.bat
echo como Administrador para liberar TCP 3002 somente na intranet.
echo Mantenha esta janela aberta enquanto o sistema estiver em uso.
echo Pressione CTRL+C para encerrar o servidor.
echo.

node src/server.js
if errorlevel 1 (
  echo.
  echo ERRO: o servidor nao iniciou. Verifique Node.js, MySQL e a porta TCP 3002.
  pause
  exit /b 1
)
