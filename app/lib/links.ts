// Real https:// team join links (replaces the old raw batz:// custom-scheme
// link, which only worked when tapped from inside something that already
// recognized the scheme and did nothing if @Batz wasn't installed). This
// domain hosts a small redirect page (see /join-web in the repo root) that
// attempts the batz:// deep link and falls back to store links if the app
// isn't installed.
export function buildTeamJoinLink(teamId: string): string {
  return `https://batz.brain-spell.com/join/${teamId}`;
}
