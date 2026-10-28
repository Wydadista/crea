@echo off
setlocal EnableExtensions
echo Preparazione e installazione di AK Player...
call "%~dp0CREA_EXE.cmd"
if errorlevel 1 goto failed
start "" /wait "%~dp0dist\AKPlayer.exe" --install
if errorlevel 1 goto failed
echo.
echo Operazione terminata. Se hai confermato, AK Player e nel desktop e nel menu Start.
exit /b 0
:failed
echo.
echo Installazione non completata. Leggi l'errore sopra.
pause
exit /b 1
