Unicode true
!include "MUI2.nsh"
!include "x64.nsh"
Name "Crea Studio"
OutFile "${OUTPUT}"
InstallDir "$LOCALAPPDATA\Programs\Crea Studio"
InstallDirRegKey HKCU "Software\Crea Studio" "InstallDir"
RequestExecutionLevel user
SetCompressor zlib
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\Crea Studio.exe"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Italian"
VIProductVersion "${VERSION}.0"
VIAddVersionKey /LANG=1040 "ProductName" "Crea Studio"
VIAddVersionKey /LANG=1040 "FileDescription" "Installazione Crea Studio"
VIAddVersionKey /LANG=1040 "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=1040 "LegalCopyright" "Crea Studio"
Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_OK|MB_ICONSTOP "Crea Studio richiede Windows a 64 bit."
    Abort
  ${EndIf}
FunctionEnd
Section "Crea Studio"
  SetShellVarContext current
  SetOutPath "$INSTDIR"
  File /r "${APP_DIR}\*"
  WriteUninstaller "$INSTDIR\Disinstalla.exe"
  CreateDirectory "$SMPROGRAMS\Crea Studio"
  CreateShortcut "$SMPROGRAMS\Crea Studio\Crea Studio.lnk" "$INSTDIR\Crea Studio.exe"
  CreateShortcut "$DESKTOP\Crea Studio.lnk" "$INSTDIR\Crea Studio.exe"
  WriteRegStr HKCU "Software\Crea Studio" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CreaStudio" "DisplayName" "Crea Studio"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CreaStudio" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CreaStudio" "Publisher" "Crea Studio"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CreaStudio" "UninstallString" '"$INSTDIR\Disinstalla.exe"'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CreaStudio" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CreaStudio" "DisplayIcon" "$INSTDIR\Crea Studio.exe"
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CreaStudio" "EstimatedSize" ${SIZE_KB}
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CreaStudio" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CreaStudio" "NoRepair" 1
SectionEnd
Section "Uninstall"
  SetShellVarContext current
  ; Delete only files installed by this package. Preserve user files in the folder.
  !include "${MANIFEST}"
  Delete "$INSTDIR\Disinstalla.exe"
  RMDir "$INSTDIR"
  Delete "$DESKTOP\Crea Studio.lnk"
  Delete "$SMPROGRAMS\Crea Studio\Crea Studio.lnk"
  RMDir "$SMPROGRAMS\Crea Studio"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CreaStudio"
  DeleteRegKey HKCU "Software\Crea Studio"
SectionEnd
