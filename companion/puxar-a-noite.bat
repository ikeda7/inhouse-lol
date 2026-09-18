@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
title InHouse LoL - puxar a noite
cd /d "%~dp0"

rem Atalho de clique duplo: importa a noite inteira para o site, na ordem, e
rem abre a MD3 se ninguem abriu. Rodar de novo nao duplica nada.
rem A chave do grupo fica em chave.txt, so nesta maquina (ver .gitignore).

if not exist chave.txt (
  echo A chave do grupo ainda nao esta salva nesta maquina.
  echo Ela fica so aqui, no arquivo chave.txt, e nunca vai para o repositorio.
  echo.
  set /p NOVA=Cole a chave e aperte Enter:
  > chave.txt echo !NOVA!
  echo.
)
set /p INHOUSE_CHAVE=<chave.txt

node inhouse-companion.mjs --noite --api https://inhouse-lol.vercel.app/api
echo.
pause
