// The app's single fixed dark theme -- not a light/dark toggle, per the
// user's explicit preference for the whole app to be dark. Every screen's
// StyleSheet should pull colors from here instead of hardcoding hex
// values, so the palette only ever needs to change in one place.
export const colors = {
  background: "#0f1115",
  surface: "#1a1d23",
  surfaceAlt: "#20242c",
  border: "#2a2e37",
  textPrimary: "#e5e7eb",
  textSecondary: "#9aa1ac",
  textMuted: "#6b7280",
  accent: "#3b82f6",
  accentMuted: "#1e3a5f",
  accentDisabled: "#2b3b57",
  error: "#f87171",
  errorBg: "#3a1d1d",
  success: "#4ade80",
  warningText: "#fbbf24",
  warningBg: "#3a2f10",
  danger: "#f87171",
} as const;
