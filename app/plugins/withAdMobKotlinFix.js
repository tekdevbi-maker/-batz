const { withProjectBuildGradle } = require("@expo/config-plugins");

// react-native-google-mobile-ads (16.5.0) defaults to Google's
// play-services-ads 25.4.0, whose .kotlin_module metadata (binary version
// 2.3.0) is newer than the Kotlin compiler this Expo SDK 57 project uses
// by default (2.1.20) -- "Module was compiled with an incompatible
// version of Kotlin. The binary version of its metadata is 2.3.0,
// expected version is 2.1.0."
//
// Two things were tried and rejected before this:
// 1. Downgrading play-services-ads: 23.6.0 predates the
//    RequestConfiguration.AgeRestrictedTreatment API this library's own
//    Kotlin source calls, and 24.9.0 (the last pre-25.x release) still
//    doesn't have it -- that API is 25.x-only, exactly the line with the
//    newer metadata. The ad SDK version can't move.
// 2. Bumping the whole project's Kotlin toolchain to 2.3.0 (via
//    expo-build-properties' android.kotlinVersion, plus forcing the
//    kotlin-stdlib/kotlin-reflect artifact versions): this got
//    react-native-google-mobile-ads compiling, but broke a DIFFERENT
//    library instead (@react-native-community/datetimepicker), which
//    still resolves its own Kotlin Gradle Plugin at 2.1.x from its own
//    isolated buildscript block and crashed trying to read 2.3.0-tagged
//    stdlib metadata with that older compiler. Forcing one project-wide
//    version just moves the incompatibility to whichever module didn't
//    follow along.
//
// The actual fix: stop asking the compiler to enforce metadata-version
// compatibility at all. -Xskip-metadata-version-check is Kotlin's own
// documented escape hatch for exactly this "compiled with an incompatible
// version" error -- it lets an older compiler read a dependency's newer
// metadata without erroring, since in practice a single dependency jar's
// metadata is readable across these versions even when the compiler's
// own strict version gate would otherwise refuse it.
module.exports = function withAdMobKotlinFix(config) {
  return withProjectBuildGradle(config, (config) => {
    if (config.modResults.language !== "groovy") {
      throw new Error("withAdMobKotlinFix expects a Groovy android/build.gradle");
    }
    const marker = "// @generated withAdMobKotlinFix";
    if (config.modResults.contents.includes(marker)) {
      return config;
    }
    const injected = `
${marker}
allprojects {
  tasks.withType(org.jetbrains.kotlin.gradle.tasks.KotlinCompile).configureEach {
    compilerOptions {
      freeCompilerArgs.add("-Xskip-metadata-version-check")
    }
  }
}
`;
    config.modResults.contents += injected;
    return config;
  });
};
