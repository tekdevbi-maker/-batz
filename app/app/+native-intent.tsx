// Runs before the JS app loads, for any incoming system URL/intent --
// including the OS "Open With @Batz" file-open case (Sprint 9). A file
// opened this way arrives as a raw content:// (Android) or file:// (iOS)
// URI, which isn't one of our own app routes, so route it to a screen
// that can resolve which team to import it into.
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    if (/^(content|file):\/\//i.test(path)) {
      return `/shared-csv?uri=${encodeURIComponent(path)}`;
    }
    return path;
  } catch {
    return "/";
  }
}
