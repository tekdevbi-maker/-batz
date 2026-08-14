import { useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, Modal, type NativeSyntheticEvent, type NativeScrollEvent } from "react-native";
import { colors } from "../lib/theme";

export function verificationNoticeText(playerNames: string): string {
  return (
    "Important Profile Verification Notice\n\n" +
    "By selecting Agree below, you represent, warrant, and affirm that you are either:\n\n" +
    "1. The Player associated with this profile and are at least thirteen (13) years of age; or\n" +
    `2. The Parent or Legal Guardian of the player, ${playerNames}, hereby providing verifiable consent for ` +
    "this minor's profile.\n\n" +
    "As the verified Player or Parent/Legal Guardian, you are granted full administrative access to manage and " +
    "modify this profile's settings, privacy configurations, and data. You retain the right to unlink this " +
    "profile at any time, which will immediately restrict public access and return the profile to a locked " +
    "state managed solely under the Head Coach's team account.\n\n" +
    "Data Collection & Privacy Consent: By proceeding, you explicitly authorize the collection, processing, " +
    "and public or team-wide display of the player's name, performance statistics, and associated athletic " +
    "data within this application.\n\n" +
    "What We Collect: the player's name, uniform number, hitting statistics, and photo (optional). These may " +
    "always be adjusted in the player's Settings. On the next screen, you will choose how this information is " +
    "displayed -- Public (any signed-in user), Private (this player's own team only), or Only Me (hidden from " +
    "everyone but you, though the player's card remains visible).\n\n" +
    "Data Retention: for transparency, any player profile that is never claimed by a parent is permanently " +
    "anonymized once its team's season is marked complete by the coach. The player's name, photo, and " +
    "uniform number are deleted outright, and only an anonymous, non-attributable team total is kept. " +
    "Once you agree below, this profile is no longer subject to that process while you remain its " +
    "Parent/Legal Guardian.\n\n" +
    "Your Rights: you may unlink this profile at any time (see above), edit or remove any information you've " +
    "entered from Player Settings, or delete your @Batz account entirely from User Settings, which removes " +
    "your personal account data."
  );
}

// Shared "Important Profile Verification Notice" popup -- Agree stays
// disabled until the notice has been scrolled to its end, and confirming
// is the single entry point for parent_attested_at consent, whether it's
// reached from the "newly assigned" Home banner (notifications.tsx) or a
// Head Coach unlocking their own kid's fallback profile
// (player/[playerId]/index.tsx's "Unlock this Player" button). Both
// callers hand off to the player-onboarding wizard on success.
export default function VerificationNoticeModal({
  visible,
  playerNames,
  busy,
  error,
  onBack,
  onAgree,
  backLabel = "Back",
}: {
  visible: boolean;
  playerNames: string;
  busy: boolean;
  error: string | null;
  onBack: () => void;
  onAgree: () => void;
  backLabel?: string;
}) {
  // Agree stays disabled until the notice has been scrolled to its end --
  // both from actually scrolling there and from the content already
  // fitting on screen with nothing to scroll (short text shouldn't block).
  const [scrolledToEnd, setScrolledToEnd] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);

  // A generous tolerance -- iOS rubber-banding and rounding on the way
  // down can leave the reported offset a handful of px short of the true
  // bottom even when the user visibly hit the end. Checked on onScroll AND
  // on drag/momentum end, since throttled onScroll doesn't always fire a
  // final frame exactly at rest.
  function handleScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    if (contentOffset.y + layoutMeasurement.height >= contentSize.height - 32) {
      setScrolledToEnd(true);
    }
  }

  // Content that already fits inside the visible viewport has nothing to
  // scroll to -- don't leave Agree permanently disabled in that case.
  function checkFits(nextViewportHeight: number, nextContentHeight: number) {
    if (nextViewportHeight > 0 && nextContentHeight > 0 && nextContentHeight <= nextViewportHeight) {
      setScrolledToEnd(true);
    }
  }

  function handleShow() {
    setScrolledToEnd(false);
    setViewportHeight(0);
    setContentHeight(0);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onShow={handleShow} onRequestClose={onBack}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <ScrollView
            style={styles.modalScroll}
            onScroll={handleScroll}
            onScrollEndDrag={handleScroll}
            onMomentumScrollEnd={handleScroll}
            scrollEventThrottle={16}
            onLayout={(e) => {
              const height = e.nativeEvent.layout.height;
              setViewportHeight(height);
              checkFits(height, contentHeight);
            }}
            onContentSizeChange={(_w, height) => {
              setContentHeight(height);
              checkFits(viewportHeight, height);
            }}
          >
            <Text style={styles.modalText}>{verificationNoticeText(playerNames)}</Text>
          </ScrollView>
          {!scrolledToEnd && <Text style={styles.hint}>Scroll to the bottom to continue.</Text>}
          {error && <Text style={styles.error}>{error}</Text>}
          <View style={styles.modalButtonRow}>
            <Pressable style={styles.modalBack} disabled={busy} onPress={onBack}>
              <Text style={styles.modalBackText}>{backLabel}</Text>
            </Pressable>
            <Pressable
              style={[styles.modalAgree, !scrolledToEnd && styles.modalAgreeDisabled]}
              disabled={busy || !scrolledToEnd}
              onPress={onAgree}
            >
              <Text style={styles.modalAgreeText}>{busy ? "Please wait…" : "Agree"}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  hint: { color: colors.textSecondary, fontFamily: "Montserrat_400Regular" },
  error: { color: colors.error, fontSize: 14, fontFamily: "Montserrat_400Regular" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: { backgroundColor: colors.surface, borderRadius: 12, padding: 20, gap: 12, width: "100%", maxWidth: 420, maxHeight: "80%" },
  modalScroll: { flexGrow: 0 },
  modalText: { color: colors.textPrimary, fontSize: 15, fontFamily: "Montserrat_400Regular", lineHeight: 21 },
  modalButtonRow: { flexDirection: "row", gap: 12, justifyContent: "flex-end" },
  modalBack: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: colors.surface,
  },
  modalBackText: { color: colors.textPrimary, fontFamily: "Montserrat_600SemiBold" },
  modalAgree: { backgroundColor: colors.accent, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16 },
  modalAgreeDisabled: { backgroundColor: colors.accentDisabled },
  modalAgreeText: { color: "white", fontFamily: "Montserrat_600SemiBold" },
});
