@echo off
title SQM Qualidade - Aplicar Migração login_SDM
chcp 65001 > nul
echo ========================================================
echo   APLICAR TABELA login_SDM E GATILHOS NO MYSQL (quem)
echo ========================================================
echo.
echo Executando migração no banco 'quem'...

mysql -u root quem < "%~dp0\database\migracao_login_sdm.sql"

if %errorlevel% equ 0 (
  echo.
  echo ✅ Sucesso! Tabela login_SDM criada e gatilhos ativados.
) else (
  echo.
  echo ⚠️ Se o seu MySQL exigir senha, informe o comando manualmente:
  echo   mysql -u root -p quem ^< database\migracao_login_sdm.sql
)

echo.
pause
