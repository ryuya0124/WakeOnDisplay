# WakeOnDisplay

ディスプレイだけがスリープしているPCを、Wake-on-LAN（WoL）のマジックパケットで復帰させる軽量なトレイ常駐アプリです。

## 特徴

- Windows 10/11（x64 / ARM64）とmacOS 13以降（Intel / Apple Silicon）に対応
- Electron、WebView、Node.jsを使わないRustネイティブ実装
- 自分のネットワークインターフェース宛の正しいマジックパケットだけに反応
- トレイまたはメニューバーだけのコンパクトなUI
- OS標準機能を使ったログイン時の自動起動
- WoL受信後に任意のユーザースクリプトを順番に実行

## インストール

[Releases](https://github.com/ryuya0124/WakeOnDisplay/releases) からOSに合う最新版をダウンロードしてください。

- Windows: `.exe` インストーラー
- macOS: Universal `.dmg`

起動するとWindowsではタスクトレイ、macOSではメニューバーにアイコンが表示され、UDPポート9で待受を開始します。

## トレイメニュー

- **自動起動**: ログイン時の自動起動を切り替えます。
- **スクリプトフォルダを開く**: WoL受信後に実行するスクリプトの保存先を開きます。
- **終了**: アプリを終了します。

設定ウィンドウはありません。すべての操作はトレイメニューで完結します。

## スクリプト実行

スクリプトフォルダ内のファイルを名前順に実行します。

- Windows: `.ps1`, `.bat`, `.cmd`
- macOS: `.sh`, `.applescript`, `.scpt`

セキュリティ上の制約:

- シンボリックリンクとフォルダ外のファイルは実行しません。
- rootまたは管理者権限で起動中はユーザースクリプトを実行しません。
- 各スクリプトは60秒でタイムアウトします。
- 多重実行を防ぎ、WoL受信後30秒間は再実行しません。

## ディスプレイ復帰方法

- Windows: PowerShellからCaps Lockを2回送信します。
- macOS: `caffeinate -u -t 20` を実行します。

## 開発

Rust 1.90以降が必要です。

```bash
cargo test --all-targets
cargo run
```

配布物の生成には[cargo-packager](https://github.com/crabnebula-dev/cargo-packager)を使います。

```bash
cargo install cargo-packager --version 0.11.8 --locked
cargo build --release
cargo packager --release --formats dmg  # macOS
cargo packager --release --formats nsis # Windows
```

タグ `v*` をpushすると、GitHub ActionsがWindows x64/ARM64とmacOS Universalの配布物をビルドし、GitHub Releaseへ公開します。macOSのDeveloper ID証明書はFastlane Matchで取得し、署名とApple公証を行います。

## ログとデータ

ログ、スクリプト、ロックファイルはユーザーデータフォルダ内の `wakeondisplay` に保存されます。Electron版と同じ保存先なので既存のユーザースクリプトも引き継がれます。アンインストールしてもユーザースクリプトは自動削除しません。

## ライセンス

[MIT](LICENSE)
