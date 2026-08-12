import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  Modal,
  Animated,
} from "react-native";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import * as LegacyFileSystem from "expo-file-system/legacy";
import * as DocumentPicker from "expo-document-picker";
import * as Sharing from "expo-sharing";
import * as XLSX from "xlsx";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { useRequireAuth } from "../lib/AuthContext";
import { supabase } from "../lib/supabase";
import {
  parseGameChangerBattingCsv,
  parseRawCsvRows,
  parseTemplateCsv,
  TEMPLATE_HEADERS,
  GameChangerFormatError,
  type ImportedBattingLine,
} from "../lib/gameChangerImport";
import { hashParsedImport } from "../lib/fileHash";
import ColumnMappingModal from "../components/ColumnMappingModal";
import { MLB_TEAMS } from "../lib/mlbTeams";
import { formatDateDisplay, parseLocalIsoDate, toLocalIsoDate, todayIso } from "../lib/dateFormat";
import { colors } from "../lib/theme";
import {
  deleteGame,
  findDuplicateFileImport,
  findGamesOnDate,
  getDivisionOpponents,
  getLastGameForTeam,
  importGame,
  listRecentGames,
  type ExistingGameSummary,
} from "../lib/gamesRepository";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Supabase/PostgREST errors are plain objects with a `.message`, not
// `instanceof Error` -- String(err) on those gives "[object Object]".
function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

export default function ImportGameScreen() {
  const { session } = useRequireAuth();
  const { teamId, incomingFileUri } = useLocalSearchParams<{ teamId: string; incomingFileUri?: string }>();
  const router = useRouter();

  // Even when a file arrives via the OS "Open With" share flow, the coach
  // still needs to confirm the game's date/number/opponent -- always start
  // on step 1; loadFile's own useEffect below loads the shared file in the
  // background regardless of which step is showing, so it's ready by the
  // time they reach step 2.
  const [step, setStep] = useState<1 | 2>(1);

  const [gameDate, setGameDate] = useState(todayIso());
  const [showIosDatePicker, setShowIosDatePicker] = useState(false);
  const [gameNumber, setGameNumber] = useState("1");
  const [opponent, setOpponent] = useState("");
  const [showOpponentSuggestions, setShowOpponentSuggestions] = useState(false);

  const [lastGame, setLastGame] = useState<ExistingGameSummary | null>(null);
  const [divisionOpponents, setDivisionOpponents] = useState<Array<{ id: string; name: string }>>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [parsedLines, setParsedLines] = useState<ImportedBattingLine[] | null>(null);
  const [fileHash, setFileHash] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [mappingRows, setMappingRows] = useState<string[][] | null>(null);
  const [activeOptionPopup, setActiveOptionPopup] = useState<"export" | "upload" | "manual" | null>(null);
  const [duplicateFileWarning, setDuplicateFileWarning] = useState<ExistingGameSummary | null>(null);
  const [sameDateGames, setSameDateGames] = useState<ExistingGameSummary[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Pulses the Import Game button while there's a parsed file ready to go,
  // so it draws the eye once "Ready to import..." shows up above it.
  const importButtonOpacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (parsedLines && !submitting && !submitSuccess) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(importButtonOpacity, { toValue: 0.4, duration: 650, useNativeDriver: true }),
          Animated.timing(importButtonOpacity, { toValue: 1, duration: 650, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
    importButtonOpacity.setValue(1);
  }, [parsedLines, submitting, submitSuccess, importButtonOpacity]);

  const [recentGames, setRecentGames] = useState<ExistingGameSummary[]>([]);
  const [deletingGameId, setDeletingGameId] = useState<string | null>(null);

  const refreshTeamData = useCallback(() => {
    if (!teamId) return;
    getLastGameForTeam(supabase, teamId).then((game) => {
      setLastGame(game);
      setGameNumber(String((game?.gameNumber ?? 0) + 1));
    }).catch((err) => setLoadError(errorMessage(err)));
    getDivisionOpponents(supabase, teamId)
      .then(setDivisionOpponents)
      .catch((err) => setLoadError(errorMessage(err)));
    listRecentGames(supabase, teamId)
      .then(setRecentGames)
      .catch((err) => setLoadError(errorMessage(err)));
  }, [teamId]);

  useEffect(() => {
    refreshTeamData();
  }, [refreshTeamData]);

  function confirmDeleteGame(game: ExistingGameSummary) {
    Alert.alert(
      "Delete this game?",
      `Game #${game.gameNumber}${game.opponent ? ` vs ${game.opponent}` : ""} on ${game.gameDate}. This can't be undone -- re-import from GameChanger if needed.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeletingGameId(game.id);
            try {
              await deleteGame(supabase, game.id);
              refreshTeamData();
            } catch (err) {
              setLoadError(errorMessage(err));
            } finally {
              setDeletingGameId(null);
            }
          },
        },
      ]
    );
  }

  useEffect(() => {
    if (!teamId || !gameDate) return;
    findGamesOnDate(supabase, teamId, gameDate)
      .then(setSameDateGames)
      .catch(() => {});
  }, [teamId, gameDate]);

  // Android's picker is a self-dismissing native dialog (imperative API,
  // per the library's own recommendation); iOS renders inline via the
  // <DateTimePicker> component below, toggled by showIosDatePicker.
  function openDatePicker() {
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: parseLocalIsoDate(gameDate),
        mode: "date",
        onChange: (event, selectedDate) => {
          if (event.type === "set" && selectedDate) {
            setGameDate(toLocalIsoDate(selectedDate));
          }
        },
      });
    } else {
      setShowIosDatePicker(true);
    }
  }

  // Shared by both the direct-parse success path and the manual-mapping
  // confirm path -- hashes the extracted lines (not raw bytes, so
  // incidental re-export formatting differences don't defeat duplicate
  // detection) and checks for a prior import before treating them as real.
  async function finalizeLines(lines: ImportedBattingLine[], name: string) {
    const hash = hashParsedImport(name, lines);
    if (teamId) {
      const duplicate = await findDuplicateFileImport(supabase, teamId, hash);
      if (duplicate) {
        setDuplicateFileWarning(duplicate);
        return;
      }
    }
    setParsedLines(lines);
    setFileHash(hash);
  }

  async function loadFile(uri: string, name: string) {
    setFileName(name);
    setParseError(null);
    setDuplicateFileWarning(null);
    setParsedLines(null);
    setFileHash(null);
    setMappingRows(null);
    setSubmitSuccess(false);
    setSubmitError(null);

    const extension = (name.split(".").pop() ?? "").toLowerCase();
    const isSpreadsheet = extension === "xlsx" || extension === "xls" || extension === "xlsm";

    let text: string;
    try {
      if (isSpreadsheet) {
        // Excel/Numbers/Sheets exports: read as base64 (binary formats,
        // not text) and let SheetJS decode + convert the first sheet to
        // CSV -- everything downstream (GameChanger/template/manual
        // mapping) only ever needs to know how to read CSV text.
        let base64: string;
        try {
          base64 = await LegacyFileSystem.readAsStringAsync(uri, { encoding: LegacyFileSystem.EncodingType.Base64 });
        } catch {
          const localUri = `${LegacyFileSystem.cacheDirectory}shared-import-${Date.now()}.${extension}`;
          await LegacyFileSystem.copyAsync({ from: uri, to: localUri });
          base64 = await LegacyFileSystem.readAsStringAsync(localUri, { encoding: LegacyFileSystem.EncodingType.Base64 });
        }
        const workbook = XLSX.read(base64, { type: "base64" });
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) throw new Error("This spreadsheet doesn't have any sheets.");
        text = XLSX.utils.sheet_to_csv(workbook.Sheets[firstSheetName]);
      } else {
        // fetch() is the proven-reliable path (works on web and for plain
        // file:// URIs) -- fall back to a copy-then-read for content://
        // URIs from an incoming "Open with" intent. Ruled out via real
        // device/emulator testing, in order:
        // the new File class (web: "this.validatePath is not a function";
        // Android: SecurityException reading an externally-granted
        // content:// URI, since File is scoped to app-owned files) and
        // legacy readAsStringAsync called directly on a content:// URI
        // ("Unsupported scheme" -- per Expo's own docs, readAsStringAsync
        // does NOT support content:// on Android, only copyAsync does,
        // specifically documented for "content shared by other apps").
        try {
          text = await (await fetch(uri)).text();
        } catch {
          const localUri = `${LegacyFileSystem.cacheDirectory}shared-import-${Date.now()}.csv`;
          await LegacyFileSystem.copyAsync({ from: uri, to: localUri });
          text = await LegacyFileSystem.readAsStringAsync(localUri);
        }
      }
    } catch (err) {
      setParseError(errorMessage(err));
      return;
    }

    try {
      const lines = parseGameChangerBattingCsv(text);
      await finalizeLines(lines, name);
    } catch (err) {
      // Doesn't match the known template -- try the @Batz blank-template
      // fast path (exact header match, no manual mapping needed) before
      // falling back to letting the coach map columns by hand.
      if (err instanceof GameChangerFormatError) {
        try {
          const templateLines = parseTemplateCsv(text);
          if (templateLines) {
            await finalizeLines(templateLines, name);
          } else {
            setMappingRows(parseRawCsvRows(text));
          }
        } catch (rawErr) {
          setParseError(errorMessage(rawErr));
        }
      } else {
        setParseError(errorMessage(err));
      }
    }
  }

  async function handleMappingConfirm(lines: ImportedBattingLine[]) {
    setMappingRows(null);
    await finalizeLines(lines, fileName ?? "Imported file");
  }

  async function handleUploadFromPhone() {
    const result = await DocumentPicker.getDocumentAsync({
      type: [
        "text/csv",
        "text/comma-separated-values",
        "application/csv",
        "text/plain",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
        "application/vnd.ms-excel", // .xls
        "*/*",
      ],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets[0]) return;
    await loadFile(result.assets[0].uri, result.assets[0].name);
  }

  async function handleDownloadTemplate() {
    try {
      const worksheet = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Stats");
      const base64 = XLSX.write(workbook, { type: "base64", bookType: "xlsx" });

      // Filesystem-safe: strip anything but letters/digits from the
      // opponent name so an "&"/"/" etc. in it can't break the path.
      const datePart = gameDate.replace(/-/g, "");
      const opponentPart = opponent.trim().replace(/[^a-zA-Z0-9]+/g, "_") || "Opponent";
      const fileName = `batz_${datePart}_Game_${gameNumber}_${opponentPart}.xlsx`;
      const mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

      if (Platform.OS === "android") {
        // expo-sharing's ACTION_SEND sheet is for handing the file to
        // another *app*, not saving locally -- whether a "Save to
        // device"/"My Files" entry shows up there is inconsistent across
        // phones. The Storage Access Framework's directory picker is the
        // real "Save As" flow: the coach picks a folder once and the file
        // is written straight into it, no other app involved.
        const permission = await LegacyFileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (!permission.granted) return;
        const fileUri = await LegacyFileSystem.StorageAccessFramework.createFileAsync(
          permission.directoryUri,
          fileName.replace(/\.xlsx$/, ""),
          mimeType
        );
        await LegacyFileSystem.writeAsStringAsync(fileUri, base64, { encoding: LegacyFileSystem.EncodingType.Base64 });
      } else {
        // iOS's share sheet already includes a built-in "Save to Files"
        // action, so the generic share flow is the right "Save As" here.
        const path = `${LegacyFileSystem.cacheDirectory}${fileName}`;
        await LegacyFileSystem.writeAsStringAsync(path, base64, { encoding: LegacyFileSystem.EncodingType.Base64 });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(path, { mimeType, dialogTitle: "Save the @Batz stats template" });
        }
      }
    } catch (err) {
      setParseError(errorMessage(err));
    }
  }

  // Arrived here from the OS "Open With @Batz" file-open flow (via
  // /shared-csv) -- auto-run the same load/parse path a manual pick would.
  useEffect(() => {
    if (!incomingFileUri) return;
    const name = decodeURIComponent(incomingFileUri).split(/[/\\]/).pop() || "Shared file";
    loadFile(incomingFileUri, name);
    // Only ever fire once per incoming URI, not on every teamId refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingFileUri]);

  const canProceedStep1 = gameDate.length === 10 && gameNumber.length > 0 && opponent.trim().length > 0;

  const canSubmit =
    !!teamId &&
    !!parsedLines &&
    !!fileHash &&
    !duplicateFileWarning &&
    !submitting &&
    gameDate.length === 10 &&
    gameNumber.length > 0 &&
    opponent.trim().length > 0;

  const opponentSuggestions = (() => {
    const query = opponent.trim().toLowerCase();
    if (!query) return [];
    const names = [
      ...divisionOpponents.map((team) => team.name),
      ...MLB_TEAMS.filter((team) => !divisionOpponents.some((d) => d.name === team)),
    ];
    return names.filter((name) => name.toLowerCase().includes(query) && name !== opponent).slice(0, 8);
  })();

  async function handleSubmit() {
    if (!teamId || !parsedLines || !fileHash || !session) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await importGame(supabase, {
        teamId,
        gameDate,
        gameNumber: Number.parseInt(gameNumber, 10),
        opponent: opponent.trim() || null,
        fileHash,
        lines: parsedLines,
      });
      setSubmitSuccess(true);
      refreshTeamData();
    } catch (err) {
      setSubmitError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const OPTION_POPUPS = {
    export: {
      title: "Export directly from your stat tracking app",
      message: `Choose the @Batz app to share or open with. Follow prompts and Import Game`,
      confirmLabel: "OK",
      onConfirm: () => setActiveOptionPopup(null),
    },
    upload: {
      title: "Upload from your phone",
      message:
        `Choose a CSV or Excel (.xlsx/.xls) file already saved on your phone. For Google Sheets, ` +
        `download it as .xlsx or .csv first, then upload it here.`,
      confirmLabel: "Continue",
      onConfirm: () => {
        setActiveOptionPopup(null);
        handleUploadFromPhone();
      },
    },
    manual: {
      title: "Manual",
      message:
        `Download the blank Excel file below that includes the columns needed for import. Fill it out, ` +
        `save it, then use the "Upload from your phone" option above.`,
      confirmLabel: "Download .xlsx file",
      onConfirm: () => {
        setActiveOptionPopup(null);
        handleDownloadTemplate();
      },
    },
  } as const;

  if (!session) return null;

  if (!teamId) {
    return (
      <View style={styles.screen}>
        <View style={styles.container}>
          <Text style={styles.plainText}>No team selected.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      {loadError && (
        <Text style={styles.error}>
          Couldn't load team data: {loadError}
          {"\n"}(Expected until Sprint 3's auth/RLS policies are in place.)
        </Text>
      )}

      {step === 1 && (
        <>
          <Text style={styles.stepHeading}>Let's gather some basic info for the game</Text>

          <View style={styles.row}>
            <View style={styles.rowField}>
              <Text style={styles.label}>Date</Text>
              <Pressable style={styles.input} onPress={openDatePicker}>
                <Text style={styles.inputText}>{formatDateDisplay(gameDate)}</Text>
              </Pressable>
            </View>
            <View style={styles.rowField}>
              <Text style={styles.label}>Game Number</Text>
              <TextInput
                style={styles.input}
                value={gameNumber}
                onChangeText={setGameNumber}
                keyboardType="number-pad"
              />
            </View>
          </View>
          {Platform.OS === "ios" && showIosDatePicker && (
            <DateTimePicker
              value={parseLocalIsoDate(gameDate)}
              mode="date"
              display="inline"
              onChange={(event, selectedDate) => {
                if (event.type === "set" && selectedDate) {
                  setGameDate(toLocalIsoDate(selectedDate));
                }
                setShowIosDatePicker(false);
              }}
            />
          )}
          {lastGame && (
            <Text style={styles.hint}>
              Last game recorded was Game #{lastGame.gameNumber}
              {lastGame.opponent ? ` against ${lastGame.opponent}` : ""} on {formatDateDisplay(lastGame.gameDate)}
            </Text>
          )}

          {sameDateGames.length > 0 && (
            <Text style={styles.warning}>
              A game already exists on {gameDate} for this team (Game #{sameDateGames[0].gameNumber}
              {sameDateGames[0].opponent ? ` vs ${sameDateGames[0].opponent}` : ""}). If this is a
              doubleheader, continue below -- otherwise double check the date.
            </Text>
          )}

          <Text style={styles.label}>Opponent</Text>
          <TextInput
            style={styles.input}
            value={opponent}
            onChangeText={(text) => {
              setOpponent(text);
              setShowOpponentSuggestions(true);
            }}
            onFocus={() => setShowOpponentSuggestions(true)}
            onBlur={() => setTimeout(() => setShowOpponentSuggestions(false), 150)}
            placeholder="Enter opponent name"
            placeholderTextColor={colors.textSecondary}
          />
          {showOpponentSuggestions && opponentSuggestions.length > 0 && (
            <View style={styles.suggestionList}>
              {opponentSuggestions.map((name) => (
                <Pressable
                  key={name}
                  style={styles.suggestionRow}
                  onPress={() => {
                    setOpponent(name);
                    setShowOpponentSuggestions(false);
                  }}
                >
                  <Text style={styles.suggestionText}>{name}</Text>
                </Pressable>
              ))}
            </View>
          )}

          <View style={styles.navRow}>
            <Pressable style={[styles.secondaryButton, styles.navButton]} onPress={() => router.back()}>
              <Text style={styles.secondaryButtonText}>Back</Text>
            </Pressable>
            <Pressable
              style={[styles.button, styles.navButton, !canProceedStep1 && styles.buttonDisabled]}
              disabled={!canProceedStep1}
              onPress={() => setStep(2)}
            >
              <Text style={styles.buttonText}>Next</Text>
            </Pressable>
          </View>
        </>
      )}

      {step === 2 && (
        <>
          <Pressable style={styles.secondaryButton} onPress={() => setStep(1)}>
            <Text style={styles.secondaryButtonText}>Back</Text>
          </Pressable>

          <Text style={styles.label}>Stats CSV</Text>
          <Text style={styles.hint}>There are 3 ways to bring in your game stats:</Text>

          <Pressable style={styles.importOption} onPress={() => setActiveOptionPopup("export")}>
            <Text style={styles.importOptionTitle}>1. Export directly from your stat tracking app</Text>
          </Pressable>

          <Pressable style={styles.importOption} onPress={() => setActiveOptionPopup("upload")}>
            <Text style={styles.importOptionTitle}>2. Upload from your phone</Text>
          </Pressable>

          <Pressable style={styles.importOption} onPress={() => setActiveOptionPopup("manual")}>
            <Text style={styles.importOptionTitle}>3. Manual</Text>
          </Pressable>


          {parsedLines && (
            <Text style={styles.success}>
              Ready to import {parsedLines.length} hitter{parsedLines.length === 1 ? "" : "s"} for Game{" "}
              {gameNumber} against {opponent} on {formatDateDisplay(gameDate)}
            </Text>
          )}

          {duplicateFileWarning && (
            <Text style={styles.error}>
              This exact file was already imported as Game #{duplicateFileWarning.gameNumber} on{" "}
              {duplicateFileWarning.gameDate}. Choose a different file.
            </Text>
          )}
          {parseError && (
            <>
              <Text style={styles.error}>{parseError}</Text>
              <Text style={styles.hint}>
                If you are experiencing technical issues importing, please reach out to us using the "Need Help?" link.
              </Text>
            </>
          )}

          {submitError && (
            <>
              <Text style={styles.error}>{submitError}</Text>
              <Text style={styles.hint}>
                If you are experiencing technical issues importing, please reach out to us using the "Need Help?" link.
              </Text>
            </>
          )}
          {submitSuccess && <Text style={styles.success}>Game imported.</Text>}

          <AnimatedPressable
            style={[styles.button, !canSubmit && styles.buttonDisabled, { opacity: importButtonOpacity }]}
            disabled={!canSubmit}
            onPress={handleSubmit}
          >
            {submitting ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Import Game</Text>}
          </AnimatedPressable>

          {submitSuccess && (
            <Pressable style={styles.secondaryButton} onPress={() => router.back()}>
              <Text style={styles.secondaryButtonText}>Done</Text>
            </Pressable>
          )}

          {recentGames.length > 0 && (
            <>
              <Text style={styles.label}>Recent Games</Text>
              {recentGames.map((game) => (
                <View key={game.id} style={styles.gameRow}>
                  <Text style={styles.gameRowText}>
                    Game #{game.gameNumber}
                    {game.opponent ? ` vs ${game.opponent}` : ""} | {formatDateDisplay(game.gameDate)}
                  </Text>
                  <Pressable
                    style={styles.deleteButton}
                    disabled={deletingGameId === game.id}
                    onPress={() => confirmDeleteGame(game)}
                  >
                    {deletingGameId === game.id ? (
                      <ActivityIndicator size="small" color={colors.error} />
                    ) : (
                      <Text style={styles.deleteButtonText}>Delete</Text>
                    )}
                  </Pressable>
                </View>
              ))}
            </>
          )}
        </>
      )}

      <ColumnMappingModal
        visible={mappingRows !== null}
        rows={mappingRows ?? []}
        fileName={fileName}
        onCancel={() => setMappingRows(null)}
        onConfirm={handleMappingConfirm}
      />

      <Modal
        visible={activeOptionPopup !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setActiveOptionPopup(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setActiveOptionPopup(null)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            {activeOptionPopup && (
              <>
                <Text style={styles.modalTitle}>{OPTION_POPUPS[activeOptionPopup].title}</Text>
                <Text style={styles.modalMessage}>{OPTION_POPUPS[activeOptionPopup].message}</Text>
                <Pressable style={styles.button} onPress={OPTION_POPUPS[activeOptionPopup].onConfirm}>
                  <Text style={styles.buttonText}>{OPTION_POPUPS[activeOptionPopup].confirmLabel}</Text>
                </Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
      </ScrollView>

      <View style={styles.needHelpBar}>
        <Link href="/customer-care"><Text style={styles.legalLink}>Need Help?</Text></Link>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: 20, gap: 8 },
  plainText: { color: colors.textPrimary, fontFamily: "Montserrat_400Regular" },
  label: { fontSize: 15, fontFamily: "Montserrat_600SemiBold", marginTop: 12, color: colors.textPrimary },
  importOption: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    backgroundColor: colors.surface,
  },
  importOptionTitle: { fontSize: 15, fontFamily: "Montserrat_600SemiBold", color: colors.textPrimary },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: { backgroundColor: colors.surface, borderRadius: 12, padding: 20, gap: 16, width: "100%", maxWidth: 420 },
  modalTitle: { fontSize: 19, fontFamily: "Montserrat_700Bold", color: colors.textPrimary },
  modalMessage: { fontSize: 18, fontFamily: "Montserrat_400Regular", color: colors.textPrimary, lineHeight: 26 },
  stepHeading: { fontSize: 18, fontFamily: "Montserrat_700Bold", color: colors.textPrimary, marginBottom: 4 },
  row: { flexDirection: "row", gap: 12 },
  rowField: { flex: 1 },
  navRow: { flexDirection: "row", gap: 12, marginTop: 20 },
  navButton: { flex: 1, marginTop: 0 },
  hint: { color: colors.textSecondary, fontSize: 14, fontFamily: "Montserrat_400Regular" },
  warning: { color: colors.warningText, backgroundColor: colors.warningBg, padding: 8, borderRadius: 6, fontSize: 14, fontFamily: "Montserrat_400Regular" },
  error: { color: colors.error, fontSize: 14, fontFamily: "Montserrat_400Regular" },
  success: { color: colors.success, fontSize: 15, fontFamily: "Montserrat_600SemiBold" },
  legalLink: { color: colors.accent, fontFamily: "Montserrat_400Regular" },
  needHelpBar: { padding: 20, alignItems: "center" },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 10,
    fontSize: 18, fontFamily: "Montserrat_400Regular",
    backgroundColor: colors.surface,
  },
  inputText: { color: colors.textPrimary, fontFamily: "Montserrat_400Regular" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  chipSelected: { backgroundColor: colors.accentMuted, borderColor: colors.accent },
  chipText: { color: colors.textPrimary, fontFamily: "Montserrat_400Regular" },
  suggestionList: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.surface,
    marginTop: -4,
  },
  suggestionRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  suggestionText: { color: colors.textPrimary, fontSize: 15, fontFamily: "Montserrat_400Regular" },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
    backgroundColor: colors.surface,
  },
  secondaryButtonText: { color: colors.textPrimary, fontFamily: "Montserrat_400Regular" },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    marginTop: 12,
  },
  buttonDisabled: { backgroundColor: colors.accentDisabled },
  buttonText: { color: colors.textPrimary, fontFamily: "Montserrat_600SemiBold", fontSize: 18 },
  gameRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  gameRowText: { fontSize: 15, fontFamily: "Montserrat_400Regular", color: colors.textPrimary },
  deleteButton: {
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  deleteButtonText: { color: colors.danger, fontSize: 14, fontFamily: "Montserrat_600SemiBold" },
});
