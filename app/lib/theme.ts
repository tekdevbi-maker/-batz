// The app's single fixed dark theme -- not a light/dark toggle, per the
// user's explicit preference for the whole app to be dark. Every screen's
// StyleSheet should pull colors from here instead of hardcoding hex
// values, so the palette only ever needs to change in one place.
//
// Built around the @Batz logo (assets/logo-source.png): royal blue
// background, white "@" mark, red "Bats" lettering. `surface` is the
// logo's own sampled background blue (#153474) exactly, used for the
// header/nav chrome and cards so the app's UI reads as a direct extension
// of the logo. `background` is a darker derivative of that same blue
// (rather than a neutral black) for comfortable extended screen use.
// `error`/`danger` are pulled from the logo's red lettering family rather
// than a generic red, while staying distinct enough from `accent` to
// still read clearly as an alert color.
export const colors = {
  background: "#0b1c40",
  surface: "#153474",
  surfaceAlt: "#1e4590",
  border: "#2f4f8f",
  textPrimary: "#f5f7fa",
  textSecondary: "#aab8d6",
  textMuted: "#7382a8",
  accent: "#4c82e0",
  accentMuted: "#1e3d7a",
  accentDisabled: "#2c3f66",
  error: "#e2584f",
  errorBg: "#3a1a1a",
  success: "#4ade80",
  warningText: "#fbbf24",
  warningBg: "#3a2f10",
  danger: "#e2584f",
} as const;
