/**
 * electron-builderのafterSignフック用の公証スクリプト
 * App Store Connect APIキーを使用してmacOSアプリを公証します
 * 
 * 認証情報の取得順序:
 * 1. 環境変数 (GitHub Actions用)
 * 2. キーチェーンプロファイル「AC_PROFILE」(ローカルビルド用)
 *    - xcrun notarytool store-credentials "AC_PROFILE" で登録
 */
const { notarize } = require('@electron/notarize');
const path = require('path');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;

  // macOS以外はスキップ
  if (electronPlatformName !== 'darwin') {
    console.log('Notarization skipped: Not macOS');
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);

  console.log(`Notarizing ${appPath}...`);

  // 環境変数から取得（GitHub Actions用）
  const apiKeyId = process.env.APPLE_API_KEY_ID;
  const apiIssuer = process.env.APPLE_API_ISSUER;
  const apiKeyPath = process.env.APPLE_API_KEY;

  try {
    if (apiKeyId && apiIssuer && apiKeyPath) {
      // GitHub Actions: 環境変数からAPIキー情報を使用
      console.log('Using API Key from environment variables');
      console.log(`  API Key ID: ${apiKeyId}`);
      console.log(`  API Key Path: ${apiKeyPath}`);
      
      await notarize({
        appPath: appPath,
        appleApiKey: apiKeyPath,
        appleApiKeyId: apiKeyId,
        appleApiIssuer: apiIssuer,
      });
    } else {
      // ローカル: キーチェーンプロファイルを使用
      console.log('Using keychain profile: AC_PROFILE');
      
      await notarize({
        appPath: appPath,
        keychainProfile: 'AC_PROFILE',
      });
    }
    console.log('Notarization complete!');
  } catch (error) {
    console.error('Notarization failed:', error);
    throw error;
  }
};
