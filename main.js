// main.js
const { app, Tray, Menu } = require('electron');
const dgram = require('dgram');
const { exec } = require('child_process');
const AutoLaunch = require('auto-launch');
const path = require('path');

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
		exec(`osascript -e 'tell application "System Events" to key code 123'`);
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
	server.bind(9); // 9番ポートで待機
}

function setupAutoLaunch() {
	const autoLauncher = new AutoLaunch({
		name: 'WakeOnDisplay'
	});
	autoLauncher.enable().catch(() => { });
}

app.whenReady().then(() => {
	tray = new Tray(path.join(__dirname, 'icon.png'));
	const contextMenu = Menu.buildFromTemplate([
		{ label: '終了', click: () => app.quit() }
	]);
	tray.setToolTip('WakeOnDisplay 起動中');
	tray.setContextMenu(contextMenu);

	setupWoLListener();
	setupAutoLaunch();
});

app.on('window-all-closed', (e) => {
	e.preventDefault();
});
