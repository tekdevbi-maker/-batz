// Fixes the "Open With @Batz" file-open flow (spec Section 3a) on Android
// for BOTH ways another app can hand us a CSV: a file manager's "Open
// with" (ACTION_VIEW, URI in intent.data) and a "Share"/"Export" flow like
// GameChanger's own "Export Filtered Stats" (ACTION_SEND, URI in the
// EXTRA_STREAM extra, not intent.data). Either way, Android only grants
// OUR app a transient read permission for that URI. By the time Expo
// Router's JS-level native-intent routing/navigation runs and our screen
// tries to actually read the file, that grant is gone -- confirmed via
// real device/emulator testing: every expo-file-system read API (the new
// File class, legacy readAsStringAsync, copyAsync) hit the identical
// SecurityException ("Permission Denial ... requires ACTION_OPEN_DOCUMENT
// or related APIs") regardless of which one was used, which rules out
// "wrong API" as the cause. Neither expo-router nor expo-file-system do
// anything to capture that grant at the moment the intent is received.
//
// The fix has to happen natively, synchronously, before JS ever sees
// anything: copy the file's bytes to our own app storage in MainActivity's
// onCreate/onNewIntent (while the transient grant is still valid), then
// rewrite the intent into a plain ACTION_VIEW pointing at a file:// copy.
// This means JS only ever has to handle ONE shape of incoming intent
// (VIEW + file://, already proven to work end-to-end) regardless of
// which of the two ways the CSV actually arrived.
const { withMainActivity } = require("expo/config-plugins");
const { mergeContents } = require("@expo/config-plugins/build/utils/generateCode");

const IMPORTS = `import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import java.io.File`;

const HELPER_FUNCTION = `  @Suppress("DEPRECATION")
  private fun rewriteIncomingContentUri(intent: Intent) {
    val uri: Uri = when (intent.action) {
      Intent.ACTION_VIEW -> intent.data
      Intent.ACTION_SEND -> intent.getParcelableExtra(Intent.EXTRA_STREAM) as? Uri
      else -> null
    } ?: return
    if (uri.scheme != "content") return
    try {
      var displayName = "shared-import-\${System.currentTimeMillis()}.csv"
      contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
        if (cursor.moveToFirst()) {
          val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
          if (nameIndex >= 0) cursor.getString(nameIndex)?.let { displayName = it }
        }
      }
      val localFile = File(cacheDir, displayName)
      contentResolver.openInputStream(uri)?.use { input ->
        localFile.outputStream().use { output -> input.copyTo(output) }
      }
      intent.action = Intent.ACTION_VIEW
      intent.data = Uri.fromFile(localFile)
    } catch (e: Exception) {
      // Leave the original intent in place -- worst case, JS sees the same
      // permission error it did before this fix existed.
    }
  }`;

const ON_NEW_INTENT = `  override fun onNewIntent(intent: Intent) {
    rewriteIncomingContentUri(intent)
    setIntent(intent)
    super.onNewIntent(intent)
  }`;

const OLD_ON_CREATE = `    setTheme(R.style.AppTheme);
    super.onCreate(null)`;
const NEW_ON_CREATE = `    setTheme(R.style.AppTheme);
    rewriteIncomingContentUri(intent)
    super.onCreate(null)`;

module.exports = function withCsvContentUriCopy(config) {
  return withMainActivity(config, (config) => {
    let contents = config.modResults.contents;

    contents = mergeContents({
      src: contents,
      newSrc: IMPORTS,
      tag: "batz-csv-content-uri-imports",
      anchor: /^import android\.os\.Bundle$/m,
      offset: 1,
      comment: "//",
    }).contents;

    contents = mergeContents({
      src: contents,
      newSrc: HELPER_FUNCTION,
      tag: "batz-csv-content-uri-helper",
      anchor: /class MainActivity : ReactActivity\(\) \{/,
      offset: 1,
      comment: "//",
    }).contents;

    contents = mergeContents({
      src: contents,
      newSrc: ON_NEW_INTENT,
      tag: "batz-csv-content-uri-onnewintent",
      anchor: /override fun getMainComponentName\(\): String = "main"/,
      offset: 0,
      comment: "//",
    }).contents;

    if (contents.includes(OLD_ON_CREATE)) {
      contents = contents.replace(OLD_ON_CREATE, NEW_ON_CREATE);
    } else if (!contents.includes("rewriteIncomingContentUri(intent)\n    super.onCreate")) {
      throw new Error(
        "withCsvContentUriCopy: expected onCreate body not found in MainActivity.kt -- " +
          "the Expo template likely changed; update this plugin's OLD_ON_CREATE string to match."
      );
    }

    config.modResults.contents = contents;
    return config;
  });
};
