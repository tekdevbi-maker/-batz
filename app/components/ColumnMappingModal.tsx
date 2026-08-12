import { useState } from "react";
import { Modal, View, Text, TextInput, Pressable, ScrollView, StyleSheet } from "react-native";
import { colors } from "../lib/theme";
import { extractWithColumnMapping, type ColumnMapping, type ImportedBattingLine } from "../lib/gameChangerImport";

const FIELDS: { key: keyof ColumnMapping; label: string }[] = [
  { key: "jerseyNumber", label: "Jersey #" },
  { key: "lastName", label: "Last Name" },
  { key: "firstName", label: "First Name" },
  { key: "ab", label: "At Bats (AB)" },
  { key: "h", label: "Hits (H)" },
  { key: "singles", label: "Singles (1B)" },
  { key: "doubles", label: "Doubles (2B)" },
  { key: "triples", label: "Triples (3B)" },
  { key: "hr", label: "Home Runs (HR)" },
  { key: "rbi", label: "RBI" },
  { key: "bb", label: "Walks (BB)" },
  { key: "hbp", label: "Hit By Pitch (HBP)" },
  { key: "sf", label: "Sac Flies (SF)" },
];

const PREVIEW_ROW_COUNT = 8;
const COL_WIDTH = 84;

// Shown when a CSV doesn't match the known template -- rather than reject
// it outright, the coach tells us which raw column (and row range) holds
// each of the 13 stats, we extract with that mapping, and show a preview
// before anything is treated as real game data.
export default function ColumnMappingModal({
  visible,
  rows,
  fileName,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  rows: string[][];
  fileName: string | null;
  onCancel: () => void;
  onConfirm: (lines: ImportedBattingLine[]) => void;
}) {
  const maxCols = rows.reduce((max, r) => Math.max(max, r.length), 0);

  const [mapping, setMapping] = useState<Record<keyof ColumnMapping, string>>({
    jerseyNumber: "",
    lastName: "",
    firstName: "",
    ab: "",
    h: "",
    singles: "",
    doubles: "",
    triples: "",
    hr: "",
    rbi: "",
    bb: "",
    hbp: "",
    sf: "",
  });
  const [startRow, setStartRow] = useState("1");
  const [endRow, setEndRow] = useState(String(Math.max(0, rows.length - 1)));
  const [preview, setPreview] = useState<ImportedBattingLine[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setPreview(null);
    setError(null);
  }

  function handlePreview() {
    setError(null);
    setPreview(null);

    const parsedMapping: Partial<Record<keyof ColumnMapping, number>> = {};
    for (const { key, label } of FIELDS) {
      const n = Number.parseInt(mapping[key], 10);
      if (Number.isNaN(n) || n < 0 || n >= maxCols) {
        setError(`"${label}" needs a valid column number (0-${maxCols - 1}).`);
        return;
      }
      parsedMapping[key] = n;
    }
    const start = Number.parseInt(startRow, 10);
    const end = Number.parseInt(endRow, 10);
    if (Number.isNaN(start) || Number.isNaN(end) || start < 0 || end < start) {
      setError("Start Row and End Row need to be valid, with Start ≤ End.");
      return;
    }

    const lines = extractWithColumnMapping(rows, parsedMapping as ColumnMapping, start, end);
    if (lines.length === 0) {
      setError("No players found in that row range -- double check Start Row / End Row.");
      return;
    }
    setPreview(lines);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Map Columns</Text>
          <Text style={styles.hint}>
            {fileName ? `"${fileName}" ` : "This file "}doesn't match a known template. Tell us which
            column (and row) each stat is in, then preview before importing.
          </Text>

          <Text style={styles.sectionLabel}>File Preview</Text>
          <ScrollView horizontal style={styles.previewScroll}>
            <View>
              <View style={styles.previewRow}>
                {Array.from({ length: maxCols }).map((_, c) => (
                  <Text key={c} style={[styles.previewCell, styles.previewHeaderCell]}>
                    Col {c}
                  </Text>
                ))}
              </View>
              <ScrollView style={styles.previewBody}>
                {rows.slice(0, PREVIEW_ROW_COUNT).map((row, r) => (
                  <View key={r} style={styles.previewRow}>
                    {Array.from({ length: maxCols }).map((_, c) => (
                      <Text key={c} style={styles.previewCell} numberOfLines={1}>
                        {row[c] ?? ""}
                      </Text>
                    ))}
                  </View>
                ))}
              </ScrollView>
            </View>
          </ScrollView>

          <ScrollView style={styles.fieldsScroll}>
            <View style={styles.rowFields}>
              <View style={styles.rowField}>
                <Text style={styles.fieldLabel}>Start Row</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={startRow}
                  onChangeText={(t) => { setStartRow(t); reset(); }}
                  keyboardType="number-pad"
                />
              </View>
              <View style={styles.rowField}>
                <Text style={styles.fieldLabel}>End Row</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={endRow}
                  onChangeText={(t) => { setEndRow(t); reset(); }}
                  keyboardType="number-pad"
                />
              </View>
            </View>

            {FIELDS.map(({ key, label }) => (
              <View key={key} style={styles.rowFields}>
                <Text style={styles.fieldLabelWide}>{label}</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={mapping[key]}
                  onChangeText={(t) => { setMapping((m) => ({ ...m, [key]: t })); reset(); }}
                  keyboardType="number-pad"
                  placeholder="Col #"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
            ))}
          </ScrollView>

          {error && <Text style={styles.error}>{error}</Text>}

          {preview && (
            <>
              <Text style={styles.sectionLabel}>Found {preview.length} player{preview.length === 1 ? "" : "s"}</Text>
              <ScrollView style={styles.previewLinesScroll}>
                {preview.map((l, i) => (
                  <Text key={i} style={styles.previewLine} numberOfLines={1}>
                    #{l.jerseyNumber} {l.firstName} {l.lastName} -- AB {l.ab}, H {l.h}, HR {l.hr}, RBI {l.rbi}
                  </Text>
                ))}
              </ScrollView>
            </>
          )}

          <View style={styles.buttonRow}>
            <Pressable style={styles.secondaryButton} onPress={onCancel}>
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={handlePreview}>
              <Text style={styles.secondaryButtonText}>Preview</Text>
            </Pressable>
            <Pressable
              style={[styles.button, !preview && styles.buttonDisabled]}
              disabled={!preview}
              onPress={() => preview && onConfirm(preview)}
            >
              <Text style={styles.buttonText}>Confirm Import</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 16 },
  card: { backgroundColor: colors.surface, borderRadius: 12, padding: 16, gap: 8, width: "100%", maxWidth: 480, maxHeight: "90%" },
  title: { fontSize: 18, fontFamily: "Montserrat_700Bold", color: colors.textPrimary },
  hint: { color: colors.textSecondary, fontSize: 13, fontFamily: "Montserrat_400Regular" },
  sectionLabel: { fontSize: 13, fontFamily: "Montserrat_600SemiBold", color: colors.textPrimary, marginTop: 4 },
  previewScroll: { maxHeight: 140, borderWidth: 1, borderColor: colors.border, borderRadius: 8 },
  previewBody: { maxHeight: 110 },
  previewRow: { flexDirection: "row" },
  previewCell: {
    width: COL_WIDTH,
    fontSize: 11,
    fontFamily: "Montserrat_400Regular",
    color: colors.textPrimary,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  previewHeaderCell: { fontFamily: "Montserrat_600SemiBold", backgroundColor: colors.surfaceAlt },
  fieldsScroll: { maxHeight: 220 },
  rowFields: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4, gap: 8 },
  rowField: { flex: 1 },
  fieldLabel: { fontSize: 13, fontFamily: "Montserrat_600SemiBold", color: colors.textPrimary, marginBottom: 2 },
  fieldLabelWide: { flex: 1, fontSize: 13, fontFamily: "Montserrat_400Regular", color: colors.textPrimary },
  fieldInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    fontSize: 14,
    fontFamily: "Montserrat_400Regular",
    color: colors.textPrimary,
    width: 80,
    textAlign: "center",
  },
  error: { color: colors.error, fontSize: 13, fontFamily: "Montserrat_400Regular" },
  previewLinesScroll: { maxHeight: 120, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 6 },
  previewLine: { fontSize: 12, fontFamily: "Montserrat_400Regular", color: colors.textPrimary, marginBottom: 2 },
  buttonRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  secondaryButton: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 10, alignItems: "center", backgroundColor: colors.surface },
  secondaryButtonText: { color: colors.textPrimary, fontFamily: "Montserrat_600SemiBold", fontSize: 14 },
  button: { flex: 1.3, backgroundColor: colors.accent, borderRadius: 8, paddingVertical: 10, alignItems: "center" },
  buttonDisabled: { backgroundColor: colors.accentDisabled },
  buttonText: { color: "white", fontFamily: "Montserrat_600SemiBold", fontSize: 14 },
});
