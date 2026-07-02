!macro customInit
  ; 安装开始前先清理当前用户的快捷方式，确保重新创建的链接指向 HoraSpace.exe。
  Delete "$DESKTOP\HoraSpace.lnk"
  Delete "$SMPROGRAMS\HoraSpace.lnk"
  Delete "$SMPROGRAMS\HoraSpace\HoraSpace.lnk"
!macroend

!macro customUnInstall
  ; 卸载时同步清理当前用户桌面和开始菜单中的快捷方式残留。
  Delete "$DESKTOP\HoraSpace.lnk"
  Delete "$SMPROGRAMS\HoraSpace.lnk"
  Delete "$SMPROGRAMS\HoraSpace\HoraSpace.lnk"
!macroend

!macro customInstall
  ; 安装完成前校验主程序是否真实落盘，避免留下无法启动的目录和快捷方式。
  ${IfNot} ${FileExists} "$appExe"
    MessageBox MB_OK|MB_ICONSTOP "HoraSpace.exe was not installed. Please use the installer that matches your Windows architecture, and check Windows Security protection history."
    Abort
  ${EndIf}
!macroend
