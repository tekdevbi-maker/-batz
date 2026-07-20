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
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as LegacyFileSystem from "expo-file-system/legacy";
import { useRequireAuth } from "../lib/AuthContext";
import { supabase } from "../lib/supabase";
import { parseGameChangerBattingCsv, type ImportedBattingLine } from "../lib/gameChangerImport";
import { hashFileContents } from "../lib/fileHash";
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

type TimeOfDay = "Morning" | "Afternoon" | "Night";
const TIME_OPTIONS: TimeOfDay[] = ["Morning", "Afternoon", "Night"];

// Supabase/PostgREST errors are plain objects with a `.message`, not
// `instanceof Error` -- String(err) on those gives "[object Object]".
function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function ImportGameScreen() {
  const { session } = useRequireAuth();
  const { teamId, incomingFileUri } = useLocalSearchParams<{ teamId: string; incomingFileUri?: string }>();
  const router = useRouter();

  const [gameDate, setGameDate] = useState(todayIso());
  const [gameNumber, setGameNumber] = useState("1");
  const [opponent, setOpponent] = useState("");
  const [customOpponent, setCustomOpponent] = useState(false);
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>("Afternoon");

  const [lastGame, setLastGame] = useState<ExistingGameSummary | null>(null);
  const [divisionOpponents, setDivisionOpponents] = useState<Array<{ id: string; name: string }>>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [fileText, setFileText] = useState<string | null>(null);
  const [parsedLines, setParsedLines] = useState<ImportedBattingLine[] | null>(null);
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

  async function loadFile(uri: string, name: string) {
    setFileName(name);
    setParseError(null);
    setDuplicateFileWarning(null);
    setParsedLines(null);
    setSubmitSuccess(false);
    setSubmitError(null);

    try {
      // fetch() is the proven-reliable path (works on web and for the
      // file:// URIs DocumentPicker normally returns) -- fall back to a
      // copy-then-read for content:// URIs from an incoming "Open with"
      // intent. Ruled out via real device/emulator testing, in order:
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
      setFileText(text);

      // Layer 1 duplicate check (spec Section 3a): byte-for-byte, before parsing.
      const fileHash = hashFileContents(text);
      if (teamId) {
        const duplicate = await findDuplicateFileImport(supabase, teamId, fileHash);
        if (duplicate) {
          setDuplicateFileWarning(duplicate);
          return;
        }
      }

      const lines = parseGameChangerBattingCsv(text);
      setParsedLines(lines);
    } catch (err) {
      setParseError(errorMessage(err));
    }
  }

  async function pickFile() {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["text/csv", "text/comma-separated-values", "application/vnd.ms-excel", "text/plain"],
      copyToCacheDirectory: true,
    });
    if (result.canceled || result.assets.length === 0) return;

    const asset = result.assets[0];
    await loadFile(asset.uri, asset.name);
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
    !!fileText &&
    !!parsedLines &&
    !duplicateFileWarning &&
    !submitting &&
    gameDate.length === 10 &&
    gameNumber.length > 0 &&
    (customOpponent ? opponent.trim().length > 0 : opponent.length > 0);

  async function handleSubmit() {
    if (!teamId || !fileText || !parsedLines) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await importGame(supabase, {
        teamId,
        gameDate,
        gameNumber: Number.parseInt(gameNumber, 10),
        opponent: opponent.trim() || null,
        timeOfDay,
        fileHash: hashFileContents(fileText),
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
      <View style={styles.container}>
        <Text>No team selected.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {loadError && (
        <Text style={styles.error}>
          Couldn't load team data: {loadError}
          {"\n"}(Expected until Sprint 3's auth/RLS policies are in place.)
        </Text>
      )}

      <Text style={styles.label}>Date</Text>
      <TextInput
        style={styles.input}
        value={gameDate}
        onChangeText={setGameDate}
        placeholder="YYYY-MM-DD"
      />

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
      <View style={styles.chipRow}>
        {divisionOpponents.map((team) => (
          <Pressable
            key={team.id}
            style={[styles.chip, opponent === team.name && !customOpponent && styles.chipSelected]}
            onPress={() => {
              setOpponent(team.name);
              setCustomOpponent(false);
            }}
          >
            <Text>{team.name}</Text>
          </Pressable>
        ))}
        <Pressable
          style={[styles.chip, customOpponent && styles.chipSelected]}
          onPress={() => {
            setCustomOpponent(true);
            setOpponent("");
          }}
        >
          <Text>Other...</Text>
        </Pressable>
      </View>
      {customOpponent && (
        <TextInput
          style={styles.input}
          value={opponent}
          onChangeText={setOpponent}
          placeholder="Opponent name"
        />
      )}

      <Text style={styles.label}>Time of Day</Text>
      <View style={styles.chipRow}>
        {TIME_OPTIONS.map((option) => (
          <Pressable
            key={option}
            style={[styles.chip, timeOfDay === option && styles.chipSelected]}
            onPress={() => setTimeOfDay(option)}
          >
            <Text>{option}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>GameChanger CSV</Text>
      <Pressable style={styles.secondaryButton} onPress={pickFile}>
        <Text>{fileName ?? "Choose file..."}</Text>
      </Pressable>

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
          <Text>Done</Text>
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
                  <ActivityIndicator size="small" color="#b91c1c" />
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
  container: { padding: 20, gap: 8 },
  label: { fontSize: 14, fontWeight: "600", marginTop: 12 },
  hint: { color: "#555", fontSize: 13 },
  warning: { color: "#92400e", backgroundColor: "#fef3c7", padding: 8, borderRadius: 6, fontSize: 13 },
  error: { color: "#b91c1c", fontSize: 13 },
  success: { color: "#15803d", fontSize: 14, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  chipSelected: { backgroundColor: "#dbeafe", borderColor: "#1d4ed8" },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
  },
  button: {
    backgroundColor: "#1d4ed8",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    marginTop: 12,
  },
  buttonDisabled: { backgroundColor: "#93b4ec" },
  buttonText: { color: "white", fontWeight: "600", fontSize: 16 },
  gameRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  gameRowText: { fontSize: 14 },
  deleteButton: {
    borderWidth: 1,
    borderColor: "#b91c1c",
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  deleteButtonText: { color: "#b91c1c", fontSize: 13, fontWeight: "600" },
});
