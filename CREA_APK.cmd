@echo off
setlocal EnableExtensions
cd /d "%~dp0"
if not defined JAVA_HOME if exist "%ProgramFiles%\Android\Android Studio\jbr\bin\java.exe" set "JAVA_HOME=%ProgramFiles%\Android\Android Studio\jbr"
if not defined ANDROID_HOME if exist "%LOCALAPPDATA%\Android\Sdk" set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
if defined JAVA_HOME set "PATH=%JAVA_HOME%\bin;%PATH%"
echo Creazione Akhbar Post - APK di prova installabile
call "%~dp0gradlew.bat" --no-daemon assembleDebug
if errorlevel 1 goto failed
echo.
echo APK pronto:
echo %~dp0app\build\outputs\apk\debug\app-debug.apk
echo Copia questo file sul telefono per installarlo.
exit /b 0
:failed
echo.
echo Creazione non riuscita. Leggi il primo errore sopra.
echo Installa Android Studio e Android SDK Platform 35.
echo Apri prima questo progetto in Android Studio e completa la sincronizzazione.
exit /b 1
