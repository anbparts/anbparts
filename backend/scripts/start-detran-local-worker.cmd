@echo off
setlocal

set SCRIPT_DIR=%~dp0
pushd "%SCRIPT_DIR%\.."

if "%DETRAN_WORKER_ENABLED%"=="" set DETRAN_WORKER_ENABLED=true
if "%DETRAN_LOCAL_MODE%"=="" set DETRAN_LOCAL_MODE=true
if "%DETRAN_BROWSER_HEADLESS%"=="" set DETRAN_BROWSER_HEADLESS=false
if "%DETRAN_BROWSER_CHANNEL%"=="" set DETRAN_BROWSER_CHANNEL=msedge
if "%DETRAN_BROWSER_USER_DATA_DIR%"=="" set DETRAN_BROWSER_USER_DATA_DIR=%CD%\runtime\detran-local-profile

echo [Detran local] worker local sera iniciado com navegador real.
echo [Detran local] perfil persistente: %DETRAN_BROWSER_USER_DATA_DIR%
echo [Detran local] se o backend local nao tiver .env com DATABASE_URL valido, o worker nao vai conectar no banco.
echo.

npm run detran:worker:local

popd
