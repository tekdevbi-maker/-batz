import { useRef, useState } from "react";
import { Animated, Pressable, StyleSheet } from "react-native";

// Cycles through an arbitrary number of faces with a card-flip transition:
// rotate to 90deg (edge-on, effectively invisible without real 3D
// perspective depth), swap which face is mounted, rotate back to 0. Faces
// aren't required to share an aspect ratio -- only one is ever mounted at a
// time, so each is free to size itself (e.g. the stats table's natural
// height, the photo card's portrait ratio, the stats-back card's landscape
// ratio) rather than needing the dual-face backfaceVisibility trick, which
// only supports two faces sharing one fixed container shape.
export default function FlipStatsCard({
  faces,
  flippable = true,
}: {
  faces: React.ReactNode[];
  flippable?: boolean;
}) {
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const [index, setIndex] = useState(0);
  // A ref, not state: onPress can fire twice in the same tick on web, and
  // state updates aren't visible until the next render, so a state-backed
  // busy flag doesn't actually block the second fire -- this does.
  const busyRef = useRef(false);

  function advance() {
    if (!flippable || busyRef.current || faces.length < 2) return;
    busyRef.current = true;
    Animated.timing(rotateAnim, { toValue: 90, duration: 200, useNativeDriver: true }).start(() => {
      setIndex((i) => (i + 1) % faces.length);
      rotateAnim.setValue(-90);
      Animated.timing(rotateAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
        busyRef.current = false;
      });
    });
  }

  const rotateY = rotateAnim.interpolate({ inputRange: [-90, 90], outputRange: ["-90deg", "90deg"] });

  return (
    <Pressable onPress={advance} style={styles.wrapper} disabled={!flippable}>
      <Animated.View style={{ transform: [{ perspective: 800 }, { rotateY }] }}>{faces[index]}</Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: { width: "100%" },
});
