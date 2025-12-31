const { notarize } = require("@electron/notarize");

exports.default = async function (context) {
  if (context.electronPlatformName !== "darwin") return;

  const { appOutDir, packager } = context;
  const appName = packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;

  // Check if running in a CI environment (e.g., GitHub Actions)
  if (process.env.APPLE_ID && process.env.APPLE_ID_PASSWORD && process.env.TEAM_ID) {
    console.log("Notarizing with environment variables...");
    await notarize({
      appPath,
      appBundleId: "net.ryuya-dev.net.wod", // Bundle ID is required for notarytool when using appleId/appleIdPassword
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_ID_PASSWORD,
      teamId: process.env.TEAM_ID,
      tool: "notarytool",
    });
  } else {
    console.log("Notarizing with keychain profile...");
    await notarize({
      appPath,
      tool: "notarytool",
      keychainProfile: "AC_PROFILE",
    });
  }
};