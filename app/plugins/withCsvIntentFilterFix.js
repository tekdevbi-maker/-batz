// expo-dev-client's own config plugin (withGeneratedAndroidScheme ->
// AndroidConfig.Scheme.appendScheme) injects <data android:scheme="exp+batz"/>
// into EVERY action.VIEW intent-filter on the main activity that isn't the
// launcher -- including the CSV-handling one from app.json's
// android.intentFilters (spec Section 3a's "Open With @Batz" feature).
// Once ANY <data> tag in an intent-filter declares a scheme, Android
// requires every match against that filter to have that scheme too, which
// silently breaks CSV-open matching (real file URIs are never exp+batz://).
// There's no app.json-level way to opt a filter out of this, so this
// plugin runs after prebuild's manifest mods and strips the exp+ scheme
// back out of the filter we identify by its `*/*` mimeType entry.
const { withAndroidManifest } = require("expo/config-plugins");

function stripExpSchemeFromCsvFilter(androidManifest) {
  for (const application of androidManifest.manifest.application || []) {
    for (const activity of application.activity || []) {
      for (const intentFilter of activity["intent-filter"] || []) {
        const mimeTypes = (intentFilter.data || [])
          .map((d) => d?.$?.["android:mimeType"])
          .filter(Boolean);
        if (mimeTypes.includes("*/*")) {
          intentFilter.data = (intentFilter.data || []).filter(
            (d) => !(d?.$?.["android:scheme"] || "").startsWith("exp+")
          );
        }
      }
    }
  }
  return androidManifest;
}

module.exports = function withCsvIntentFilterFix(config) {
  return withAndroidManifest(config, (config) => {
    config.modResults = stripExpSchemeFromCsvFilter(config.modResults);
    return config;
  });
};
