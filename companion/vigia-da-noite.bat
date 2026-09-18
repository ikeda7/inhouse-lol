@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
title InHouse LoL - vigia da noite
cd /d "%~dp0"

rem Deixe esta janela aberta durante a noite de jogos: ao fim de cada partida
rem ele puxa a noite sozinho (abre a MD3, importa na ordem, atualiza o que ja
rem entrou). Ctrl+C ou fechar a janela encerra.

if not exist chave.txt (
  echo A chave do grupo ainda nao esta salva nesta maquina.
  echo Ela fica so aqui, no arquivo chave.txt, e nunca vai para o repositorio.
  echo.
  set /p NOVA=Cole a chave e aperte Enter:
  > chave.txt echo !NOVA!
  echo.
)
set /p INHOUSE_CHAVE=<chave.txt

node inhouse-companion.mjs --watch --api https://inhouse-lol.vercel.app/api
echo.
pause
