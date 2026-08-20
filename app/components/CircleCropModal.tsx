import { useRef } from "react";
import { Modal, View, Image, Pressable, Text, StyleSheet, ActivityIndicator } from "react-native";
import ViewShot from "react-native-view-shot";
import { colors } from "../lib/theme";

const RING = require("../assets/team_logo_template.png");
// team_logo_template.png's own canvas + the transparent interior hole it's
// drawn around (measured by hand -- see team_logo_preview.png): everything
// outside this hole is either the ring's black/white stroke or already
// transparent, but the corners need their own circular clip too or the
// photo bleeds past the ring into the square's corners (the template's own
// transparent corners aren't a mask by themselves).
const TEMPLATE_W = 486;
const TEMPLATE_H = 484;
const HOLE_CX = 242.5;
const HOLE_CY = 241.5;
const HOLE_R = 223;

const PREVIEW_W = 260;
const PREVIEW_H = (TEMPLATE_H / TEMPLATE_W) * PREVIEW_W;
const SCALE = PREVIEW_W / TEMPLATE_W;

// Renders the picked (square-cropped) photo circularly clipped to the
// template's hole, with the ring frame on top, then uses
// react-native-view-shot to snapshot that composited view into a real PNG
// -- expo-image-manipulator alone can't mask to a circle or bake in a
// frame graphic, only crop/resize/rotate rectangles.
export default function CircleCropModal({
  visible,
  imageUri,
  busy,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  imageUri: string | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (uri: string) => void;
}) {
  const shotRef = useRef<React.ElementRef<typeof ViewShot>>(null);

  async function handleUsePhoto() {
    if (!shotRef.current?.capture) return;
    const uri = await shotRef.current.capture();
    onConfirm(uri);
  }

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Crop Team Logo</Text>
          <Text style={styles.hint}>Only what's inside the circle will be used.</Text>

          {/* Backdrop sits behind (not inside) the ViewShot -- a white or
              light photo would otherwise blend invisibly into the card's
              own near-white background with nothing to show the crop
              circle's edge. Kept out of the captured subtree so it never
              bakes into the uploaded PNG's transparency. */}
          <View style={styles.shotBackdrop}>
            <ViewShot ref={shotRef} options={{ format: "png", quality: 1, result: "tmpfile" }} style={styles.shotWrapper}>
              {imageUri && (
                <Image
                  source={{ uri: imageUri }}
                  style={{
                    position: "absolute",
                    left: (HOLE_CX - HOLE_R) * SCALE,
                    top: (HOLE_CY - HOLE_R) * SCALE,
                    width: HOLE_R * 2 * SCALE,
                    height: HOLE_R * 2 * SCALE,
                    borderRadius: HOLE_R * SCALE,
                  }}
                  resizeMode="cover"
                />
              )}
              <Image
                source={RING}
                style={{ position: "absolute", top: 0, left: 0, width: PREVIEW_W, height: PREVIEW_H }}
                resizeMode="stretch"
              />
            </ViewShot>
          </View>

          <View style={styles.buttonRow}>
            <Pressable style={styles.secondaryButton} onPress={onCancel} disabled={busy}>
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </Pressable>
            <Pressable style={[styles.button, busy && styles.buttonDisabled]} onPress={handleUsePhoto} disabled={busy}>
              {busy ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Use Photo</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: 24 },
  card: { backgroundColor: colors.surface, borderRadius: 16, padding: 20, alignItems: "center", width: "100%", maxWidth: 380 },
  title: { fontSize: 18, fontFamily: "Montserrat_700Bold", color: colors.textPrimary, marginBottom: 4 },
  hint: { fontSize: 13, fontFamily: "Montserrat_400Regular", color: colors.textSecondary, marginBottom: 16, textAlign: "center" },
  // No background set (stays transparent) so the captured PNG keeps
  // alpha=0 in the corners rather than flattening to an opaque backdrop.
  // Mid-gray, deliberately distinct from both a typical white/light photo
  // and the card's own near-white background -- see the comment above the
  // ViewShot for why this lives on a separate wrapper.
  shotBackdrop: { width: PREVIEW_W, height: PREVIEW_H, backgroundColor: "#8a8f99", borderRadius: 8 },
  shotWrapper: { width: PREVIEW_W, height: PREVIEW_H },
  buttonRow: { flexDirection: "row", gap: 12, marginTop: 20 },
  button: { backgroundColor: colors.accent, borderRadius: 8, paddingVertical: 12, paddingHorizontal: 24, alignItems: "center" },
  buttonDisabled: { backgroundColor: colors.accentDisabled },
  buttonText: { color: "white", fontFamily: "Montserrat_600SemiBold", fontSize: 16 },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: "center",
    backgroundColor: colors.surface,
  },
  secondaryButtonText: { color: colors.textPrimary, fontFamily: "Montserrat_600SemiBold", fontSize: 16 },
});
