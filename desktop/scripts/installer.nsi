Unicode true
!include "MUI2.nsh"
!include "x64.nsh"
Name "AKhbar studio"
OutFile "${OUTPUT}"
InstallDir "$LOCALAPPDATA\Programs\AKhbar studio"
InstallDirRegKey HKCU "Software\AKhbar studio" "InstallDir"
RequestExecutionLevel user
SetCompressor zlib
!define MUI_ABORTWARNING
!define MUI_ICON "${APP_DIR}\project-icon.ico"
!define MUI_UNICON "${APP_DIR}\project-icon.ico"
!define MUI_FINISHPAGE_RUN "$INSTDIR\AKhbar studio.exe"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Italian"
VIProductVersion "${VERSION}.0"
VIAddVersionKey /LANG=1040 "ProductName" "AKhbar studio"
VIAddVersionKey /LANG=1040 "FileDescription" "Installazione AKhbar studio"
VIAddVersionKey /LANG=1040 "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=1040 "LegalCopyright" "AKhbar studio"
Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_OK|MB_ICONSTOP "AKhbar studio richiede Windows a 64 bit."
    Abort
  ${EndIf}
FunctionEnd
Section "AKhbar studio"
  SetShellVarContext current
  SetOutPath "$INSTDIR"
  File /r "${APP_DIR}\*"
  WriteRegStr HKCU "Software\Classes\.creastudio" "" "AKhbarStudio.Project"
  WriteRegStr HKCU "Software\Classes\AKhbarStudio.Project" "" "Progetto AKhbar studio"
  WriteRegStr HKCU "Software\Classes\AKhbarStudio.Project\DefaultIcon" "" '$\"$INSTDIR\project-icon.ico$\",0'
  WriteRegStr HKCU "Software\Classes\AKhbarStudio.Project\shell\open\command" "" '$\"$INSTDIR\AKhbar studio.exe$\" $\"%1$\"'
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
  WriteUninstaller "$INSTDIR\Disinstalla.exe"
  CreateDirectory "$SMPROGRAMS\AKhbar studio"
  CreateShortcut "$SMPROGRAMS\AKhbar studio\AKhbar studio.lnk" "$INSTDIR\AKhbar studio.exe" "" "$INSTDIR\project-icon.ico" 0
  CreateShortcut "$DESKTOP\AKhbar studio.lnk" "$INSTDIR\AKhbar studio.exe" "" "$INSTDIR\project-icon.ico" 0
  WriteRegStr HKCU "Software\AKhbar studio" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AKhbarStudio" "DisplayName" "AKhbar studio"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AKhbarStudio" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AKhbarStudio" "Publisher" "AKhbar studio"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AKhbarStudio" "UninstallString" '"$INSTDIR\Disinstalla.exe"'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AKhbarStudio" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AKhbarStudio" "DisplayIcon" "$INSTDIR\AKhbar studio.exe"
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AKhbarStudio" "EstimatedSize" ${SIZE_KB}
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AKhbarStudio" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AKhbarStudio" "NoRepair" 1
SectionEnd
Section "Uninstall"
  SetShellVarContext current
  ; Delete only files installed by this package. Preserve user files in the folder.
  !include "${MANIFEST}"
  Delete "$INSTDIR\Disinstalla.exe"
  RMDir "$INSTDIR"
  Delete "$DESKTOP\AKhbar studio.lnk"
  Delete "$SMPROGRAMS\AKhbar studio\AKhbar studio.lnk"
  RMDir "$SMPROGRAMS\AKhbar studio"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AKhbarStudio"
  ReadRegStr $0 HKCU "Software\Classes\AKhbarStudio.Project\shell\open\command" ""
  StrCmp $0 '$\"$INSTDIR\AKhbar studio.exe$\" $\"%1$\"' 0 association_done
  DeleteRegKey HKCU "Software\Classes\AKhbarStudio.Project"
  ReadRegStr $0 HKCU "Software\Classes\.creastudio" ""
  StrCmp $0 "AKhbarStudio.Project" 0 association_done
  DeleteRegKey HKCU "Software\Classes\.creastudio"
  association_done:
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
  DeleteRegKey HKCU "Software\AKhbar studio"
SectionEnd
