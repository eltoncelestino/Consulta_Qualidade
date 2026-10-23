@echo off
setlocal
title SQM Qualidade - Firewall da Intranet (TCP 3002)

net session >nul 2>&1
if errorlevel 1 (
  echo ERRO: execute este arquivo como Administrador.
  echo Clique com o botao direito no arquivo e selecione "Executar como administrador".
  echo.
  pause
  exit /b 1
)

echo Configurando o Firewall do Windows para acesso a partir da sub-rede local...

rem Remove the previous unrestricted rule and any prior copy of this scoped rule.
netsh advfirewall firewall delete rule name="SQM Qualidade (Porta 3001)" >nul 2>&1
netsh advfirewall firewall delete rule name="SQM Qualidade - TCP 3001 (Intranet)" >nul 2>&1
netsh advfirewall firewall delete rule name="SQM Qualidade - TCP 3002 (Intranet)" >nul 2>&1

netsh advfirewall firewall add rule name="SQM Qualidade - TCP 3002 (Intranet)" dir=in action=allow protocol=TCP localport=3002 profile=domain,private remoteip=localsubnet
if errorlevel 1 (
  echo.
  echo ERRO: nao foi possivel criar a regra de firewall.
  echo Verifique se o Firewall do Windows esta habilitado e execute como Administrador.
  echo.
  pause
  exit /b 1
)

echo.
echo Regra criada. A porta TCP 3002 aceita conexoes somente da sub-rede local,
echo nos perfis de rede Domain e Private. Nenhuma regra para a porta 8080 foi criada.
echo.
pause
exit /b 0
