@echo off
setlocal
cd /d "%~dp0"
title Enviar alteracoes para o Git

where git >nul 2>nul
if errorlevel 1 (
  echo Git nao encontrado. Instale em https://git-scm.com/download/win
  pause
  exit /b 1
)

rem ---------- Pasta sem .git (extraida de zip): liga ao repositorio ----------
if exist ".git" goto TEM_GIT

echo Esta pasta ainda nao esta ligada a um repositorio Git.
echo.
set "URL="
set /p URL=Cole a URL do repositorio no GitHub, ex: https://github.com/usuario/gamecloud-keeper.git : 
if "%URL%"=="" goto SEM_URL

git init -q
git remote add origin "%URL%"
echo Baixando o historico do repositorio...
git fetch origin
if errorlevel 1 goto FALHA_FETCH

git remote set-head origin -a >nul 2>nul
set "BR="
for /f "delims=" %%b in ('git symbolic-ref --short refs/remotes/origin/HEAD 2^>nul') do set "BR=%%b"
if "%BR%"=="" goto SEM_BRANCH
set "BR=%BR:origin/=%"
git symbolic-ref HEAD refs/heads/%BR%
rem Alinha ao historico remoto sem mexer nos seus arquivos.
git reset -q origin/%BR%
echo Pasta ligada ao repositorio, branch %BR%.
echo.
goto TEM_GIT

:SEM_URL
echo Nenhuma URL informada.
pause
exit /b 1

:FALHA_FETCH
echo.
echo Nao consegui acessar o repositorio. Confira a URL, o login e a permissao.
rmdir /s /q .git
pause
exit /b 1

:SEM_BRANCH
echo Nao consegui descobrir a branch principal do repositorio.
rmdir /s /q .git
pause
exit /b 1

:TEM_GIT

echo === Alteracoes encontradas ===
git status --short
echo.

rem .env, node_modules, .output e .wrangler ja estao no .gitignore.
git add -A

rem O projeto usa bun.lock; nao envia o package-lock.json criado pelo npm.
git reset -q -- package-lock.json >nul 2>nul

git diff --cached --quiet
if not errorlevel 1 (
  echo Nada para enviar. Nenhuma alteracao pendente.
  pause
  exit /b 0
)

echo === Arquivos que serao enviados ===
git diff --cached --name-status
echo.

set "MSG="
set /p MSG=Mensagem do commit (Enter para usar a padrao): 
if "%MSG%"=="" set "MSG=Ajustes: protecao SSR no RemoteController e JWT_SECRET no .env.example"

git commit -m "%MSG%"
if errorlevel 1 (
  echo.
  echo Falha ao criar o commit. Se pediu nome e e-mail, rode antes:
  echo   git config --global user.name "Seu Nome"
  echo   git config --global user.email "seu@email.com"
  pause
  exit /b 1
)

for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD') do set "BRANCH=%%b"

echo.
echo Enviando para origin/%BRANCH% ...
git push -u origin %BRANCH%
if errorlevel 1 (
  echo.
  echo Falha no push. Verifique login, permissao ou conexao e tente de novo.
  pause
  exit /b 1
)

echo.
echo Pronto! Alteracoes enviadas para origin/%BRANCH%.
pause
endlocal
