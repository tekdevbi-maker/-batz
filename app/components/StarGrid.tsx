import { View, Text, StyleSheet } from "react-native";

// Renders a star tier (0-5) as a 2x2 block (filling top-left, top-right,
// bottom-left, bottom-right for stars 1-4) with the 5th star centered on
// top of the block, rather than a plain horizontal row of "⭐" characters.
const STAR = "⭐";
const CELL = 13;
const GAP = 1;
const SIZE = CELL * 2 + GAP;

const POSITIONS = [
  { top: 0, left: 0 },
  { top: 0, left: CELL + GAP },
  { top: CELL + GAP, left: 0 },
  { top: CELL + GAP, left: CELL + GAP },
];

export default function StarGrid({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <View style={styles.wrap}>
      {POSITIONS.slice(0, Math.min(count, 4)).map((pos, i) => (
        <Text key={i} style={[styles.star, pos]}>
          {STAR}
        </Text>
      ))}
      {count >= 5 && <Text style={[styles.star, styles.center]}>{STAR}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: SIZE, height: SIZE },
  star: { position: "absolute", fontSize: CELL, lineHeight: CELL },
  center: { top: (CELL + GAP) / 2 - 1, left: (CELL + GAP) / 2 - 1 },
});
