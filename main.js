// main.js
const { app, Tray, Menu, dialog } = require('electron');
const dgram = require('dgram');
const { exec } = require('child_process');
const path = require('path');
const { enableAutoLaunch, disableAutoLaunch, isAutoLaunchEnabled } = require('./auto-launch'); // 作成したモジュールをインポート

let tray = null;

function isMagicPacket(buffer) {
    return buffer.length >= 102 && buffer.slice(0, 6).every(b => b === 0xff);
}

function wakeDisplay() {
    const platform = process.platform;
    if (platform === 'win32') {
        exec(`powershell -command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('{CAPSLOCK}'); Start-Sleep -Milliseconds 100; [System.Windows.Forms.SendKeys]::SendWait('{CAPSLOCK}')"`);
        console.log('Display woken up on Windows');
    } else if (platform === 'darwin') {
        exec(`caffeinate -u -t 20`);
        console.log('Display woken up on macOS');
    }
}

function setupWoLListener() {
    const server = dgram.createSocket('udp4');
    server.on('message', (msg) => {
        if (isMagicPacket(msg)) {
            console.log('Magic Packet received!');
            wakeDisplay();
        }
    });
    server.bind(9);
}

// メニューを更新する関数
async function updateTrayMenu() {
    const autoLaunchEnabled = await isAutoLaunchEnabled();

    const contextMenu = Menu.buildFromTemplate([
        {
            label: '自動起動',
            type: 'checkbox',
            checked: autoLaunchEnabled,
            click: (menuItem) => {
                // menuItem.checkedはクリック"後"の状態を反映します。
                // これをそのまま「目標の状態」として使います。
                const targetState = menuItem.checked;

                // 1. UIを即座に更新し、処理中は操作不能にする
                const processingMenu = Menu.buildFromTemplate([
                    {
                        label: '自動起動',
                        type: 'checkbox',
                        checked: targetState, // UIを先に目標の状態へ変更
                        enabled: false,       // 処理中はグレーアウトしてクリック不可に
                    },
                    { type: 'separator' },
                    { label: '終了', click: () => app.quit() }
                ]);
                tray.setContextMenu(processingMenu);

                // 2. 非同期で実際の処理を実行
                const process = async () => {
                    // targetStateがtrueなら有効化、falseなら無効化を実行
                    const success = targetState
                        ? await enableAutoLaunch()
                        : await disableAutoLaunch();

                    if (!success) {
                        dialog.showMessageBox({
                            type: 'error',
                            buttons: ['OK'],
                            title: 'エラー',
                            message: '自動起動の設定変更に失敗しました。',
                        });
                    }

                    // 4. 成功・失敗にかかわらず、最終的な正しい状態からメニューを再構築する
                    await updateTrayMenu();
                };

                process();
            }
        },
        { type: 'separator' },
        { label: '終了', click: () => app.quit() }
    ]);

    tray.setContextMenu(contextMenu);
}

app.whenReady().then(async () => {
    const iconName = {
        win32: 'assets/windows/icon.ico',
        darwin: 'assets/mac/icon_tray.iconset/icon_32x32.png',
        linux: 'assets/icon_trans.png'
    }[process.platform] || 'assets/icon_trans.png';

    tray = new Tray(path.join(__dirname, iconName));

    setupWoLListener();

    await updateTrayMenu();

    if (process.platform === 'darwin') {
        app.dock.hide();
    }
});

app.on('window-all-closed', (e) => {
    e.preventDefault();
});