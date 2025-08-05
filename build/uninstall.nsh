!macro customUnInstall
  ; ユーザーデータフォルダのパスを指定（例: %APPDATA%\WakeOnDisplay）
  StrCpy $0 "$APPDATA\WakeOnDisplay"

  ; フォルダが存在したら削除
  IfFileExists "$0" 0 +3
  RMDir /r "$0"

  ; 現在ユーザーのスタートアップ登録を削除
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Run\WakeOnDisplay"

  ; マシン全体のスタートアップ登録を削除
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Run\WakeOnDisplay"

  ; Windowsサービスを削除
  ExecWait '"sc.exe" stop WakeOnDisplay' ; サービスを停止
  ExecWait '"sc.exe" delete WakeOnDisplay' ; サービスを削除

  ; node-windows が作成したログや関連ファイルを削除
  Delete "$APPDATA\WakeOnDisplay\*.*"
  RMDir "$APPDATA\WakeOnDisplay"
!macroend