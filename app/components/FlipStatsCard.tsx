import { useRef, useState } from "react";
import { Animated, Pressable, StyleSheet } from "react-native";
import PlayerCard from "./PlayerCard";

// Matches PlayerCard's own canvas ratio (card_template_final.png) so the
// flip wrapper's aspectRatio lines up with the card it's showing.
const CARD_ASPECT_RATIO = 1440 / 1930;

// Tap-to-flip container for the Current Season stats box: front is
// whatever's passed as `frontContent` (the existing stats table), back is
// the default player card (see PlayerCard.tsx). Only unlocked players get a
// back face -- a locked (unclaimed) player has no real name/photo to show,
// same reasoning as the "*" stat-hiding elsewhere on this screen, so
// `flippable=false` just disables the tap instead of building an
// alias-only card back.
export default function FlipStatsCard({
  frontContent,
  firstName,
  lastName,
  photoUrl,
  flippable = true,
}: {
  frontContent: React.ReactNode;
  firstName: string;
  lastName: string;
  photoUrl?: string | null;
  flippable?: boolean;
}) {
  const flipAnim = useRef(new Animated.Value(0)).current;
  const [flipped, setFlipped] = useState(false);

  function toggleFlip() {
    if (!flippable) return;
    Animated.timing(flipAnim, {
      toValue: flipped ? 0 : 180,
      duration: 450,
      useNativeDriver: true,
    }).start();
    setFlipped((v) => !v);
  }

  const frontRotate = flipAnim.interpolate({ inputRange: [0, 180], outputRange: ["0deg", "180deg"] });
  const backRotate = flipAnim.interpolate({ inputRange: [0, 180], outputRange: ["180deg", "360deg"] });

  return (
    <Pressable onPress={toggleFlip} style={styles.wrapper} disabled={!flippable}>
      <Animated.View style={[styles.face, { transform: [{ rotateY: frontRotate }] }]}>
        {frontContent}
      </Animated.View>

      {flippable && (
        <Animated.View style={[styles.face, styles.back, { transform: [{ rotateY: backRotate }] }]}>
          <PlayerCard firstName={firstName} lastName={lastName} photoUrl={photoUrl} />
        </Animated.View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: { width: "100%", aspectRatio: CARD_ASPECT_RATIO },
  face: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backfaceVisibility: "hidden",
  },
  back: { alignItems: "center", justifyContent: "center" },
});
