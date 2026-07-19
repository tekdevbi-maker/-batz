/**
 * Sprint 7 verification: calls the real importGame() (app/lib/gamesRepository.ts)
 * across two sequential games designed to cross a star-tier threshold, and
 * confirms activity_feed_item rows are created with the right category/tier
 * -- and NOT re-created for a game that doesn't cross a new threshold.
 * Also verifies the block-prevents-follow RLS enforcement with real
 * authenticated sessions (not service role).
 * Run: npx tsx scripts/verify-milestones.ts
 * Requires SUPABASE_SERVICE_ROLE_KEY, EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY.
 */
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { importGame } from "../lib/gamesRepository";
import { hashFileContents } from "../lib/fileHash";
import { followPlayer } from "../lib/socialRepository";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !serviceKey || !anonKey) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY / EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY");
  process.exit(1);
}

const admin = createClient(url, serviceKey);
const PASSWORD = "sprint7-verify-password";
const EMAILS = { coach: "s7coach@example.com", parent: "s7parent@example.com", blocked: "s7blocked@example.com" };

async function makeUser(email: string) {
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  return data.user.id;
}

async function signIn(email: string) {
  const c = createClient(url!, anonKey!, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return c;
}

const created = { leagueId: "", userIds: [] as string[] };

async function cleanup() {
  if (created.leagueId) {
    const { error } = await admin.from("league").delete().eq("id", created.leagueId);
    if (error) console.error("CLEANUP league failed:", error);
  }
  for (const id of created.userIds) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) console.error("CLEANUP user failed:", id, error);
  }
}

async function main() {
  const coachId = await makeUser(EMAILS.coach);
  const parentId = await makeUser(EMAILS.parent);
  const blockedId = await makeUser(EMAILS.blocked);
  created.userIds.push(coachId, parentId, blockedId);

  const { data: league } = await admin
    .from("league")
    .insert({ name: "__s7_league__", sanctioning_body: "Little League", initials: `S7${Date.now()}`, verification_status: "verified" })
    .select("id")
    .single();
  created.leagueId = league!.id;
  const { data: division } = await admin.from("division").insert({ league_id: league!.id, name: "12U" }).select("id").single();
  const { data: team } = await admin
    .from("team")
    .insert({ division_id: division!.id, name: "__s7_team__", season: "Spring", year: 2026, season_status: "in_season" })
    .select("id")
    .single();
  await admin.from("coach_assignment").insert({ team_id: team!.id, user_id: coachId, role: "primary", first_name: "S7", last_name: "Coach" });

  const { data: player } = await admin
    .from("player")
    .insert({ parent_user_id: parentId, first_name: "Milestone", last_name: "Kid", player_tag: "S7MilestoneKid", visibility_scope: "public" })
    .select("id")
    .single();
  await admin
    .from("roster_entry")
    .insert({ team_id: team!.id, player_id: player!.id, uniform_number: 21, first_name: "Milestone", last_name: "Kid" })
    .select("id")
    .single();

  const coach = await signIn(EMAILS.coach);

  // Game 1: 2 hits. hitsStars(2) === 1 (still the guaranteed default tier) -- no milestone.
  const line1 = {
    jerseyNumber: "21",
    lastName: "Kid",
    firstName: "Milestone",
    ab: 2,
    h: 2,
    singles: 2,
    doubles: 0,
    triples: 0,
    hr: 0,
    rbi: 0,
    bb: 0,
    hbp: 0,
    sf: 0,
  };
  const { gameId: game1Id } = await importGame(coach as any, {
    teamId: team!.id,
    gameDate: "2026-04-01",
    gameNumber: 1,
    opponent: "X",
    timeOfDay: "Morning",
    fileHash: hashFileContents("s7-game1"),
    lines: [line1],
  });

  let { data: itemsAfterGame1 } = await admin.from("activity_feed_item").select("*").eq("player_id", player!.id);
  assert.equal((itemsAfterGame1 ?? []).length, 0, "2 hits (still tier 1) should not create a milestone");
  console.log("game 1 (2 hits, still 1-star): no milestone created OK");

  // Game 2: 1 more hit -> season total 3 hits -> hitsStars(3) === 2. Crosses a tier.
  const line2 = { ...line1, ab: 1, h: 1, singles: 1 };
  const { gameId: game2Id } = await importGame(coach as any, {
    teamId: team!.id,
    gameDate: "2026-04-08",
    gameNumber: 2,
    opponent: "Y",
    timeOfDay: "Morning",
    fileHash: hashFileContents("s7-game2"),
    lines: [line2],
  });

  const { data: itemsAfterGame2 } = await admin.from("activity_feed_item").select("*").eq("player_id", player!.id);
  assert.equal((itemsAfterGame2 ?? []).length, 1, "3rd season hit should cross the hits tier-2 threshold");
  assert.equal(itemsAfterGame2![0].category, "hits");
  assert.equal(itemsAfterGame2![0].tier, 2);
  assert.equal(itemsAfterGame2![0].game_id, game2Id);
  console.log("game 2 (3rd hit): milestone created OK (hits, tier 2, correct game_id)");

  // ---- follow + block enforcement, real sessions ----
  const parent = await signIn(EMAILS.parent);
  const blocked = await signIn(EMAILS.blocked);

  await followPlayer(blocked as any, player!.id, blockedId);
  const { data: followRow } = await admin.from("follow").select("id").eq("player_id", player!.id).eq("follower_user_id", blockedId).maybeSingle();
  assert.ok(followRow, "unblocked user should be able to follow");
  await admin.from("follow").delete().eq("id", followRow!.id);
  console.log("unblocked user can follow OK");

  const { error: blockError } = await parent.from("block_or_report").insert({ reporter_user_id: parentId, target_user_id: blockedId, action_type: "block" });
  if (blockError) throw blockError;

  let followThrew = false;
  try {
    await followPlayer(blocked as any, player!.id, blockedId);
  } catch {
    followThrew = true;
  }
  assert.ok(followThrew, "a blocked user's follow attempt must be rejected by RLS");
  const { data: blockedFollowRow } = await admin.from("follow").select("id").eq("player_id", player!.id).eq("follower_user_id", blockedId).maybeSingle();
  assert.equal(blockedFollowRow, null, "no follow row should exist after the blocked attempt");
  console.log("blocked user's follow attempt rejected at the data level OK");

  console.log("\nALL SPRINT 7 MILESTONE/BLOCK CHECKS PASSED");
}

main()
  .then(cleanup)
  .catch(async (err) => {
    console.error("VERIFICATION FAILED:", err);
    await cleanup();
    process.exit(1);
  });
