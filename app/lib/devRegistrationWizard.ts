// In-memory state for the DEV-only 11-page registration wizard
// (dev-register*.tsx). Mirrors pendingCoachRegistration's approach --
// module-scoped, never passed through router params -- simpler for an
// 11-screen linear flow than threading params through every push(), and
// keeps the password out of navigation state. This flow IS fully
// functional (real signUp, real league/division/team creation) -- "DEV
// only" refers to how it's reached (a dev-only link), not to whether it
// writes real data.
export interface DevWizardState {
  firstName: string;
  lastName: string;
  email: string;
  password: string;

  leagueId: string | null;
  leagueName: string | null;
  isNewLeague: boolean;

  sport: "Baseball" | "Softball" | null;
  competesRecBall: boolean | null;
  division: string | null;

  usingDefaultSeason: boolean | null;
  season: "Spring" | "Summer" | "Fall" | "Winter" | null;
  year: number | null;
  isHistorical: boolean;

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
    leagueId: null,
    leagueName: null,
    isNewLeague: false,
    sport: null,
    competesRecBall: null,
    division: null,
    usingDefaultSeason: null,
    season: null,
    year: null,
    isHistorical: false,
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
