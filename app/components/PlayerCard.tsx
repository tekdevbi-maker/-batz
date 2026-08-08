import { useState } from "react";
import { View, Text, Image, StyleSheet, type LayoutChangeEvent } from "react-native";

const CARD_FRAME = require("../assets/card_template_final.png");
// card_template_final.png's own pixel dimensions -- drives the wrapper's
// aspectRatio so the template never gets stretched/cropped, and is also the
// reference canvas every position/size constant below was measured against.
const CANVAS_W = 1440;
const CANVAS_H = 1930;
const CARD_ASPECT_RATIO = CANVAS_W / CANVAS_H;

// Name banner geometry, in CANVAS_W/CANVAS_H pixels, arrived at by hand
// (see card_composite.png iteration): the red/dark-red banner spans
// y 1603-1877, split into two equal rows, lifted up off strict center.
const BANNER_LEFT = 100;
const BANNER_RIGHT = 1340;
const BANNER_TOP = 1603;
const BANNER_BOTTOM = 1877;
const FIRST_NAME_SIZE = 100; // 2 sizes smaller than the last name
const LAST_NAME_SIZE = 117;
const STROKE_W = 4;

// Explicit, hand-placed centers (canvas px) rather than derived from the
// banner's own geometry -- set directly per feedback on where they should sit.
const FIRST_NAME_CENTER_Y = 1660;
const LAST_NAME_CENTER_Y = 1780;
const BANNER_CENTER_X = (BANNER_LEFT + BANNER_RIGHT) / 2;
const MAX_TEXT_W = BANNER_RIGHT - BANNER_LEFT - 40;

// Layer 4: team logo, locked in from card_composite_with_team_logo.png --
// already a circular, ring-framed PNG from CircleCropModal's own capture,
// so it just needs to be placed, not masked again here.
const TEAM_LOGO_CENTER_X = 1160;
const TEAM_LOGO_CENTER_Y = 1600;
const TEAM_LOGO_DIAMETER = 300;

// Draws bordered white text by stacking the same string 8x, offset by
// `stroke` in each direction in the border color, then once more on top in
// the fill color -- RN's Text has no CSS text-stroke equivalent.
function OutlinedText({
  children,
  fontSize,
  stroke,
  style,
}: {
  children: string;
  fontSize: number;
  stroke: number;
  style?: object;
}) {
  const offsets = [
    [-stroke, -stroke], [0, -stroke], [stroke, -stroke],
    [-stroke, 0], [stroke, 0],
    [-stroke, stroke], [0, stroke], [stroke, stroke],
  ];
  return (
    <View>
      {offsets.map(([dx, dy], i) => (
        <Text
          key={i}
          style={[style, { fontSize, color: "#000", position: "absolute", left: dx, top: dy }]}
          numberOfLines={1}
        >
          {children}
        </Text>
      ))}
      <Text style={[style, { fontSize, color: "#fff", position: "relative" }]} numberOfLines={1}>
        {children}
      </Text>
    </View>
  );
}

// The default baseball-card look for an unlocked player: photo (layer 1),
// the card_template_final frame -- borders, @Batz logo, red name banner all
// baked in (layer 2), and the player's name (layer 3). Used both as the
// Roster screen's per-player thumbnail (non-interactive; the surrounding
// Pressable handles navigation) and as FlipStatsCard's back face.
export default function PlayerCard({
  firstName,
  lastName,
  photoUrl,
  teamLogoUrl,
}: {
  firstName: string;
  lastName: string;
  photoUrl?: string | null;
  teamLogoUrl?: string | null;
}) {
  const [width, setWidth] = useState(0);

  function onLayout(e: LayoutChangeEvent) {
    setWidth(e.nativeEvent.layout.width);
  }

  const scale = width / CANVAS_W;

  return (
    <View style={styles.wrapper} onLayout={onLayout}>
      {/* Layer 1: photo, uploaded by the parent */}
      {photoUrl && <Image source={{ uri: photoUrl }} style={styles.photo} resizeMode="cover" />}
      {/* Layer 2: card frame -- borders, logo, and red banner all baked in */}
      <Image source={CARD_FRAME} style={styles.cardBg} resizeMode="contain" />
      {/* Layer 3: player name, italic bordered first name over a plain last name */}
      {width > 0 && (
        <>
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: 0,
              width,
              top: FIRST_NAME_CENTER_Y * scale - (FIRST_NAME_SIZE * scale) / 2,
              alignItems: "center",
            }}
          >
            <OutlinedText
              fontSize={FIRST_NAME_SIZE * scale}
              stroke={STROKE_W * scale}
              style={{
                fontFamily: "Anton_400Regular",
                // skewX transforms are a web-only no-op on native RN (Fabric
                // silently drops unsupported transform keys), so italics has
                // to come from the actual font style flag -- the OS applies
                // a synthetic oblique slant to Anton (which has no italic
                // face) on both iOS and Android, unlike the transform hack.
                fontStyle: "italic",
                fontWeight: "bold",
                textAlign: "center",
                includeFontPadding: false,
                textAlignVertical: "center",
              }}
            >
              {firstName.toUpperCase()}
            </OutlinedText>
          </View>
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: 0,
              width,
              top: LAST_NAME_CENTER_Y * scale - (LAST_NAME_SIZE * scale) / 2,
              alignItems: "center",
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                fontFamily: "Montserrat_400Regular",
                fontSize: LAST_NAME_SIZE * scale,
                color: "#fff",
                textShadowColor: "rgba(0,0,0,0.55)",
                textShadowOffset: { width: 2 * scale, height: 2 * scale },
                textShadowRadius: 1,
                includeFontPadding: false,
                textAlignVertical: "center",
              }}
            >
              {lastName.toUpperCase()}
            </Text>
          </View>
          {/* Layer 4: team logo, bottom-right, above/right of the first name */}
          {teamLogoUrl && (
            <Image
              source={{ uri: teamLogoUrl }}
              resizeMode="contain"
              style={{
                position: "absolute",
                left: (TEAM_LOGO_CENTER_X - TEAM_LOGO_DIAMETER / 2) * scale,
                top: (TEAM_LOGO_CENTER_Y - TEAM_LOGO_DIAMETER / 2) * scale,
                width: TEAM_LOGO_DIAMETER * scale,
                height: TEAM_LOGO_DIAMETER * scale,
              }}
            />
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { width: "100%", aspectRatio: CARD_ASPECT_RATIO, overflow: "hidden" },
  cardBg: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%" },
  // Full-bleed behind the frame, same as the card_composite.png reference:
  // card_template_final.png has a REAL alpha-transparent photo window (not
  // a baked-in checkerboard graphic like the old card_template_no_logo.png
  // was), so covering the whole canvas and letting the frame mask it is
  // the correct approach -- an inset rectangle here would just misalign
  // with where the frame's window actually is.
  photo: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%" },
});

export { BANNER_CENTER_X, MAX_TEXT_W, OutlinedText };
