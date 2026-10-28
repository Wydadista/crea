@echo off
setlocal EnableExtensions
set "PLAYER_ROOT=%~dp0"
echo [1/4] Controllo dei file e di .NET Framework...
if not exist "%PLAYER_ROOT%Player.cs" goto source_missing
if not exist "%PLAYER_ROOT%MP4Leggero.exe.config" goto source_missing
set "PLAYER_FRAMEWORK=%SystemRoot%\Microsoft.NET\Framework64\v4.0.30319"
if not exist "%PLAYER_FRAMEWORK%\csc.exe" set "PLAYER_FRAMEWORK=%SystemRoot%\Microsoft.NET\Framework\v4.0.30319"
if not exist "%PLAYER_FRAMEWORK%\csc.exe" goto missing
for %%A in (WindowsBase PresentationCore PresentationFramework) do (
  if not exist "%PLAYER_FRAMEWORK%\WPF\%%A.dll" goto missing
)
set "PLAYER_XAML=%PLAYER_FRAMEWORK%\System.Xaml.dll"
if not exist "%PLAYER_XAML%" set "PLAYER_XAML=%PLAYER_FRAMEWORK%\WPF\System.Xaml.dll"
if not exist "%PLAYER_XAML%" goto missing
echo [2/4] Preparazione della cartella dist...
if not exist "%PLAYER_ROOT%dist\" mkdir "%PLAYER_ROOT%dist"
if not exist "%PLAYER_ROOT%dist\" goto folder_failed
echo [3/4] Compilazione del lettore...
"%PLAYER_FRAMEWORK%\csc.exe" /nologo /target:winexe /optimize+ /platform:anycpu /codepage:65001 /out:"%PLAYER_ROOT%dist\MP4Leggero.exe" /reference:System.dll /reference:System.Core.dll /reference:"%PLAYER_XAML%" /reference:"%PLAYER_FRAMEWORK%\WPF\WindowsBase.dll" /reference:"%PLAYER_FRAMEWORK%\WPF\PresentationCore.dll" /reference:"%PLAYER_FRAMEWORK%\WPF\PresentationFramework.dll" "%PLAYER_ROOT%Player.cs" > "%PLAYER_ROOT%compilazione.log" 2>&1
set "PLAYER_RESULT=%ERRORLEVEL%"
if exist "%PLAYER_ROOT%compilazione.log" type "%PLAYER_ROOT%compilazione.log"
if not "%PLAYER_RESULT%"=="0" goto failed
if not exist "%PLAYER_ROOT%dist\MP4Leggero.exe" goto failed
echo [4/4] Copia della configurazione...
copy /y "%PLAYER_ROOT%MP4Leggero.exe.config" "%PLAYER_ROOT%dist\MP4Leggero.exe.config" >nul
if errorlevel 1 goto failed
echo.
echo COMPLETATO: "%PLAYER_ROOT%dist\MP4Leggero.exe"
echo Per aprirlo: fai doppio clic su MP4Leggero.exe nella cartella dist.
echo Mantieni il file .config accanto all'EXE.
exit /b 0
:source_missing
echo ERRORE: estrai tutti i file dello ZIP prima di eseguire questo comando.
exit /b 1
:missing
echo ERRORE: non sono state trovate le librerie .NET Framework necessarie.
echo Compilatore cercato in: "%PLAYER_FRAMEWORK%"
echo Libreria System.Xaml cercata in: "%PLAYER_XAML%"
echo Serve .NET Framework 4.8 con WPF, normalmente incluso in Windows 10/11.
exit /b 1
:folder_failed
echo ERRORE: impossibile creare "%PLAYER_ROOT%dist".
echo Estrai lo ZIP in una cartella in cui puoi scrivere.
exit /b 1
:failed
echo.
echo ERRORE: creazione non riuscita.
echo Se il lettore e' aperto, chiudilo e riprova.
echo Invia il testo mostrato sopra o il file "%PLAYER_ROOT%compilazione.log".
exit /b 1
