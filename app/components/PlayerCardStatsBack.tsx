import { useState } from "react";
import { View, Text, Image, StyleSheet, type LayoutChangeEvent } from "react-native";
import { colors } from "../lib/theme";
import type { PlayerSeasonLine } from "../lib/playerRepository";
import type { BattingCounts, CalculatedStats } from "../lib/stats";
import { OutlinedText } from "./PlayerCard";

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

// Team logo, top-left -- kept well inside the white content window (not
// the canvas corner) so it never overlaps the red/dark-red border.
const LOGO_CENTER_X = 220;
const LOGO_CENTER_Y = 230;
const LOGO_DIAMETER = 220;
const NAME_STROKE_W = 4;

// Uniform number, top-right -- mirrors the logo's inset from its edge so
// both stay clear of the red/dark-red border the same amount.
const NUMBER_CENTER_X = CONTENT_RIGHT - (LOGO_CENTER_X - CONTENT_LEFT);
const NUMBER_CENTER_Y = LOGO_CENTER_Y;
const NUMBER_DIAMETER = LOGO_DIAMETER;
const NUMBER_RING_W = 8;

// Name/league/measurables text is centered up top, but must never bleed
// under the logo or number circles -- a long custom league/division/team
// name (e.g. "Orange County Metro Conference" from the free-text league
// field) can otherwise stretch past them since centering alone doesn't
// stop at either circle's edge. Bounded to the horizontal gap between the
// two circles, with a margin so text never touches either one.
const NAME_BLOCK_MARGIN = 40;
const NAME_BLOCK_LEFT = LOGO_CENTER_X + LOGO_DIAMETER / 2 + NAME_BLOCK_MARGIN;
const NAME_BLOCK_RIGHT = NUMBER_CENTER_X - NUMBER_DIAMETER / 2 - NAME_BLOCK_MARGIN;
const NAME_BLOCK_WIDTH = NAME_BLOCK_RIGHT - NAME_BLOCK_LEFT;

// Yr/Season/Team squeezed tighter (Yr is only 2 digits now) to free up
// width for the stat columns.
const BASE_COL_W = [50, 90, 120, 80, 65, 65, 65, 65, 80, 65, 100, 100, 100, 100];
const HEADERS = ["Yr", "Season", "Team", "AB", "H", "2B", "3B", "HR", "RBI", "BB", "AVG", "OBP", "SLG", "OPS"];

function fmt(avg: number): string {
  return avg.toFixed(3).replace(/^0\./, ".");
}

function yy(year: number): string {
  return year ? `'${String(year).slice(-2)}` : "";
}

function seasonRow(label: [string, string, string], counts: BattingCounts, stats: CalculatedStats, locked: boolean): string[] {
  if (locked) {
    return [...label, "*", "*", "*", "*", "*", "*", "*", "*", "*", "*", "*"];
  }
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
  teamLogoUrl,
  uniformNumber,
  locked = false,
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
  uniformNumber?: number | null;
  activity: CardBackActivityLine[];
  teamLogoUrl?: string | null;
  // A locked (coach-fallback, unclaimed) player's stats show as "*" and no
  // activity is shown, same reasoning as everywhere else that gates on
  // is_coach_fallback -- name/team info is already reduced to just the
  // default tag by the caller before this ever gets here.
  locked?: boolean;
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

  const rows = seasons.map((s) => seasonRow([yy(s.year), s.season, s.teamName], s.counts, s.stats, locked));
  const totals = seasonRow(["", "Totals", ""], careerCounts, careerStats, locked);

  const heightText = heightFeet != null ? `${heightFeet}'${heightInches ?? 0}"` : "";
  const measurables = `HT: ${heightText}   |   WT: ${weightLbs != null ? `${weightLbs} lbs` : ""}   |   Bats: ${bats ?? ""}   |   Throws: ${throws ?? ""}`;

  return (
    <View style={styles.wrapper} onLayout={onLayout}>
      <Image source={CARD_FRAME} style={styles.cardBg} resizeMode="contain" />
      {width > 0 && (
        <>
          {/* Top-left: team logo, inset so it stays inside the white area */}
          {teamLogoUrl && (
            <Image
              source={{ uri: teamLogoUrl }}
              resizeMode="contain"
              style={{
                position: "absolute",
                left: (LOGO_CENTER_X - LOGO_DIAMETER / 2) * scale,
                top: (LOGO_CENTER_Y - LOGO_DIAMETER / 2) * scale,
                width: LOGO_DIAMETER * scale,
                height: LOGO_DIAMETER * scale,
              }}
            />
          )}

          {/* Top-right: uniform number in a black-outlined circle, mirroring
              the logo's inset so it stays clear of the red border too --
              the ring itself always shows once there's a number to show or
              hide, blank inside when locked. */}
          {uniformNumber != null && (
            <View
              style={{
                position: "absolute",
                left: (NUMBER_CENTER_X - NUMBER_DIAMETER / 2) * scale,
                top: (NUMBER_CENTER_Y - NUMBER_DIAMETER / 2) * scale,
                width: NUMBER_DIAMETER * scale,
                height: NUMBER_DIAMETER * scale,
                borderRadius: (NUMBER_DIAMETER / 2) * scale,
                borderWidth: NUMBER_RING_W * scale,
                borderColor: "#000",
                backgroundColor: "#fff",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {!locked && (
                <OutlinedText
                  fontSize={NUMBER_DIAMETER * 0.5 * scale}
                  stroke={NAME_STROKE_W * scale}
                  style={{
                    fontFamily: "Anton_400Regular",
                    fontStyle: "normal",
                    fontWeight: "bold",
                  }}
                >
                  {String(uniformNumber)}
                </OutlinedText>
              )}
            </View>
          )}

          {/* Top-middle: name (same first/last fonts as the card front) / league info / measurables --
              bounded to NAME_BLOCK_WIDTH (the gap between the logo and number circles) so long text
              truncates instead of bleeding under either one. */}
          <View style={{ position: "absolute", left: NAME_BLOCK_LEFT * scale, top: (CONTENT_TOP + 8) * scale, width: NAME_BLOCK_WIDTH * scale, alignItems: "center" }}>
            <View style={{ flexDirection: "row", alignItems: "center", maxWidth: "100%" }}>
              <View style={{ flexShrink: 1 }}>
                <OutlinedText
                  fontSize={100 * scale}
                  stroke={NAME_STROKE_W * scale}
                  shrinkToFit
                  // Sized to the actual name (rough Anton-font char-width
                  // estimate) instead of a fixed box -- a fixed width left
                  // a visible gap before the last name for anyone shorter
                  // than the reserved space. Still caps at the same 55% of
                  // NAME_BLOCK_WIDTH so a long first name shrinks instead
                  // of bleeding into the last name/edge.
                  width={Math.min(firstName.length * 100 * scale * 0.62, NAME_BLOCK_WIDTH * 0.55 * scale)}
                  style={{
                    fontFamily: "Anton_400Regular",
                    fontStyle: "italic",
                    fontWeight: "bold",
                    textAlign: "center",
                  }}
                >
                  {firstName.toUpperCase()}
                </OutlinedText>
              </View>
              <Text
                style={{
                  fontFamily: "Montserrat_400Regular",
                  fontSize: 100 * scale,
                  color: colors.textPrimary,
                  marginLeft: 16 * scale,
                  textShadowColor: "rgba(0,0,0,0.55)",
                  textShadowOffset: { width: 2 * scale, height: 2 * scale },
                  textShadowRadius: 1,
                  flexShrink: 1,
                }}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.5}
              >
                {lastName.toUpperCase()}
              </Text>
            </View>
            <Text
              style={{ fontFamily: "Montserrat_600SemiBold", fontSize: 36 * scale, color: colors.textSecondary, marginTop: 10 * scale, maxWidth: "100%", textAlign: "center" }}
              numberOfLines={2}
            >
              {[leagueName, divisionName, teamName, `${season} ${year}`].filter(Boolean).join("  |  ")}
            </Text>
            <Text style={{ fontFamily: "Montserrat_400Regular", fontSize: 32 * scale, color: colors.textSecondary, marginTop: 8 * scale, maxWidth: "100%" }} numberOfLines={1}>
              {measurables}
            </Text>
          </View>

          {/* Middle-middle: season-by-season stat table + totals */}
          <View style={{ position: "absolute", left: TABLE_LEFT * scale, top: TABLE_TOP * scale, width: tableW * scale }}>
            <View style={{ flexDirection: "row", backgroundColor: "#23305a", height: 58 * scale, alignItems: "center" }}>
              {HEADERS.map((h, i) => (
                <Text key={h} style={{ width: colW[i] * scale, textAlign: "center", color: "#fff", fontFamily: "Montserrat_600SemiBold", fontSize: 35 * scale }}>
                  {h}
                </Text>
              ))}
            </View>
            {rows.map((row, ridx) => (
              <View key={ridx} style={{ flexDirection: "row", height: 58 * scale, alignItems: "center", backgroundColor: ridx % 2 === 1 ? "#f4f5f8" : "transparent" }}>
                {row.map((val, i) => (
                  <Text key={i} style={{ width: colW[i] * scale, textAlign: "center", color: colors.textPrimary, fontFamily: "Montserrat_400Regular", fontSize: 35 * scale }}>
                    {val}
                  </Text>
                ))}
              </View>
            ))}
            <View style={{ flexDirection: "row", height: 58 * scale, alignItems: "center", backgroundColor: "#dc1e28" }}>
              {totals.map((val, i) => (
                <Text key={i} style={{ width: colW[i] * scale, textAlign: "center", color: "#fff", fontFamily: "Montserrat_700Bold", fontSize: 35 * scale }}>
                  {val}
                </Text>
              ))}
            </View>
          </View>

          {/* Bottom-left: recent activity, all entries -- omitted entirely for a locked player */}
          {!locked && (
            <View style={{ position: "absolute", left: ACTIVITY_LEFT * scale, top: ACTIVITY_TOP * scale, width: (CONTENT_RIGHT - ACTIVITY_LEFT - 20) * scale }}>
              <Text style={{ fontFamily: "Montserrat_700Bold", fontSize: 50 * scale, color: colors.textPrimary, marginBottom: 12 * scale }}>
                Recent Activity
              </Text>
              {activity.length === 0 && (
                <Text style={{ fontFamily: "Montserrat_400Regular", fontSize: 40 * scale, color: colors.textSecondary }}>None yet</Text>
              )}
              {activity.map((line) => (
                <Text
                  key={line.id}
                  style={{ fontFamily: "Montserrat_400Regular", fontSize: 40 * scale, color: colors.textSecondary, marginBottom: 6 * scale }}
                  numberOfLines={1}
                >
                  {`•  ${line.text}`}
                </Text>
              ))}
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { width: "100%", aspectRatio: CARD_ASPECT_RATIO, overflow: "hidden" },
  cardBg: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%" },
});
