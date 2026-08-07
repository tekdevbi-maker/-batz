import { useState } from "react";
import { View, Text, Image, StyleSheet, type LayoutChangeEvent } from "react-native";
import { colors } from "../lib/theme";
import type { PlayerSeasonLine } from "../lib/playerRepository";
import type { BattingCounts, CalculatedStats } from "../lib/stats";

const CARD_FRAME = require("../assets/card_template_back_final.png");
// card_template_back_final.png's own pixel dimensions -- every position
// below was measured against this canvas (see card_back_mockup_teddy_flipse.png).
const CANVAS_W = 1931;
const CANVAS_H = 1440;
const CARD_ASPECT_RATIO = CANVAS_W / CANVAS_H;

const CONTENT_LEFT = 75;
const CONTENT_TOP = 99;
const CONTENT_RIGHT = 1878;
const CENTER_X = (CONTENT_LEFT + CONTENT_RIGHT) / 2;

// Hand-placed, locked-in per iteration on the mockup.
const TABLE_LEFT = 117;
const TABLE_TOP = 500;
const TABLE_MARGIN_RIGHT = 30;
const ACTIVITY_LEFT = 135;
const ACTIVITY_TOP = 1000;

const BASE_COL_W = [90, 110, 150, 70, 60, 60, 60, 60, 70, 60, 90, 90, 90, 90];
const HEADERS = ["Year", "Season", "Team", "AB", "H", "2B", "3B", "HR", "RBI", "BB", "AVG", "OBP", "SLG", "OPS"];

function fmt(avg: number): string {
  return avg.toFixed(3).replace(/^0\./, ".");
}

function seasonRow(label: [string, string, string], counts: BattingCounts, stats: CalculatedStats): string[] {
  return [
    ...label,
    String(counts.ab),
    String(counts.h),
    String(counts.doubles),
    String(counts.triples),
    String(counts.hr),
    String(counts.rbi),
    String(counts.bb),
    fmt(stats.avg),
    fmt(stats.obp),
    fmt(stats.slg),
    fmt(stats.ops),
  ];
}

export interface CardBackActivityLine {
  id: string;
  text: string;
}

// The card's "stats back" face: name/team/measurables up top, a full
// season-by-season stat table with a totals row in the middle (widened to
// the content window's edges), and the player's activity feed bottom-left.
// Position constants above are locked in from card_back_mockup_teddy_flipse.png
// -- change the mockup first, then mirror the numbers here.
export default function PlayerCardStatsBack({
  firstName,
  lastName,
  leagueName,
  divisionName,
  teamName,
  season,
  year,
  heightFeet,
  heightInches,
  weightLbs,
  bats,
  throws,
  seasons,
  careerCounts,
  careerStats,
  activity,
}: {
  firstName: string;
  lastName: string;
  leagueName: string;
  divisionName: string;
  teamName: string;
  season: string;
  year: number;
  heightFeet: number | null;
  heightInches: number | null;
  weightLbs: number | null;
  bats: string | null;
  throws: string | null;
  seasons: PlayerSeasonLine[];
  careerCounts: BattingCounts;
  careerStats: CalculatedStats;
  activity: CardBackActivityLine[];
}) {
  const [width, setWidth] = useState(0);
  const scale = width / CANVAS_W;

  function onLayout(e: LayoutChangeEvent) {
    setWidth(e.nativeEvent.layout.width);
  }

  const tableW = CONTENT_RIGHT - TABLE_MARGIN_RIGHT - TABLE_LEFT;
  const baseTotal = BASE_COL_W.reduce((a, b) => a + b, 0);
  const colW = BASE_COL_W.map((w) => Math.round((w * tableW) / baseTotal));
  colW[colW.length - 1] += tableW - colW.reduce((a, b) => a + b, 0);

  const rows = seasons.map((s) => seasonRow([s.year ? String(s.year) : "", s.season, s.teamName], s.counts, s.stats));
  const totals = seasonRow(["", "Totals", ""], careerCounts, careerStats);

  const heightText = heightFeet != null ? `${heightFeet}'${heightInches ?? 0}"` : "";
  const measurables = `HT: ${heightText}   |   WT: ${weightLbs != null ? `${weightLbs} lbs` : ""}   |   Bats: ${bats ?? ""}   |   Throws: ${throws ?? ""}`;

  return (
    <View style={styles.wrapper} onLayout={onLayout}>
      <Image source={CARD_FRAME} style={styles.cardBg} resizeMode="contain" />
      {width > 0 && (
        <>
          {/* Top-middle: name / league info / measurables */}
          <View style={{ position: "absolute", left: CONTENT_LEFT * scale, top: (CONTENT_TOP + 8) * scale, width: (CONTENT_RIGHT - CONTENT_LEFT) * scale, alignItems: "center" }}>
            <Text style={{ fontFamily: "Montserrat_800ExtraBold", fontSize: 44 * scale, color: colors.textPrimary }} numberOfLines={1}>
              {`${firstName} ${lastName}`.trim().toUpperCase()}
            </Text>
            <Text style={{ fontFamily: "Montserrat_600SemiBold", fontSize: 22 * scale, color: colors.textSecondary, marginTop: 8 * scale }} numberOfLines={1}>
              {[leagueName, divisionName, teamName, `${season} ${year}`].filter(Boolean).join("  |  ")}
            </Text>
            <Text style={{ fontFamily: "Montserrat_400Regular", fontSize: 20 * scale, color: colors.textSecondary, marginTop: 6 * scale }} numberOfLines={1}>
              {measurables}
            </Text>
          </View>

          {/* Middle-middle: season-by-season stat table + totals */}
          <View style={{ position: "absolute", left: TABLE_LEFT * scale, top: TABLE_TOP * scale, width: tableW * scale }}>
            <View style={{ flexDirection: "row", backgroundColor: "#23305a", height: 38 * scale, alignItems: "center" }}>
              {HEADERS.map((h, i) => (
                <Text key={h} style={{ width: colW[i] * scale, textAlign: "center", color: "#fff", fontFamily: "Montserrat_600SemiBold", fontSize: 16 * scale }}>
                  {h}
                </Text>
              ))}
            </View>
            {rows.map((row, ridx) => (
              <View key={ridx} style={{ flexDirection: "row", height: 38 * scale, alignItems: "center", backgroundColor: ridx % 2 === 1 ? "#f4f5f8" : "transparent" }}>
                {row.map((val, i) => (
                  <Text key={i} style={{ width: colW[i] * scale, textAlign: "center", color: colors.textPrimary, fontFamily: "Montserrat_400Regular", fontSize: 16 * scale }}>
                    {val}
                  </Text>
                ))}
              </View>
            ))}
            <View style={{ flexDirection: "row", height: 38 * scale, alignItems: "center", backgroundColor: "#dc1e28" }}>
              {totals.map((val, i) => (
                <Text key={i} style={{ width: colW[i] * scale, textAlign: "center", color: "#fff", fontFamily: "Montserrat_700Bold", fontSize: 16 * scale }}>
                  {val}
                </Text>
              ))}
            </View>
          </View>

          {/* Bottom-left: recent activity, all entries */}
          <View style={{ position: "absolute", left: ACTIVITY_LEFT * scale, top: ACTIVITY_TOP * scale, width: (CONTENT_RIGHT - ACTIVITY_LEFT - 20) * scale }}>
            <Text style={{ fontFamily: "Montserrat_700Bold", fontSize: 20 * scale, color: colors.textPrimary, marginBottom: 6 * scale }}>
              Recent Activity
            </Text>
            {activity.length === 0 && (
              <Text style={{ fontFamily: "Montserrat_400Regular", fontSize: 16 * scale, color: colors.textSecondary }}>None yet</Text>
            )}
            {activity.map((line) => (
              <Text
                key={line.id}
                style={{ fontFamily: "Montserrat_400Regular", fontSize: 16 * scale, color: colors.textSecondary, marginBottom: 3 * scale }}
                numberOfLines={1}
              >
                {`•  ${line.text}`}
              </Text>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { width: "100%", aspectRatio: CARD_ASPECT_RATIO, overflow: "hidden" },
  cardBg: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%" },
});
