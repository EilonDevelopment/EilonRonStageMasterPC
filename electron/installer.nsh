!macro customInstall
  DetailPrint "Instalando drivers USB (Silicon Labs CP210x y FTDI)..."
  nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$INSTDIR\install-usb-com-drivers.ps1"'
  Pop $0
  ${If} $0 != 0
    DetailPrint "Aviso: la instalación de drivers devolvió código $0. Si el CRR ya tiene driver, puede ignorarse."
  ${Else}
    DetailPrint "Drivers USB instalados."
  ${EndIf}
!macroend
