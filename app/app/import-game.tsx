import { useCallback, useEffect, useState } from "react";
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
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as LegacyFileSystem from "expo-file-system/legacy";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { useRequireAuth } from "../lib/AuthContext";
import { supabase } from "../lib/supabase";
import { parseGameChangerBattingCsv, type ImportedBattingLine } from "../lib/gameChangerImport";
import { hashParsedImport } from "../lib/fileHash";
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
  const [duplicateFileWarning, setDuplicateFileWarning] = useState<ExistingGameSummary | null>(null);
  const [sameDateGames, setSameDateGames] = useState<ExistingGameSummary[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

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

  async function loadFile(uri: string, name: string) {
    setFileName(name);
    setParseError(null);
    setDuplicateFileWarning(null);
    setParsedLines(null);
    setFileHash(null);
    setSubmitSuccess(false);
    setSubmitError(null);

    try {
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
      let text: string;
      try {
        text = await (await fetch(uri)).text();
      } catch {
        const localUri = `${LegacyFileSystem.cacheDirectory}shared-import-${Date.now()}.csv`;
        await LegacyFileSystem.copyAsync({ from: uri, to: localUri });
        text = await LegacyFileSystem.readAsStringAsync(localUri);
      }

      const lines = parseGameChangerBattingCsv(text);

      // Duplicate check: hash the filename plus every parsed non-blank
      // cell, so a re-export with only incidental formatting differences
      // still gets caught, unlike a raw byte-for-byte hash.
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
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      {loadError && (
        <Text style={styles.error}>
          Couldn't load team data: {loadError}
          {"\n"}(Expected until Sprint 3's auth/RLS policies are in place.)
        </Text>
      )}

      <Text style={styles.label}>Date</Text>
      <Pressable style={styles.input} onPress={openDatePicker}>
        <Text style={styles.inputText}>{formatDateDisplay(gameDate)}</Text>
      </Pressable>
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

      <Text style={styles.label}>Game Number</Text>
      {lastGame && (
        <Text style={styles.hint}>
          Last game recorded was Game #{lastGame.gameNumber}
          {lastGame.opponent ? ` against ${lastGame.opponent}` : ""} on {lastGame.gameDate}
        </Text>
      )}
      <TextInput
        style={styles.input}
        value={gameNumber}
        onChangeText={setGameNumber}
        keyboardType="number-pad"
      />

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

      <Text style={styles.label}>GameChanger CSV</Text>
      {/*
        No manual file-picker here by design: a coach choosing an
        arbitrary local file could hand-edit stats in a spreadsheet app
        before "importing" it, undermining the app's core
        fairness/auditability mission (spec Section 7's founding
        rationale). The only sanctioned path is exporting directly from
        GameChanger and sharing straight to @Batz (the "Open With"/Share
        intent handling), which this screen only ever receives via
        incomingFileUri below.
      */}
      {fileName ? (
        <Text style={styles.hint}>File: {fileName}</Text>
      ) : (
        <Text style={styles.hint}>
          Waiting for a file -- export stats from the GameChanger app, then use its Share/Export
          menu to send the CSV directly to @Batz.
        </Text>
      )}

      {duplicateFileWarning && (
        <Text style={styles.error}>
          This exact file was already imported as Game #{duplicateFileWarning.gameNumber} on{" "}
          {duplicateFileWarning.gameDate}. Choose a different file.
        </Text>
      )}
      {parseError && <Text style={styles.error}>{parseError}</Text>}
      {parsedLines && (
        <Text style={styles.hint}>
          Parsed {parsedLines.length} batting lines from {fileName}.
        </Text>
      )}

      {submitError && <Text style={styles.error}>{submitError}</Text>}
      {submitSuccess && <Text style={styles.success}>Game imported.</Text>}

      <Pressable
        style={[styles.button, !canSubmit && styles.buttonDisabled]}
        disabled={!canSubmit}
        onPress={handleSubmit}
      >
        {submitting ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Import Game</Text>}
      </Pressable>

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
                {game.opponent ? ` vs ${game.opponent}` : ""} -- {game.gameDate}
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: 20, gap: 8 },
  plainText: { color: colors.textPrimary },
  label: { fontSize: 15, fontWeight: "600", marginTop: 12, color: colors.textPrimary },
  hint: { color: colors.textSecondary, fontSize: 14 },
  warning: { color: colors.warningText, backgroundColor: colors.warningBg, padding: 8, borderRadius: 6, fontSize: 14 },
  error: { color: colors.error, fontSize: 14 },
  success: { color: colors.success, fontSize: 15, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 10,
    fontSize: 18,
    backgroundColor: colors.surface,
  },
  inputText: { color: colors.textPrimary },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  chipSelected: { backgroundColor: colors.accentMuted, borderColor: colors.accent },
  chipText: { color: colors.textPrimary },
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
  suggestionText: { color: colors.textPrimary, fontSize: 15 },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
    backgroundColor: colors.surface,
  },
  secondaryButtonText: { color: colors.textPrimary },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    marginTop: 12,
  },
  buttonDisabled: { backgroundColor: colors.accentDisabled },
  buttonText: { color: colors.textPrimary, fontWeight: "600", fontSize: 18 },
  gameRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  gameRowText: { fontSize: 15, color: colors.textPrimary },
  deleteButton: {
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  deleteButtonText: { color: colors.danger, fontSize: 14, fontWeight: "600" },
});
