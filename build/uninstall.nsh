!macro customUnInstall
  ; ユーザーデータフォルダのパスを指定（例: %APPDATA%\WakeOnDisplay）
  StrCpy $0 "$APPDATA\WakeOnDisplay"

  ; フォルダが存在したら削除
  IfFileExists "$0" 0 +3
  RMDir /r "$0"
!macroend
