@echo off
setlocal
pushd "%~dp0" || exit /b 1
set "PLAYER_FRAMEWORK=%SystemRoot%\Microsoft.NET\Framework64\v4.0.30319"
if not exist "%PLAYER_FRAMEWORK%\csc.exe" set "PLAYER_FRAMEWORK=%SystemRoot%\Microsoft.NET\Framework\v4.0.30319"
if not exist "%PLAYER_FRAMEWORK%\csc.exe" goto missing
for %%A in (WindowsBase PresentationCore PresentationFramework) do (
  if not exist "%PLAYER_FRAMEWORK%\WPF\%%A.dll" goto missing
)
if not exist dist mkdir dist
if not exist dist goto failed
"%PLAYER_FRAMEWORK%\csc.exe" /nologo /target:winexe /optimize+ /platform:anycpu /codepage:65001 /out:"dist\MP4Leggero.exe" /reference:System.dll /reference:System.Core.dll /reference:"%PLAYER_FRAMEWORK%\WPF\WindowsBase.dll" /reference:"%PLAYER_FRAMEWORK%\WPF\PresentationCore.dll" /reference:"%PLAYER_FRAMEWORK%\WPF\PresentationFramework.dll" Player.cs
if errorlevel 1 goto failed
copy /y MP4Leggero.exe.config dist\MP4Leggero.exe.config >nul
if errorlevel 1 goto failed
echo.
echo Creato: "%CD%\dist\MP4Leggero.exe"
echo Copia insieme EXE e file .config se li sposti in un'altra cartella.
popd
exit /b 0
:missing
echo Serve Microsoft .NET Framework 4.8 con WPF, normalmente incluso in Windows 10/11.
echo Se usi Windows N, serve anche il Media Feature Pack per riprodurre i video.
popd
exit /b 1
:failed
echo.
echo Creazione non riuscita. Leggi l'errore sopra.
echo Se il lettore e' aperto, chiudilo prima di ricreare l'EXE.
popd
exit /b 1
