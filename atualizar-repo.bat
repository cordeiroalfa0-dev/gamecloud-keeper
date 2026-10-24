@echo off
setlocal
cd /d "%~dp0"
title Atualizar repositorio

set "URL=https://github.com/cordeiroalfa0-dev/gamecloud-keeper.git"

where git >nul 2>nul
if errorlevel 1 (
  echo Git nao encontrado. Instale em https://git-scm.com/download/win
  pause
  exit /b 1
)

if exist ".git" goto TEM_GIT

echo Ligando esta pasta ao repositorio...
git init -q
git remote add origin "%URL%"
git fetch origin
if errorlevel 1 (
  echo Nao consegui acessar o repositorio. Confira o login e a permissao.
  rmdir /s /q .git
  pause
  exit /b 1
)
git remote set-head origin -a >nul 2>nul
set "BR="
for /f "delims=" %%b in ('git symbolic-ref --short refs/remotes/origin/HEAD 2^>nul') do set "BR=%%b"
if "%BR%"=="" set "BR=origin/main"
set "BR=%BR:origin/=%"
git symbolic-ref HEAD refs/heads/%BR%
git reset -q origin/%BR%

:TEM_GIT
git add -A
git reset -q -- package-lock.json >nul 2>nul

git diff --cached --quiet
if not errorlevel 1 (
  echo Nada para enviar. Nenhuma alteracao.
  pause
  exit /b 0
)

echo Arquivos que serao enviados:
git diff --cached --name-status
echo.

git commit -q -m "Atualizacao %date% %time:~0,5%"
if errorlevel 1 (
  echo Falha no commit. Rode uma vez no terminal:
  echo   git config --global user.name "Seu Nome"
  echo   git config --global user.email "seu@email.com"
  pause
  exit /b 1
)

for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD') do set "BRANCH=%%b"

echo Enviando para origin/%BRANCH% ...
git push -u origin %BRANCH%
if errorlevel 1 (
  echo.
  echo Falha no envio. Se o erro disser "rejected", o GitHub tem alteracoes
  echo que voce nao tem aqui: me mande a mensagem de erro.
  pause
  exit /b 1
)

echo.
echo Pronto! Repositorio atualizado.
pause
endlocal
