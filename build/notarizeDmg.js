/**
 * electron-builderのafterAllArtifactBuildフック用のDMG公証スクリプト
 * DMG作成後に公証を実行します
 * 
 * 認証情報の取得順序:
 * 1. 環境変数 (GitHub Actions用)
 * 2. キーチェーンプロファイル「AC_PROFILE」(ローカルビルド用)
 */
const { execSync } = require('child_process');
const path = require('path');

/**
 * DMGを公証してstapleする
 * @param {string} dmgPath - DMGファイルのパス
 * @param {object|null} apiInfo - APIキー情報（環境変数から）
 */
async function notarizeDmg(dmgPath, apiInfo) {
  console.log(`Notarizing DMG: ${dmgPath}`);
  
  try {
    if (apiInfo) {
      // GitHub Actions: 環境変数からAPIキー情報を使用
      console.log('Using API Key from environment variables');
      execSync(
        `xcrun notarytool submit "${dmgPath}" ` +
        `--key "${apiInfo.apiKeyPath}" ` +
        `--key-id "${apiInfo.apiKeyId}" ` +
        `--issuer "${apiInfo.apiIssuer}" ` +
        `--wait`,
        { stdio: 'inherit' }
      );
    } else {
      // ローカル: キーチェーンプロファイルを使用
      console.log('Using keychain profile: AC_PROFILE');
      execSync(
        `xcrun notarytool submit "${dmgPath}" --keychain-profile "AC_PROFILE" --wait`,
        { stdio: 'inherit' }
      );
    }
    
    // Staple
    console.log(`Stapling: ${dmgPath}`);
    execSync(`xcrun stapler staple "${dmgPath}"`, { stdio: 'inherit' });
    
    // 検証
    console.log(`Validating staple: ${dmgPath}`);
    execSync(`xcrun stapler validate "${dmgPath}"`, { stdio: 'inherit' });
    
    // アプリを検証
    console.log(`Verifying app inside DMG...`);
    execSync(`hdiutil attach "${dmgPath}" -nobrowse -readonly -mountpoint /tmp/dmg_verify`, { stdio: 'inherit' });
    try {
      execSync(`spctl -a -vvv -t execute "/tmp/dmg_verify/WakeOnDisplay.app"`, { stdio: 'inherit' });
    } finally {
      execSync(`hdiutil detach /tmp/dmg_verify`, { stdio: 'inherit' });
    }
    
    console.log(`DMG notarization complete: ${dmgPath}`);
  } catch (error) {
    console.error(`DMG notarization failed: ${dmgPath}`, error);
    throw error;
  }
}

exports.default = async function afterAllArtifactBuild(context) {
  // macOS以外はスキップ
  if (process.platform !== 'darwin') {
    return context.artifactPaths;
  }

  // 環境変数からAPIキー情報を取得
  const apiKeyId = process.env.APPLE_API_KEY_ID;
  const apiIssuer = process.env.APPLE_API_ISSUER;
  const apiKeyPath = process.env.APPLE_API_KEY;
  
  const apiInfo = (apiKeyId && apiIssuer && apiKeyPath) 
    ? { apiKeyId, apiIssuer, apiKeyPath } 
    : null;

  // DMGファイルを公証
  for (const artifactPath of context.artifactPaths) {
    if (artifactPath.endsWith('.dmg')) {
      await notarizeDmg(artifactPath, apiInfo);
    }
  }

  return context.artifactPaths;
};
