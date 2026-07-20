// Fixes the "Open With @Batz" file-open flow (spec Section 3a) on Android:
// when another app (e.g. Files/Downloads) launches an ACTION_VIEW intent
// pointing at a content:// URI, Android only grants OUR app a transient
// read permission for that URI. By the time Expo Router's JS-level
// native-intent routing/navigation runs and our screen tries to actually
// read the file, that grant is gone -- confirmed via real device/emulator
// testing: every expo-file-system read API (the new File class, legacy
// readAsStringAsync, copyAsync) hit the identical SecurityException
// ("Permission Denial ... requires ACTION_OPEN_DOCUMENT or related APIs")
// regardless of which one was used, which rules out "wrong API" as the
// cause. Neither expo-router nor expo-file-system do anything to capture
// that grant at the moment the intent is actually received.
//
// The fix has to happen natively, synchronously, before JS ever sees the
// URL: copy the file's bytes to our own app storage in MainActivity's
// onCreate/onNewIntent (while the transient grant is still valid), then
// rewrite the intent's data to a file:// URI pointing at that copy. JS
// then only ever sees a plain file:// URI, which fetch() already reads
// reliably (the same path DocumentPicker-selected files already use).
const { withMainActivity } = require("expo/config-plugins");
const { mergeContents } = require("@expo/config-plugins/build/utils/generateCode");

const IMPORTS = `import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import java.io.File`;

const HELPER_FUNCTION = `  private fun rewriteIncomingContentUri(intent: Intent) {
    if (intent.action != Intent.ACTION_VIEW) return
    val uri = intent.data ?: return
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
      intent.data = Uri.fromFile(localFile)
    } catch (e: Exception) {
      // Leave the original content:// URI in place -- worst case, JS sees
      // the same permission error it did before this fix existed.
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
