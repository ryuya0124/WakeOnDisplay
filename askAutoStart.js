const { dialog } = require('electron');
const AutoLaunch = require('auto-launch');

const autoLauncher = new AutoLaunch({
  name: 'WakeOnDisplay', // アプリ名
});

async function askAutoStart() {
  const { response } = await dialog.showMessageBox({
    type: 'question',
    buttons: ['はい', 'いいえ'],
    defaultId: 0,
    message: 'このアプリを起動時に自動実行するように設定しますか？'
  });

  if (response === 0) {
    await autoLauncher.enable();
  } else {
    await autoLauncher.disable();
  }
}

module.exports = { askAutoStart };
