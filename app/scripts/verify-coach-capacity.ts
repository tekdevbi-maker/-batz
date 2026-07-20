/**
 * Sprint 8 verification: confirms the closed coach_assignment RLS gap (an
 * unrelated signed-in user can no longer self-assign as primary coach to
 * an existing team) and that join_as_assistant_coach() enforces the
 * 4-coach cap. Real authenticated sessions throughout, not service role.
 * Run: npx tsx scripts/verify-coach-capacity.ts
 */
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { joinAsAssistantCoach, CoachCapacityError, AlreadyCoachError } from "../lib/coachesRepository";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !serviceKey || !anonKey) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY / EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY");
  process.exit(1);
}

const admin = createClient(url, serviceKey);
const PASSWORD = "sprint8-verify-password";

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
  const primaryId = await makeUser("s8primary@example.com");
  const intruderId = await makeUser("s8intruder@example.com");
  const a1 = await makeUser("s8assist1@example.com");
  const a2 = await makeUser("s8assist2@example.com");
  const a3 = await makeUser("s8assist3@example.com");
  const a4 = await makeUser("s8assist4@example.com");
  created.userIds.push(primaryId, intruderId, a1, a2, a3, a4);

  const { data: league } = await admin
    .from("league")
    .insert({ name: "__s8_league__", sanctioning_body: "Little League", initials: `S8${Date.now()}`, verification_status: "verified" })
    .select("id")
    .single();
  created.leagueId = league!.id;
  const { data: division } = await admin.from("division").insert({ league_id: league!.id, name: "12U" }).select("id").single();
  const { data: team } = await admin
    .from("team")
    .insert({ division_id: division!.id, name: "__s8_team__", season: "Spring", year: 2026, season_status: "in_season" })
    .select("id")
    .single();
  // Pre-populate the primary coach directly (service role) -- the client
  // flow that would normally create this is coach-register.tsx.
  await admin.from("coach_assignment").insert({ team_id: team!.id, user_id: primaryId, role: "primary", first_name: "S8", last_name: "Primary" });

  // ---- the closed gap: an unrelated user can no longer self-assign as primary ----
  const intruder = await signIn("s8intruder@example.com");
  const { error: intrudeError } = await intruder.from("coach_assignment").insert({ team_id: team!.id, user_id: intruderId, role: "primary" });
  assert.ok(intrudeError, "an unrelated user must not be able to self-assign as primary on an existing team");
  console.log("gap closed: unrelated user's primary self-assign rejected OK ->", intrudeError!.message);

  // A brand new team (zero coaches) should still allow primary self-assign
  // -- this is the real coach-registration flow, must keep working.
  const { data: freshTeam } = await admin
    .from("team")
    .insert({ division_id: division!.id, name: "__s8_fresh_team__", season: "Spring", year: 2026, season_status: "in_season" })
    .select("id")
    .single();
  const { error: freshError } = await intruder.from("coach_assignment").insert({ team_id: freshTeam!.id, user_id: intruderId, role: "primary" });
  assert.equal(freshError, null, "self-assigning as primary on a brand-new team (zero coaches) must still work");
  console.log("brand-new-team primary self-assign still works OK");
  await admin.from("team").delete().eq("id", freshTeam!.id);

  // ---- assistant coach capacity cap ----
  for (const [email, label] of [["s8assist1@example.com", "assistant 1"], ["s8assist2@example.com", "assistant 2"], ["s8assist3@example.com", "assistant 3"]] as const) {
    const c = await signIn(email);
    const id = await joinAsAssistantCoach(c as any, team!.id, "S8", label);
    assert.ok(id);
  }
  const { data: coachesAfter3 } = await admin.from("coach_assignment").select("id").eq("team_id", team!.id);
  assert.equal(coachesAfter3!.length, 4, "1 primary + 3 assistants = 4 total coaches");
  console.log("3 assistants joined, team now at 4/4 coaches OK");

  const c4 = await signIn("s8assist4@example.com");
  let capacityThrew = false;
  try {
    await joinAsAssistantCoach(c4 as any, team!.id, "S8", "assistant 4");
  } catch (err) {
    capacityThrew = err instanceof CoachCapacityError;
  }
  assert.ok(capacityThrew, "the 5th coach join must be rejected with CoachCapacityError");
  console.log("5th coach join rejected (capacity cap enforced) OK");

  // Re-joining as an existing coach should be rejected distinctly, not
  // silently succeed or count against capacity confusingly.
  const c1 = await signIn("s8assist1@example.com");
  let alreadyThrew = false;
  try {
    await joinAsAssistantCoach(c1 as any, team!.id, "S8", "assistant 1 again");
  } catch (err) {
    alreadyThrew = err instanceof AlreadyCoachError;
  }
  assert.ok(alreadyThrew, "an existing coach re-joining must be rejected with AlreadyCoachError");
  console.log("re-join by existing coach rejected distinctly OK");

  console.log("\nALL SPRINT 8 COACH CAPACITY/RLS CHECKS PASSED");
}

main()
  .then(cleanup)
  .catch(async (err) => {
    console.error("VERIFICATION FAILED:", err);
    await cleanup();
    process.exit(1);
  });
