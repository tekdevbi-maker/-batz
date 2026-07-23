import { View, Text, StyleSheet } from "react-native";
import type { BattingCounts, CalculatedStats } from "../lib/stats";
import { colors } from "../lib/theme";

function fmt(avg: number): string {
  return avg.toFixed(3).replace(/^0\./, ".");
}

// Replaces the old dash-separated inline stat lines ("AB 2 -- H 0 -- AVG
// .000 -- ...") everywhere they appeared -- Career Profile's career/
// per-season totals and the Box Score -- with a proper two-column layout:
// counting stats on the left, rate stats on the right.
export default function StatColumns({
  counts,
  stats,
  hideZero = false,
}: {
  counts: BattingCounts;
  stats: CalculatedStats;
  hideZero?: boolean;
}) {
  const countRows = [
    { label: "AB", value: counts.ab, text: String(counts.ab) },
    { label: "Hits", value: counts.h, text: String(counts.h) },
    { label: "2B", value: counts.doubles, text: String(counts.doubles) },
    { label: "3B", value: counts.triples, text: String(counts.triples) },
    { label: "HR", value: counts.hr, text: String(counts.hr) },
    { label: "RBI", value: counts.rbi, text: String(counts.rbi) },
    { label: "BB", value: counts.bb, text: String(counts.bb) },
  ].filter((row) => !hideZero || row.value > 0);

  const rateRows = [
    { label: "AVG", value: stats.avg, text: fmt(stats.avg) },
    { label: "OBP", value: stats.obp, text: fmt(stats.obp) },
    { label: "SLG", value: stats.slg, text: fmt(stats.slg) },
    { label: "OPS", value: stats.ops, text: fmt(stats.ops) },
  ].filter((row) => !hideZero || row.value > 0);

  return (
    <View style={styles.row}>
      <View style={styles.col}>
        {countRows.map((row) => (
          <View key={row.label} style={styles.line}>
            <Text style={styles.label}>{row.label}</Text>
            <Text style={styles.value}>: {row.text}</Text>
          </View>
        ))}
      </View>
      <View style={styles.col}>
        {rateRows.map((row) => (
          <View key={row.label} style={styles.line}>
            <Text style={styles.label}>{row.label}</Text>
            <Text style={styles.value}>: {row.text}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 28, marginTop: 4 },
  col: { gap: 2 },
  line: { flexDirection: "row" },
  label: { width: 44, fontSize: 14, color: colors.textSecondary, textAlign: "right" },
  value: { fontSize: 14, color: colors.textSecondary },
});
