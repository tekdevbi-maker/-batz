import { useState } from "react";
import { Text, Pressable, StyleSheet } from "react-native";
import * as Clipboard from "expo-clipboard";
import { colors } from "../lib/theme";

// Tap-to-copy for the join link shown across every registration/settings
// screen -- selectable text alone doesn't give a one-tap "copy the whole
// thing" affordance, especially on mobile.
export default function CopyableLink({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function handlePress() {
    if (!value) return;
    await Clipboard.setStringAsync(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Pressable onPress={handlePress} style={styles.wrapper}>
      <Text selectable style={styles.code}>{value}</Text>
      <Text style={styles.hint}>{copied ? "Copied!" : "Tap to copy"}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: 12 },
  code: {
    fontFamily: "monospace",
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    padding: 10,
    borderRadius: 6,
    fontSize: 13,
  },
  hint: { fontSize: 12, fontFamily: "Montserrat_400Regular", color: colors.textMuted, marginTop: 4, textAlign: "center" },
});
