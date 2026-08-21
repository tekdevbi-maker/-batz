// In-memory state for the DEV-only 11-page registration wizard
// (dev-register*.tsx). Mirrors pendingCoachRegistration's approach --
// module-scoped, never passed through router params -- simpler for an
// 11-screen linear flow than threading params through every push(), and
// keeps the password out of navigation state. This flow IS fully
// functional (real signUp, real league/division/team creation) -- "DEV
// only" refers to how it's reached (a dev-only link), not to whether it
// writes real data.
export type TeamClassification = "recreation" | "competitive" | "high_school" | "college" | "adult_social";

export interface DevWizardState {
  firstName: string;
  lastName: string;
  email: string;
  password: string;

  // True when entered via "Add a Team I Coach" (an already-signed-in
  // coach registering a second, separate team) rather than brand-new
  // account creation -- dev-register-confirm.tsx skips signUp() and uses
  // the existing session instead when this is set.
  skipAccountCreation: boolean;

  // Answer to the COPPA screen's "Will there be any children under the
  // age of 13 on your team?" -- true for "Yes", false for "No" (after
  // certifying COPPA compliance in the popup). Drives whether the
  // "Transfer to Parent" explainer shows later in the completion flow.
  hasPlayersUnder13: boolean | null;

  leagueId: string | null;
  leagueName: string | null;
  isNewLeague: boolean;

  sport: "Baseball" | "Softball" | null;
  classification: TeamClassification | null;
  division: string | null;

  usingDefaultSeason: boolean | null;
  season: "Spring" | "Summer" | "Fall" | "Winter" | null;
  year: number | null;

  teamName: string;

  // Populated once "Complete Registration" actually runs.
  createdTeamId: string | null;
  sameGroupTeams: { id: string; name: string }[];
}

function initialState(): DevWizardState {
  return {
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    skipAccountCreation: false,
    hasPlayersUnder13: null,
    leagueId: null,
    leagueName: null,
    isNewLeague: false,
    sport: null,
    classification: null,
    division: null,
    usingDefaultSeason: null,
    season: null,
    year: null,
    teamName: "",
    createdTeamId: null,
    sameGroupTeams: [],
  };
}

let state: DevWizardState = initialState();

export function getDevWizardState(): DevWizardState {
  return state;
}

export function updateDevWizardState(patch: Partial<DevWizardState>): void {
  state = { ...state, ...patch };
}

export function resetDevWizardState(): void {
  state = initialState();
}
