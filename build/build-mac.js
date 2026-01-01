#!/usr/bin/env node

/**
 * macOSビルドスクリプト
 * 
 * 1. Fastlane matchで証明書をセットアップ
 * 2. electron-builderでビルド
 * 
 * 使用方法: node build/build-mac.js [electron-builder options]
 */

const { execSync, spawn } = require('child_process');
const os = require('os');

// macOS以外はelectron-builderのみ実行
if (os.platform() !== 'darwin') {
  console.log('Not macOS, skipping Fastlane setup');
  runElectronBuilder();
  process.exit(0);
}

/**
 * Fastlane matchで証明書をセットアップ
 */
function setupCertificates() {
  console.log('==> Setting up certificates with Fastlane match...');
  
  try {
    execSync('fastlane mac setup_certificates', {
      stdio: 'inherit',
      cwd: process.cwd()
    });
    console.log('==> Certificate setup complete');
  } catch (error) {
    console.error('Failed to setup certificates:', error.message);
    process.exit(1);
  }
}

/**
 * electron-builderを実行
 */
function runElectronBuilder() {
  console.log('==> Running electron-builder...');
  
  // コマンドライン引数を取得（node build/build-mac.js の後の引数）
  const args = process.argv.slice(2);
  // pnpm exec で直接 electron-builder を実行
  const builderArgs = ['exec', 'electron-builder', ...args];
  
  const result = spawn('pnpm', builderArgs, {
    stdio: 'inherit',
    cwd: process.cwd()
  });
  
  result.on('close', (code) => {
    process.exit(code);
  });
  
  result.on('error', (error) => {
    console.error('Failed to run electron-builder:', error.message);
    process.exit(1);
  });
}

// メイン処理
setupCertificates();
runElectronBuilder();
