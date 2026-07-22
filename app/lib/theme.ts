// The app's single fixed light theme -- not a light/dark toggle. Every
// screen's StyleSheet should pull colors from here instead of hardcoding
// hex values, so the palette only ever needs to change in one place.
//
// Built around the @Batz logo (assets/wordmark-full.png): white card/mark
// background, royal blue "@Batz" outline, red "Batz" lettering. `background`
// is a clean white so the logo's own white background blends directly into
// the app chrome. `accent` is the logo's royal blue, used for the
// header/nav chrome and primary actions. `error`/`danger` are pulled from
// the logo's red lettering family rather than a generic red.
export const colors = {
  background: "#ffffff",
  surface: "#f4f6fb",
  surfaceAlt: "#e8edf9",
  border: "#d7dfef",
  textPrimary: "#12224a",
  textSecondary: "#4c5b7d",
  textMuted: "#8993ac",
  accent: "#1d4ed8",
  accentMuted: "#dbe6fb",
  accentDisabled: "#aac0ee",
  error: "#d92d20",
  errorBg: "#fbe9e7",
  success: "#16a34a",
  warningText: "#b45309",
  warningBg: "#fdf1d6",
  danger: "#d92d20",
} as const;
