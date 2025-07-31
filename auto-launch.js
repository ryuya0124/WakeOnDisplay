// auto-launch.js
const AutoLaunch = require('auto-launch');
const { app } = require('electron');

const applescript = process.platform === 'darwin' ? require('applescript') : null;

const autoLauncher = new AutoLaunch({
    name: 'WakeOnDisplay',
});

/**
 * 自動起動を有効に
 * @returns {Promise<boolean>} 成功した場合は true, 失敗した場合は false
 */
async function enableAutoLaunch() {
    try {
        await autoLauncher.enable();
        console.log('Auto-launch enabled.');
        return true;
    } catch (err) {
        console.error('Failed to enable auto-launch:', err);
        return false;
    }
}

/**
 * 自動起動を無効に
 * @returns {Promise<boolean>} 成功した場合は true, 失敗した場合は false
 */
async function disableAutoLaunch() {
    try {
        await autoLauncher.disable();
        console.log('auto-launchのdisable処理が完了しました。');

    } catch (err) {
        console.warn('auto-launchライブラリのdisable処理でエラーが発生しました。手動でのクリーンアップを続行します。', err.message);
    }

    if (process.platform === 'darwin' && applescript) {
        const script = `
            tell application "System Events"
                if login item "WakeOnDisplay" exists then
                    delete login item "WakeOnDisplay"
                end if
            end tell
        `;
        try {
            await new Promise((resolve, reject) => {
                applescript.execString(script, (err, result) => {
                    if (err) {
                        console.error('手動でのAppleScriptクリーンアップに失敗しました。', err);
                        reject(err);
                        return;
                    }
                    console.log('手動でのAppleScriptクリーンアップが成功しました。');
                    resolve(result);
                });
            });
        } catch (scriptErr) {
            return false; // スクリプトの実行に失敗した場合はfalseを返す
        }
    }
    return true;
}

/**
 * 自動起動が有効かどうかを確認
 * @returns {Promise<boolean>} 有効な場合は true, それ以外は false
 */
async function isAutoLaunchEnabled() {
    try {
        const isEnabled = await autoLauncher.isEnabled();
        return isEnabled;
    } catch (err) {
        console.error('Failed to check auto-launch status:', err);
        return false;
    }
}

module.exports = {
    enableAutoLaunch,
    disableAutoLaunch,
    isAutoLaunchEnabled,
};