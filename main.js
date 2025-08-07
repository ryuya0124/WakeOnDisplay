// main.js
const { app, Tray, Menu, dialog } = require('electron');
const dgram = require('dgram');
const { exec } = require('child_process');
const path = require('path');
const { enableAutoLaunch, disableAutoLaunch, isAutoLaunchEnabled } = require('./auto-launch'); // 作成したモジュールをインポート
const log = require('electron-log');
const os = require('os');

let tray = null;

/*Windowsターミナルはこうする
$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new()
chcp 65001
*/

/**
 * 受信したバッファが、指定されたMACアドレス宛の有効なマジックパケットか判定します。
 * @param {Buffer} buffer - 受信したUDPパケットのバッファ。
 * @param {string} myMac - 比較対象となる自分自身のMACアドレス（例: 'aabbccddeeff'）。
 * @returns {boolean} 自分宛のマジックパケットであればtrue。
 */
function isMagicPacket(buffer, myMac) {
    // 1. (長さ102バイト、先頭6バイトが0xFF)
    if (buffer.length < 102 || buffer.toString('hex', 0, 6) !== 'ffffff') {
        console.log('無効なマジックパケット: 長さまたは先頭の0xFFが不正です。');
        log.error('無効なマジックパケット: 長さまたは先頭の0xFFが不正です。');
        return false;
    }

    // 2. パケットから宛先MACアドレスを抽出
    const targetMac = buffer.toString('hex', 6, 12).toLowerCase();
    console.log(`受信したMACアドレス: ${targetMac}`);
    log.info(`受信したMACアドレス: ${targetMac}`);

    // 3. 自分のMACアドレスと比較して結果を返す
    return targetMac === myMac;
}

// 全ての有効なMACアドレスを配列で返す関数
function getMyMacAddresses() {
    try {
        const macs = [];
        const nets = os.networkInterfaces();
        for (const name of Object.keys(nets)) {
            for (const net of nets[name]) {
                if (net.family === 'IPv4' && !net.internal && net.mac !== '00:00:00:00:00:00') {
                    macs.push(net.mac.replace(/:/g, '').toLowerCase());
                }
            }
        }
        console.log(`有効なMACアドレス: ${macs.join(', ')}`);
        log.info(`有効なMACアドレス: ${macs.join(', ')}`);
        return macs;
    } catch (err) {
        console.error('MACアドレスの取得に失敗しました:', err);
        log.error('MACアドレスの取得に失敗しました:', err);
        return [];
    }
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

    server.on('error', (err) => {
        // ★ console.error を log.error に変更
        log.error(`WoLリスナーでエラーが発生しました: ${err.stack}`);
        if (err.code === 'EADDRINUSE') {
            dialog.showMessageBox({
                type: 'error',
                title: 'ポート競合エラー',
                message: 'Wake-on-LANの待受ポート(UDP:9)が、他のアプリケーションによって既に使用されています。',
                detail: 'このため、マジックパケットを監視する機能はご利用いただけません。他の機能は引き続き使用可能です。'
            });
        }
        server.close();
    });

    server.on('message', (msg) => {
        if (isMagicPacket(msg, getMyMacAddresses())) {
            // ★ console.log を log.info に変更
            log.info('マジックパケットを受信しました！');
            wakeDisplay();
        }
    });

    server.on('listening', () => {
        const address = server.address();
        // ★ console.log を log.info に変更
        log.info(`WoLリスナーが ${address.address}:${address.port} で待受を開始しました。`);
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
                // menuItem.checkedはクリック"後"の状態を反映
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