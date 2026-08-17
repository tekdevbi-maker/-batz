// In-memory state for the live-scoring flow (live-score-setup.tsx ->
// live-score.tsx). Module-scoped like devRegistrationWizard.ts -- simpler
// than threading a whole lineup + at-bat log through router params, and
// nothing here needs to survive an app restart (an abandoned live-scored
// game is just re-entered from scratch, same as never having started).
export type AtBatOutcome = "1B" | "2B" | "3B" | "HR" | "BB" | "HBP" | "SF" | "OUT";

export interface LineupPlayer {
  rosterEntryId: string;
  uniformNumber: number;
  firstName: string;
  lastName: string;
}

export interface AtBatEntry {
  rosterEntryId: string;
  outcome: AtBatOutcome;
  rbi: number;
}

export interface LiveScoreState {
  teamId: string | null;
  teamName: string;
  lineup: LineupPlayer[];
  atBats: AtBatEntry[];
  // Index into `lineup` for whoever bats next.
  nextBatterIndex: number;
}

function initialState(): LiveScoreState {
  return {
    teamId: null,
    teamName: "",
    lineup: [],
    atBats: [],
    nextBatterIndex: 0,
  };
}

let state: LiveScoreState = initialState();

export function getLiveScoreState(): LiveScoreState {
  return state;
}

export function updateLiveScoreState(patch: Partial<LiveScoreState>): void {
  state = { ...state, ...patch };
}

export function recordAtBat(entry: AtBatEntry): void {
  state = {
    ...state,
    atBats: [...state.atBats, entry],
    nextBatterIndex: (state.nextBatterIndex + 1) % Math.max(state.lineup.length, 1),
  };
}

// Undo only ever pops the most recent at-bat -- correction is only
// available before "End Game" per the design, no arbitrary edit-in-place.
export function undoLastAtBat(): void {
  if (state.atBats.length === 0) return;
  const atBats = state.atBats.slice(0, -1);
  const lineupLength = Math.max(state.lineup.length, 1);
  state = {
    ...state,
    atBats,
    nextBatterIndex: (state.nextBatterIndex - 1 + lineupLength) % lineupLength,
  };
}

export function resetLiveScoreState(): void {
  state = initialState();
}
