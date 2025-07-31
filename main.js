// main.js
const { app, Tray, Menu, dialog } = require('electron');
const dgram = require('dgram');
const { exec } = require('child_process');
const AutoLaunch = require('auto-launch');
const path = require('path');
const fs = require('fs');

let tray = null;
const configPath = path.join(app.getPath('userData'), 'config.json');

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

function isFirstLaunch() {
	try {
		return !fs.existsSync(configPath);
	} catch {
		return true;
	}
}

function saveConfig(config) {
	fs.writeFileSync(configPath, JSON.stringify(config));
}

async function askAutoStart() {
	const autoLauncher = new AutoLaunch({ name: 'WakeOnDisplay' });

	const { response } = await dialog.showMessageBox({
		type: 'question',
		buttons: ['はい', 'いいえ'],
		defaultId: 0,
		message: 'このアプリを自動起動に設定しますか？',
	});

	if (response === 0) {
		try {
			await autoLauncher.enable();
			saveConfig({ autoLaunch: true });
		} catch (err) {
			console.error('Failed to enable auto-launch:', err);
			await dialog.showMessageBox({
				type: 'error',
				buttons: ['OK'],
				title: '自動起動設定エラー',
				message: '自動起動の設定に失敗しました。管理者権限やシステム設定を確認してください。',
				detail: err.message || String(err),
			});
			saveConfig({ autoLaunch: false });
		}
	} else {
		try {
			await autoLauncher.disable();
			saveConfig({ autoLaunch: false });
		} catch (err) {
			console.error('Failed to disable auto-launch:', err);
			await dialog.showMessageBox({
				type: 'error',
				buttons: ['OK'],
				title: '自動起動解除エラー',
				message: '自動起動の解除に失敗しました。',
				detail: err.message || String(err),
			});
		}
	}
}

app.whenReady().then(async () => {
	const iconName = {
		win32: 'assets/windows/icon.ico',
		darwin: 'assets/mac/icon_tray.iconset/icon_32x32.png',
		linux: 'assets/icon_trans.png'
	}[process.platform] || 'assets/icon_trans.png';

	tray = new Tray(path.join(__dirname, iconName));

	const contextMenu = Menu.buildFromTemplate([
		{ label: '終了', click: () => app.quit() }
	]);
	tray.setToolTip('WakeOnDisplay 起動中');
	tray.setContextMenu(contextMenu);

	setupWoLListener();

	if (isFirstLaunch()) {
		await askAutoStart();
	}
});

// トレイのみで動かすなら、ウィンドウ閉じたら終了しない
app.on('window-all-closed', (e) => {
	e.preventDefault();
});
