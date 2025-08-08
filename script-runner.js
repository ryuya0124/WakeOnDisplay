const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const fsPromises = fs.promises;
const { spawn } = require('child_process');
const log = require('electron-log');

const STARTUP_SCRIPTS_DIRNAME = 'startup-scripts';
const SCRIPT_TIMEOUT_MS = 60_000; // 60秒の実行タイムアウト
const COOLDOWN_MS = 30_000; // WoL後のクールダウン

let isExecuting = false;
let lastExecutedAt = 0;

function getStartupScriptsDir() {
  return path.join(app.getPath('userData'), STARTUP_SCRIPTS_DIRNAME);
}

async function ensureStartupScriptsDir() {
  try {
    const dir = getStartupScriptsDir();
    await fsPromises.mkdir(dir, { recursive: true });
    log.info(`起動スクリプトフォルダ: ${dir}`);
    return dir;
  } catch (err) {
    log.error('スクリプトフォルダの作成に失敗:', err);
    return null;
  }
}

function buildCommandForScript(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const isWin = process.platform === 'win32';
  const isMac = process.platform === 'darwin';

  if (isWin) {
    if (ext === '.ps1') {
      return {
        command: 'powershell',
        args: ['-NoProfile', '-NonInteractive', '-NoLogo', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', filePath],
      };
    }
    if (ext === '.bat' || ext === '.cmd') return { command: 'cmd', args: ['/d', '/c', `"${filePath}"`] }; // Autorun無効 + 厳密引用
    return null;
  }

  if (isMac) {
    if (ext === '.sh') return { command: '/bin/bash', args: [filePath] };
    if (ext === '.applescript' || ext === '.scpt') return { command: 'osascript', args: [filePath] };
    return null;
  }

  if (ext === '.sh') return { command: '/bin/bash', args: [filePath] };
  return null;
}

async function isWindowsElevated() {
  if (process.platform !== 'win32') return false;
  return await new Promise((resolve) => {
    try {
      const child = spawn('whoami', ['/groups'], { windowsHide: true });
      let out = '';
      child.stdout.on('data', (d) => (out += String(d)));
      child.on('error', () => resolve(false));
      child.on('close', (code) => {
        if (code !== 0) return resolve(false);
        // Administrators グループのSID
        resolve(/S-1-5-32-544/i.test(out) || /BUILTIN\\Administrators/i.test(out));
      });
    } catch {
      resolve(false);
    }
  });
}

async function executeStartupScripts() {
  const dir = getStartupScriptsDir();
  try {
    // 排他 & クールダウン
    const now = Date.now();
    if (isExecuting) {
      log.info('スクリプト実行は既に進行中のためスキップします。');
      return;
    }
    if (now - lastExecutedAt < COOLDOWN_MS) {
      log.info('クールダウン中のためスクリプト実行をスキップします。');
      return;
    }
    isExecuting = true;
    lastExecutedAt = now;

    // 権限ガード（POSIX）
    if (typeof process.getuid === 'function' && process.getuid() === 0) {
      log.warn('root権限ではスクリプトを実行しません。通常ユーザーで実行してください。');
      isExecuting = false;
      return;
    }
    // 権限ガード（Windows 管理者）
    if (await isWindowsElevated()) {
      log.warn('管理者権限ではスクリプトを実行しません。通常ユーザーで実行してください。');
      isExecuting = false;
      return;
    }

    const entries = await fsPromises.readdir(dir, { withFileTypes: true });
    const resolvedDir = path.resolve(dir) + path.sep;
    const files = entries
      .filter((d) => d.isFile() && !(typeof d.isSymbolicLink === 'function' && d.isSymbolicLink()) && !d.name.startsWith('.'))
      .map((d) => path.join(dir, d.name))
      .filter((p) => {
        try {
          const st = fs.lstatSync(p);
          if (st.isSymbolicLink && st.isSymbolicLink()) return false; // symlink拒否
        } catch {
          return false;
        }
        const resolved = path.resolve(p);
        return resolved.startsWith(resolvedDir);
      })
      .sort((a, b) => a.localeCompare(b, 'en'));

    for (const filePath of files) {
      const spec = buildCommandForScript(filePath);
      if (!spec) {
        log.warn(`未対応のスクリプト形式: ${filePath}`);
        continue;
      }

      try {
        log.info(`スクリプト実行: ${filePath}`);
        const child = spawn(spec.command, spec.args, { stdio: 'pipe', windowsHide: true });

        // タイムアウト監視
        const killTimer = setTimeout(() => {
          log.warn(`スクリプトがタイムアウトにより終了されます: ${path.basename(filePath)} (${SCRIPT_TIMEOUT_MS}ms)`);
          try {
            if (process.platform === 'win32') {
              const tk = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
              tk.on('error', () => child.kill('SIGKILL'));
            } else {
              child.kill('SIGTERM');
              setTimeout(() => child.kill('SIGKILL'), 2000);
            }
          } catch (e) {
            log.error('タイムアウト強制終了でエラー:', e);
          }
        }, SCRIPT_TIMEOUT_MS);
        child.stdout.on('data', (data) => log.info(`[script stdout] ${String(data).trim()}`));
        child.stderr.on('data', (data) => log.warn(`[script stderr] ${String(data).trim()}`));
        child.on('close', (code) => {
          clearTimeout(killTimer);
          if (code === 0) log.info(`スクリプト完了: ${path.basename(filePath)} (code=${code})`);
          else log.warn(`スクリプト異常終了: ${path.basename(filePath)} (code=${code})`);
        });
      } catch (e) {
        log.error(`スクリプト実行に失敗: ${filePath}`, e);
      }
    }
  } catch (err) {
    log.warn('スクリプト走査に失敗:', err.message || String(err));
  } finally {
    isExecuting = false;
  }
}

module.exports = {
  getStartupScriptsDir,
  ensureStartupScriptsDir,
  executeStartupScripts,
};


