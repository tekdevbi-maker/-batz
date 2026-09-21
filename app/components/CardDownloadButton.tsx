import { useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Modal } from "react-native";
import { captureRef } from "react-native-view-shot";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import { useAuth } from "../lib/AuthContext";
import { supabase } from "../lib/supabase";
import { logGuestFeatureEvent } from "../lib/guestAnalytics";
import { colors } from "../lib/theme";

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

// Shared by both the real (Supabase-backed) player screen and the fully
// local "Create A Player" screen — the capture/PDF logic below took four
// failed attempts to get right (see project memory), so it lives in one
// place rather than being duplicated and risking drift between two copies.
// Each caller just hands over the same front/back card elements it's
// already rendering for its own FlipStatsCard.
export default function CardDownloadButton({
  frontFace,
  backFace,
  fileNamePrefix,
}: {
  frontFace: React.ReactNode;
  backFace: React.ReactNode;
  fileNamePrefix: string;
}) {
  const frontCaptureRef = useRef<View>(null);
  const backCaptureRef = useRef<View>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  // Not useRequireAuth -- this component is also used on the guest/local
  // player screen, which is reachable signed out. Just read whether
  // there's a session, don't redirect on it.
  const { session } = useAuth();

  async function handleDownload() {
    setBusy(true);
    setError(null);
    setModalOpen(true);
    try {
      // The modal needs to actually mount AND get at least one real paint
      // pass before capturing it — two animation-frame waits cover layout
      // commit, and the extra delay gives the (possibly-remote) player
      // photo time to finish decoding so it isn't captured half-loaded.
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      await new Promise((resolve) => setTimeout(resolve, 300));
      if (!frontCaptureRef.current || !backCaptureRef.current) return;
      // Explicit width/height caps the OUTPUT resolution regardless of the
      // device's pixel density — captureRef otherwise captures at full
      // native resolution (e.g. 900px source * 3x density = 2700px), and
      // base64-encoding an image that large produced a string too big to
      // pass through the JS<->Native bridge reliably, silently failing
      // into a totally blank single-page PDF. These are still comfortably
      // print-quality for a 3.5in page (600px / 3.5in ~= 170 DPI).
      const frontUri = await captureRef(frontCaptureRef, { format: "png", quality: 1, width: 600, height: 840 });
      const backUriLandscape = await captureRef(backCaptureRef, { format: "png", quality: 1, width: 840, height: 600 });
      // The on-screen stats-back face is deliberately landscape (wide
      // table), but a printed card needs both faces in the same portrait
      // orientation to line up when cut out — rotate the captured back
      // image 90deg clockwise to match the front.
      const rotatedBack = await ImageManipulator.manipulateAsync(backUriLandscape, [{ rotate: 90 }], {
        format: ImageManipulator.SaveFormat.PNG,
      });
      const backUri = rotatedBack.uri;
      setModalOpen(false);
      const [frontBase64, backBase64] = await Promise.all([
        FileSystem.readAsStringAsync(frontUri, { encoding: FileSystem.EncodingType.Base64 }),
        FileSystem.readAsStringAsync(backUri, { encoding: FileSystem.EncodingType.Base64 }),
      ]);
      // Embed as base64 data URIs, NOT a file:// path — tried file:// first
      // (referencing captureRef's own output path directly) since it seemed
      // lighter-weight, but Android's WebView-based print renderer can't
      // reach the app's private cache directory that way (broken-image
      // icons in the resulting PDF). Base64-embedding what's already a
      // confirmed-working capture is the standard, reliable approach here.
      // Standard US Letter cardstock page (8.5in x 11in = 612pt x 792pt),
      // 9 copies per page in a 3x3 grid at exact 2.5in x 3.5in (180pt x
      // 252pt) each — 3*180=540pt + 2*6pt gaps = 552pt (fits in 612pt),
      // 3*252=756pt + 2*6pt gaps = 768pt (fits in 792pt). One page of 9
      // fronts, one page of 9 backs, for cutting out multiple copies.
      const frontCell = `<img src="data:image/png;base64,${frontBase64}" />`;
      const backCell = `<img src="data:image/png;base64,${backBase64}" />`;
      const html = `
        <html>
          <head>
            <style>
              * { margin: 0; padding: 0; }
              .page {
                width: 612pt; height: 792pt;
                display: grid;
                grid-template-columns: repeat(3, 180pt);
                grid-template-rows: repeat(3, 252pt);
                gap: 6pt;
                align-content: center;
                justify-content: center;
                page-break-after: always;
              }
              /* Fixed physical size (2.5in x 3.5in = 180pt x 252pt) per
                 cell — print-ready means each printed card measures
                 exactly this once cut out, not just "fits its grid cell". */
              .page img { width: 180pt; height: 252pt; display: block; }
            </style>
          </head>
          <body>
            <div class="page">${frontCell.repeat(9)}</div>
            <div class="page">${backCell.repeat(9)}</div>
          </body>
        </html>`;
      const { uri: pdfUri } = await Print.printToFileAsync({ html, width: 612, height: 792, base64: false });
      await Sharing.shareAsync(pdfUri, {
        mimeType: "application/pdf",
        dialogTitle: `${fileNamePrefix} Card`.trim(),
      });
      logGuestFeatureEvent(supabase, "card_pdf_downloaded", !session);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setModalOpen(false);
      setBusy(false);
    }
  }

  return (
    <>
      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable style={styles.downloadButton} disabled={busy} onPress={handleDownload}>
        {busy ? <ActivityIndicator size="small" color="white" /> : <Text style={styles.downloadButtonText}>Download Card (PDF)</Text>}
      </Pressable>

      {/* Genuinely-visible (not clipped/offset/opacity-0'd) copies of both
          card faces — three earlier attempts to hide this (pushed
          off-screen, opacity: 0, and clipped via overflow:hidden) all
          produced BLANK captures on Android. Covered by the opaque
          "Preparing your card..." overlay below, so the user only sees the
          loading state, not raw card art. */}
      <Modal visible={modalOpen} transparent={false} animationType="none">
        <View style={styles.captureModalRoot}>
          <View ref={frontCaptureRef} collapsable={false} style={{ width: 900 }}>
            {frontFace}
          </View>
          <View ref={backCaptureRef} collapsable={false} style={{ width: 1200 }}>
            {backFace}
          </View>
        </View>
        <View style={styles.captureModalCover}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.captureModalText}>Preparing your card...</Text>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  error: { color: colors.error, fontSize: 14, fontFamily: "Montserrat_400Regular" },
  downloadButton: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 12,
  },
  downloadButtonText: { color: "white", fontFamily: "Montserrat_600SemiBold", fontSize: 15 },
  captureModalRoot: { flex: 1, backgroundColor: colors.background },
  captureModalCover: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  captureModalText: { fontFamily: "Montserrat_600SemiBold", fontSize: 15, color: colors.textPrimary },
});
