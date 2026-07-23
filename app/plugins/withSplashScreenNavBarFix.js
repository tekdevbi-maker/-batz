// expo-splash-screen's own withAndroidSplashStyles mod (expo-splash-screen/
// plugin/src/withAndroidSplashStyles.ts) rebuilds the Theme.App.SplashScreen
// style group wholesale on every prebuild -- it filters out any existing
// group by that name and appends a fresh one with only its own 4 items. That
// mod runs as a normal ("safe") android.styles mod, and -- confirmed by
// tracing actual prebuild output -- @expo/config-plugins does NOT guarantee
// same-modName mods run in app.json plugins-array order; only "dangerous"
// (always first) and "finalized" (always last) have a fixed position. So a
// withAndroidStyles or withDangerousMod attempt here is a race against
// expo-splash-screen's own mod. withFinalizedMod runs after every other mod
// unconditionally, which is the only reliable way to edit the file it just
// finished writing.
//
// Without this, android:navigationBarColor/statusBarColor are unset on
// Theme.App.SplashScreen, and gesture-nav devices draw the system's default
// dark scrim behind those bars during the splash phase -- a black bar under
// an otherwise white splash screen.
const fs = require("fs");
const path = require("path");
const { withFinalizedMod } = require("expo/config-plugins");

const ITEMS = `    <item name="android:navigationBarColor">@color/splashscreen_background</item>
    <item name="android:statusBarColor">@color/splashscreen_background</item>`;

module.exports = function withSplashScreenNavBarFix(config) {
  return withFinalizedMod(config, [
    "android",
    (config) => {
      const stylesPath = path.join(
        config.modRequest.platformProjectRoot,
        "app/src/main/res/values/styles.xml"
      );
      const contents = fs.readFileSync(stylesPath, "utf8");
      // Scoped to the SplashScreen style block specifically -- AppTheme
      // already has its own (differently-valued) navigationBarColor item,
      // so a whole-file .includes() check here would always short-circuit.
      const splashBlock = contents.match(/<style name="Theme\.App\.SplashScreen"[^>]*>[\s\S]*?<\/style>/);
      if (splashBlock && !splashBlock[0].includes('name="android:navigationBarColor"')) {
        const updated = contents.replace(
          /(<style name="Theme\.App\.SplashScreen"[^>]*>)/,
          `$1\n${ITEMS}`
        );
        fs.writeFileSync(stylesPath, updated);
      }
      return config;
    },
  ]);
};
