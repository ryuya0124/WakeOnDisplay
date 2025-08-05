// auto-launch.js
const AutoLaunch = require('auto-launch');
const { app } = require('electron');
const Service = process.platform === 'win32' ? require('node-windows').Service : null;

const applescript = process.platform === 'darwin' ? require('applescript') : null;

const autoLauncher = new AutoLaunch({
    name: 'WakeOnDisplay',
});

const isDev = !app.isPackaged;

/**
 * 自動起動を有効に
 * @returns {Promise<boolean>} 成功した場合は true, 失敗した場合は false
 */
async function enableAutoLaunch() {
    if (process.platform === 'win32') {
        try {
            const svc = new Service({
                name: 'WakeOnDisplay',
                description: 'WakeOnDisplay Windows Service',
                script: app.getPath('exe'),
            });

            svc.on('install', () => {
                svc.start();
                console.log('Service installed and started.');
            });

            svc.install();
            return true;
        } catch (err) {
            console.error('Failed to enable service:', err);
            return false;
        }
    } else {
        try {
            if (!isDev) await autoLauncher.enable();
            console.log('Auto-launch enabled.');
            return true;
        } catch (err) {
            console.error('Failed to enable auto-launch:', err);
            return false;
        }
    }
}

/**
 * 自動起動を無効に
 * @returns {Promise<boolean>} 成功した場合は true, 失敗した場合は false
 */
async function disableAutoLaunch() {
    if (process.platform === 'win32') {
        try {
            const svc = new Service({
                name: 'WakeOnDisplay',
            });

            svc.on('uninstall', () => {
                console.log('Service uninstalled.');
            });

            svc.uninstall();
            return true;
        } catch (err) {
            console.error('Failed to disable service:', err);
            return false;
        }
    } else {
        try {
            await autoLauncher.disable();
            console.log('Auto-launch disabled.');
            return true;
        } catch (err) {
            console.error('Failed to disable auto-launch:', err);
            return false;
        }
    }
}

/**
 * 自動起動が有効かどうかを確認
 * @returns {Promise<boolean>} 有効な場合は true, それ以外は false
 */
async function isAutoLaunchEnabled() {
    if (process.platform === 'win32') {
        // Windowsサービスの状態を確認するロジックを追加する場合はここに記述
        return false; // 必要に応じて実装
    } else {
        try {
            const isEnabled = await autoLauncher.isEnabled();
            return isEnabled;
        } catch (err) {
            console.error('Failed to check auto-launch status:', err);
            return false;
        }
    }
}

module.exports = {
    enableAutoLaunch,
    disableAutoLaunch,
    isAutoLaunchEnabled,
};