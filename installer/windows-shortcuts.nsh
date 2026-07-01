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
