import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Native shells for Android and iOS. The web build in `dist` is bundled into
 * the app, so the game runs fully offline with no server behind it.
 */
const config: CapacitorConfig = {
  appId: "tr.com.yctechnologies.gridlock",
  appName: "Gridlock",
  webDir: "dist",
  backgroundColor: "#0a0e13",
  android: {
    backgroundColor: "#0a0e13",
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
  ios: {
    backgroundColor: "#0a0e13",
    contentInset: "never",
    scrollEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: "#0a0e13",
      showSpinner: false,
    },
    StatusBar: {
      overlaysWebView: true,
      style: "DARK",
    },
  },
};

export default config;
