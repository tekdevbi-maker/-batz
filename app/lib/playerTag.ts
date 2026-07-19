// Default PlayerTag format (spec Section 4): the fuller field-table
// definition ("Player_[Number]_[Division]_[TeamName]_[Season]_[Year]_[LeagueInitials]"),
// not Section 7's abbreviated example -- Section 7's version omits
// Season/Year, but TeamName alone isn't unique across seasons (the same
// team name can recur as a fresh Team row every Spring/Fall), so dropping
// them would let two different players collide on the same tag.
function sanitize(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, "");
}

export interface PlayerTagInput {
  uniformNumber: number;
  division: string;
  teamName: string;
  season: string;
  year: number;
  leagueInitials: string;
}

export function generateDefaultPlayerTag(input: PlayerTagInput): string {
  return [
    "Player",
    input.uniformNumber,
    sanitize(input.division),
    sanitize(input.teamName),
    input.season,
    input.year,
    sanitize(input.leagueInitials),
  ].join("_");
}
