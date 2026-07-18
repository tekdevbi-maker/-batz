# @Batz — Product & Technical Spec

## 1. Overview

A mobile app (iOS/Android) that lets little league players and their families track hitting stats independently — without needing a paid subscription to see the numbers a family already has a right to. Built as a companion to GameChanger, not a replacement: it imports GameChanger's own exported data rather than duplicating scoring or streaming.

**Long-term vision:** closer to an online sports video game (e.g. looking up any player's stats/rankings in Madden) than to a social media app — any signed-up user can look up any player's stats, current or past. Deliberately minimal beyond that: no DMs, no status posts, no photo uploads beyond a profile picture. The only "social" mechanics are following players and auto-posted achievement alerts that followers can like.

**Founding motivation:** (1) parents currently can't see their own kid's or their team's stats without paying for a GameChanger subscription, and (2) all-star team selections are often driven by a coach favoring their own kid rather than performance, with no visibility for other parents into the stats that should inform fair selection. Making stats openly visible — not locked behind a paywall or a single gatekeeping coach — is a core part of the app's purpose, not just a feature.

**v1 sport scope:** Baseball/softball only.

**Builder context:** Some prior mobile dev experience (~10 days with Flutter/Android Studio), but new to React Native specifically. Final stack decision: **React Native via Expo** — chosen over Flutter after direct comparison, since the prior Flutter experience was too recent/shallow to outweigh the benefits of building in the framework Claude can support fastest and most reliably throughout the project's life, paired with Expo's easy setup and strong Supabase/JS ecosystem fit.

---

## 2. Core Data Model

| Entity | Purpose |
|---|---|
| `Player` | Permanent identity for a kid, spans their entire little league career across teams/seasons. Owned by the registering Parent — only the Parent can delete it entirely. |
| `RosterEntry` | One row per Player/team/season — created either by a parent's registration (Section 4) or, if unclaimed, by the first game import; optionally linked to a `Player`. A Coach can remove a `RosterEntry` from their team (wrong-team correction) without deleting the underlying `Player`. |
| `Team` | Belongs to a Division; has a name, optional Team Logo, Season (Spring/Fall), Year, one or more coaches, a season status (in-season / ended) |
| `Division` | e.g. "12U", "10U" — belongs to a League |
| `League` | Top-level organizing entity; has a Sanctioning Body (Little League, Babe Ruth/Cal Ripken, PONY, Dixie Youth, USSSA, AABC, or Independent), a League Admin, an initials abbreviation (used in PlayerTag generation — first-come-first-served; a colliding initials set gets a trailing number appended, e.g. `WLL2`), and a verification status (pending / verified) — coach registration isn't complete for a manually-typed League Name until an admin verifies it |
| `Game` | One imported CSV = one Game record, holds game date, game number, opponent, time of day (Morning/Afternoon/Night), and each player's raw per-game batting counts |
| `TeamMembership` | Created when a parent claims a `RosterEntry` — grants full read access to that team |
| `CoachInvite` | Sent by a League Admin; grants ability to create one Team within a pre-set League/Division |
| `CoachAssignment` | Links a coach account to a Team; capped at 4 per team (1 primary + up to 3 assistant coaches) |
| `CustomerCareRequest` | Created when a parent uses "Reach out to Customer Care" (e.g. no team coach is reachable); tracked in Supabase, triaged by an AI bot |
| `BlockOrReport` | A user blocking or reporting another user on the social layer (follow/achievement features) |

**Key principle:** raw stat counts (AB, H, 1B, 2B, 3B, HR, RBI, BB, HBP, SF) are stored per-game and never overwritten. Calculated stats (AVG, OBP, SLG, OPS) are always derived on read, across any date range — single game, season, or full career. This means career totals are just the same aggregation function run over more games; no separate season-sync logic needed.

---

## 3. Data Import

### 3a. Per-Game Stats CSV (from GameChanger)

- Coach uploads a **new CSV after every game** — this is not a one-time roster import. Season/career totals are built by accumulating across every game import.
- GameChanger's export has 3 header rows to strip: a merged section header (Batting/Pitching/Fielding), the real column-name row, then data rows ending in a `Totals` row and a `Glossary` row (both discarded).
- **Column name collisions exist across sections** (H, BB, SO, K-L, HBP, CS, PIK, CI appear in both Batting and Pitching blocks with identical header text) — the parser must read by **column position**, not by name lookup.
- **The CSV contains no game date or opponent field.** The coach must manually enter the game date (and optionally an opponent name) at import time — this becomes part of the `Game` record and is what duplicate detection relies on, since nothing usable exists in the file itself.

**Duplicate detection (two layers, checked before import completes):**
1. **File-hash check** — if the exact same file (byte-for-byte) has already been imported for this team, flag it immediately, before parsing starts.
2. **Same-date warning** — if a `Game` already exists for this team on the same date, warn the coach rather than hard-blocking (legitimate doubleheaders exist), letting them confirm or cancel.

**Delete an import:**
- A coach can delete a previously-imported `Game` (e.g. if imported by accident).
- There is no partial/single-stat-line editing — if a game's data is wrong, the coach deletes the whole `Game` and re-imports it directly from the GameChanger app. Keeps the import model simple: a `Game` is always either a clean, complete import or deleted entirely.
- Since calculated stats are always derived on read from raw per-game data (never stored as running totals), deleting a `Game` automatically corrects every season/career aggregate that depended on it — no manual recalculation needed.
- Deletions are **untracked** — no audit log — kept simple by design decision.

**Import a Game screen (UI):**
- **Date** — defaults to the current date, editable by the coach.
- **Game Number** — a selectable tile, auto-suggested as the last recorded game number for this team + 1. A small note near this selection reads: *"Last game recorded was Game #[N] against [opponent] on [date]"* — giving the coach context to confirm they're on the right game before importing.
- **Opponent** — a dropdown listing the other teams already set up in the League/Division, with a manual free-text entry option available in case opposing teams haven't been created in the app yet.
- **Time of day** — selectable: Morning, Afternoon, or Night.

**Columns imported (Batting section only):**

| Column | Field | Purpose |
|---|---|---|
| Number | jersey # | display only, not identity |
| Last, First | name | roster matching |
| AB | at-bats | AVG denominator |
| H | hits | sanity check (should = 1B+2B+3B+HR) |
| 1B, 2B, 3B, HR | hit types | core counts |
| RBI | RBIs | as requested |
| BB | walks | OBP |
| HBP | hit-by-pitch | OBP |
| SF | sac flies | OBP denominator |

All other exported columns (pitching, fielding, advanced batting metrics) are ignored.

### 3b. Parent Invite Link (coach-distributed, not app-sent)

There is no roster CSV upload and no in-app email blast to an uploaded contact list. Instead: after coach registration is verified, the coach receives **one invite link via email verification**, which they copy/paste into their own welcome message to parents (text, email, whatever they'd already send). The app itself never needs a parent contact list.

---

### 3c. OS-Level CSV File Association

The app registers itself as a handler for `.csv` files at the operating system level, so it appears as an "Open with" / "Open In" option whenever a CSV is shared or tapped anywhere on the phone — including directly from GameChanger's "Export stats" action. Selecting the app routes straight into the coach's game-import screen (bypassing Home), which then reads and parses the file using the same logic as a manually-uploaded CSV (Section 3a).

**Platform mechanics:**
- **Android:** an intent filter declaring support for CSV MIME types.
- **iOS:** declared supported document types (UTIs) for CSV.

**Build note:** this requires native configuration changes that Expo Go (the quick-preview tool) does not support. Building this feature requires switching to a custom development client via EAS Build — a normal, supported step in the Expo workflow, but one that should happen before this specific feature is built. Every other feature can continue to be developed/tested in Expo Go until this point.

---

## 4. Parent Registration Flow

1. Parent clicks the link the coach pasted into their own welcome message (text/email) — this sends them to the app store to download the app.
2. Parent opens the app → creates/logs into their account.
3. **Registration is pre-filled** with the Coach's name, Team, Division, Season, Year, and League name — the parent doesn't re-enter any of this.
4. Parent registers their Player:

   | Field | Required? |
   |---|---|
   | First Name | Optional (parent controls whether it's displayed) |
   | Last Name | Optional (parent controls whether it's displayed) |
   | Uniform Number | **Required** |
   | PlayerTag | Optional — if left blank, defaults to `Player_[Number]_[Division]_[TeamName]_[Season]_[Year]_[LeagueInitials]` |

5. Once registration completes, the parent's app profile is established: they can see their Player listed on the Coach's roster, add the Player's demographics and a picture (Section 7 — parent-only control), and register **additional Players** under the same profile if they have more than one kid playing. If they keep the default helmet picture instead of uploading a photo, they can customize the **helmet color** and **background color** here (and change it anytime later in the Player's settings) — the app renders the customization by tinting a single white helmet template asset, so any color choice works.
6. **Coach gets an in-app notification** when a Parent registers a Player.
7. **One account per player registration** — first parent/guardian to register wins; no multi-parent linking to the same player.
8. Once linked, the parent gets a `TeamMembership`: full stats access (not just their own kid) for every player on that team.

**Deletion authority:**
- A **Coach** can remove a Player from their team's roster (e.g. accidentally added to the wrong team) — but this does **not** delete the Player profile itself, which remains with the Parent.
- Only the **Parent** can delete a Player profile entirely. When they do, the underlying roster spot is **not** removed from the team or its game history — it reverts to the default auto-generated unclaimed entry (`Player_[Number]_[Division]_[TeamName]_[Season]_[Year]_[LeagueInitials]`) under the Coach's team, the same as a never-claimed roster spot. This preserves team and game history integrity even after a parent walks away.

**If a parent never registers:** the Player still appears once the coach imports the first game (since the per-game CSV includes Number/Last/First). An unclaimed Player is auto-displayed using the same default PlayerTag format above.

---

## 5. Team Creation (Coach Onboarding)

**v1 model:** invite-only. The app's builder is the sole League Admin for now. Future: each league gets its own admin (not v1).

**Coach registration form fields, in order:**
1. First Name
2. Last Name
3. Email
4. Password
5. **Sanctioning Body** — pre-populated dropdown: Little League, Babe Ruth League (includes Cal Ripken), PONY Baseball/Softball, Dixie Youth Baseball, USSSA, AABC, or Independent. Small, stable list — doesn't need to grow.
6. **League Name** — the actual local league (e.g. "Winter Park Little League"). Pre-selected dropdown if it already exists in the system, but the coach can type in a new name if theirs isn't listed.
7. **Division** — pre-selected dropdown
8. **Season** — Spring or Fall
9. **Year** — defaults to the current 2-digit year, editable
10. **Team Name** — manual input
11. **Team Logo** — optional picture upload

**League verification gate:** if the coach typed in a League Name not already in the dropdown, registration is **not considered complete** until the app admin (the user, for v1) manually verifies/approves that League Name. This prevents unverified or duplicate League entries from populating the system.

**Flow:**
1. Admin sets up League(s) and Division(s) in an admin screen (simple add/edit/remove lists) — these populate dropdowns used everywhere else.
2. Coach fills out the registration form above.
3. If the League was typed in manually (not selected from the dropdown), registration is held pending admin verification.
4. Once registration is complete (verified, if applicable), the coach receives an **email verification** containing the parent invite link (Section 4) — which the coach then copy/pastes into their own welcome communication to parents.
5. Team exists immediately upon completed registration. No roster or game CSV is needed to finish setup.

---

## 6. Home Screen / Navigation

- Home screen is effectively a **team switcher**: lists every team the signed-in user is linked to, as coach or as a claimed parent.
- A single account can hold both roles across different teams (e.g. coaching one team, parenting a kid on another).
- Each team card shows Team Name, League/Division, and a role indicator (Coach vs. Parent).
- **Only in-season teams appear on Home.** Once a team's season ends, it drops off Home — historical access to that team's data still exists, just not surfaced on the home list.
- Selecting a team card sets it as "active" and opens the team-scoped app (roster, game log, stats, leaderboard, etc.) underneath it.

---

## 7. Player Career Profile & Privacy — Transparency Model

**Founding rationale (why this section looks the way it does):** the app exists partly to solve a fairness problem — all-star selections that reward a coach's own kid rather than performance, hidden from scrutiny because stats live behind a GameChanger paywall. That mission only works if stats are actually visible to people other than a single gatekeeping coach and one parent. A privacy-first, locked-down current season would recreate the exact opacity problem the app is meant to fix. So the model is intentionally closer to a sports video game (e.g. looking up any player's season stats/rankings in Madden) than to a locked-down social app.

**Stats visibility — open by default:**
- **Current-season stats** are visible to **any signed-up app user** — not just the linked parent and current coach. This is the core design decision: it's what makes performance auditable (e.g. checking an all-star roster against actual hitting numbers).
- **Previous-season stats** are visible the same way — any signed-up user, no toggle required. There's no longer a strong reason to lock these down more tightly than current-season data, since open stats is the point of the app, not an opt-in exception to it.
- This applies within the mobile app only — no public web page, no outside-the-app links. A user must sign up (create an account) to view any stats.

**What stays private regardless of the open-stats model:**
- Parent identity, email, and phone number (used only for the invite/claim flow, never shown publicly)
- Any personal/contact info beyond a player's name and stats
- The transparency mission is about performance numbers being auditable — not about exposing families' personal details

**Profile picture control:** a player's profile picture can only be uploaded or changed by the linked parent — never by a coach, another parent, or any other user. No one else has write access to this field.

**Uploaded photo visibility restriction:** unlike stats (open by default per above), a parent-uploaded **photo** is always restricted to **Private** visibility — viewable only by Coaches and Parents in that player's League/Division for the current season, regardless of whether the player's stats are set to Public or Private. This is a deliberate split: the transparency mission requires open stats, but a real photo of a child doesn't need the same global reach, so photos never go fully public even for a Public player. The default helmet picture (no real photo) has no such restriction, since it contains no personal imagery.

**Default profile picture (no photo uploaded):** a helmet graphic based on a provided template (confirmed as a 1:1 square crop), displaying the player's **uniform number** front-center in a large 3D block-style font (dynamically generated per player, replacing a placeholder).

**Rendering architecture — layered masks:**
1. Base white template art (the helmet line-work, fixed and never recolored)
2. Background color mask
3. Helmet shell color mask
4. Stars — always the front-most layer, on top of everything else

Color customization applies **only to masks 2 and 3** — the gray interior padding visible under the brim is part of the base template (mask 1) and always stays its original gray, regardless of the chosen color scheme.

**Stars:** earned stars (Section 9) default to a **border position by color** when first earned — gold (Home Runs) at bottom-center, white (Hits) at right-center, red (Doubles) at top-center, blue (Triples) at left-center — and from there the parent can click/drag each star anywhere they want on the picture. This works on **any profile picture, including parent-uploaded photos**, not just the default helmet. The count and color of available stars is still determined entirely by the star system (white=Hits, red=Doubles, blue=Triples, gold=Home Runs; a zero-count category provides no stars, except the guaranteed 1 white Hits star — RBI has no star category at all, see Section 9). When a stat milestone raises a star tier mid-season, the newly earned star becomes available in the editor for the parent to place, starting at its default border position.

**Team Logo placement:** the Coach-provided Team Logo (Section 5) appears in the **bottom-left corner** of the 1:1 profile picture, whether the picture is a parent-uploaded photo or the default helmet.

**Parent-controlled settings (per player):**
- **Display identity** — default is a unique **PlayerTag** (pseudonym), not the player's full name. At roster enrollment, the PlayerTag is auto-generated in the format `Player_[UniformNumber]_[Division]_[TeamName]_[LeagueInitial]` (e.g. `Player_23_12U_Tigers_W`) — including TeamName avoids collisions between players who share a jersey number across different teams in the same division. Parent can unlock/reveal the full name in Settings if they choose, or customize the PlayerTag itself. The player's actual full name is otherwise only ever shown once, during the parent's claim/enrollment process (Section 4) — never in search, profiles, leaderboards, or anywhere else by default.
- **Visibility scope** — parent chooses between:
  - **Public** — accessible to any app user, regardless of League/Division.
  - **Private** — accessible only to Coaches and Parents in that player's League/Division **for the current season** — not past-season coaches/parents in that League/Division, and not every app user. This is a live-evaluated check (like the earlier current-season coach access rule): access shifts automatically as seasons end and rosters change, with no manual revocation needed.

**Open question carried forward:** whether any guardrail is needed on the Private setting given the all-star fairness motivation (e.g. a coach could set their own kid to Private) — currently no restriction is planned; any parent can choose Private freely.

---

## 8. Social Features (v1)

Since stats are open to any signed-up user by default (Section 7), these features don't need to enforce their own separate privacy rules — the harder question for these features is scope, not access control.

**Leaderboards**
- **League/Division-level:** the primary leaderboard view. A **category dropdown** lets the viewer pick which stat to rank by: Hits, Doubles, Triples, Home Runs, RBI, AVG, OBP, SLG, OPS, or Walks. Strikeouts and HBP are deliberately excluded — not meaningful "leaderboard" stats to rank favorably by. Limited to the **Top 25** per League/Division per category.
- **Team-level:** displays **every Player** on the team (no Top 25 cap — a team roster is small enough that showing everyone makes sense).
- This resolves the earlier open question about current-season privacy: since all stats are open by default (Section 7), League/Division-wide comparison doesn't introduce a new privacy surface.

**Follow**
- A user can follow any player, since stats are open by default — no separate visibility check needed.
- Followers get notified of new stats and achievement milestones.

**Activity Feed**
- Surfaces recent milestones (e.g. "Carter hit his first HR!") to a player's followers, who can like them.
- No special access rule needed — same open-stats model as everywhere else.

**Player Search**
- Search results and profiles display each player's **PlayerTag by default, not their real name** — matches the identity setting in Section 7.
- A full name only ever surfaces once: during a parent's claim/enrollment flow. It never appears in search results, public profiles, leaderboards, or the activity feed, unless the parent has explicitly unlocked it in Settings.
- Needed as a foundational feature so users can find and follow players at all, given stats and profiles are open by default.

---

## 9. Star System (Leaderboards & Player Profiles)

Every stat category tracked gets its own independent star rating, based on **current-season counts only** — each resets at the start of a new season. Displayed on both **Leaderboards** and **Player Profiles** — including as a color-coded visual overlay on the default helmet profile picture (Section 7: white=Hits, red=Doubles, blue=Triples, gold=Home Runs) for players without an uploaded photo. Since every rating is derived purely from existing per-game counts (Section 3a), no new data needs to be stored — each star level is calculated on read, the same way AVG/OBP/SLG/OPS are.

**Only Hits gets a guaranteed default star.** Every player starts at 1 white star just for joining. Doubles, Triples, and Home Runs show **no star at all** until the player records at least one — a player with 0 doubles displays no red star, not a "1-star" placeholder. A star only appears once that category's own 1-star threshold is met.

**Hits**

| Stars | Threshold |
|---|---|
| ⭐ (1 star) | Default — joining @Batz |
| ⭐⭐ (2 stars) | 3 hits |
| ⭐⭐⭐ (3 stars) | 8 hits |
| ⭐⭐⭐⭐ (4 stars) | 13 hits |
| ⭐⭐⭐⭐⭐ (5 stars) | 20+ hits |

**Doubles** (no star shown until 1+ double)

| Stars | Threshold |
|---|---|
| ⭐ (1 star) | 1 double |
| ⭐⭐ (2 stars) | 3 doubles |
| ⭐⭐⭐ (3 stars) | 5 doubles |
| ⭐⭐⭐⭐ (4 stars) | 7 doubles |
| ⭐⭐⭐⭐⭐ (5 stars) | 9+ doubles |

**Triples** (no star shown until 1+ triple — rarer event, bigger jumps per occurrence)

| Stars | Threshold |
|---|---|
| ⭐⭐ (2 stars) | 1 triple |
| ⭐⭐⭐⭐ (4 stars) | 2 triples |
| ⭐⭐⭐⭐⭐ (5 stars) | 3+ triples |

**Home Runs** (no star shown until 1+ home run — rarest event, biggest jumps per occurrence)

| Stars | Threshold |
|---|---|
| ⭐⭐⭐ (3 stars) | 1 home run |
| ⭐⭐⭐⭐⭐ (5 stars) | 2+ home runs |

**RBI is explicitly excluded from the star system** — a batter can record an RBI without getting a hit (e.g. a sacrifice fly or fielder's choice), so it doesn't fit the hit-based star mechanic. RBI remains a Leaderboard-only stat (Section 8), with no sticker/star category of its own.

---

## 10. Account, Support & Safety Infrastructure

**Account recovery** — standard password reset / account recovery flow, required before real users onboard.

**Transactional email service:** recommended choice is **Resend** — it's the provider Supabase's own team specifically recommends, the SMTP swap-in is straightforward, and its free tier (3,000 emails/month, 100/day) comfortably covers coach email verification at this app's scale. **Postmark** is the alternative worth knowing about if deliverability becomes mission-critical later — it's considered the deliverability leader for transactional mail, at a slightly higher cost. Either replaces Supabase's built-in email, which is capped at 2 emails/hour and explicitly not meant for production use.

**Push notifications:** needed for the follow/achievement alerts (Section 8) and the coach notification when a parent registers a Player (Section 4). Since the app is built on Expo, this uses **Expo's push notification service**, which wraps both Apple's (APNs) and Google's (FCM) push systems behind one unified API — the app requests a push token per device, stores it against the user's account, and a Supabase Edge Function sends notifications through Expo's service when a relevant event fires (new milestone, new registration, etc.). No extra developer accounts are needed beyond the Apple/Google ones already planned for Sprint 9-10.

**Coach team structure** — each team supports up to **4 total coach-role accounts**: the original coach plus up to 3 additional assistant coaches.

**Customer Care fallback** — if none of a team's coach accounts are reachable (e.g. all 4 are unresponsive), a linked parent can use a **"Reach out to Customer Care"** option, staffed by an AI bot that gathers the nature of the request. These requests are tracked in a Supabase table for follow-up — not just a one-off support email.

**Block / Report** — available on the social layer (follow, achievement posts) so a user can block another user or report misuse, even though the app is stats-only and has no messaging.

**Accountability rule** — whoever registers (sets up) a Player in the app is the accountable party for that under-18 player. This is the person responsible for that player's account-related decisions (e.g. Public/Private visibility, PlayerTag), not just whoever happens to be the current coach or a claimed parent.

**Privacy Policy & Terms of Service** — required given the app handles data connected to minors; both App Store and Play Store submissions require these regardless of app size. To be drafted before launch.

---

## 11. Deliberately Out of Scope (v1)

- Live scoring or streaming (GameChanger's territory — don't compete there)
- Team messaging/scheduling
- Pitching or fielding stats — hitting only
- Public web pages or outside-the-app sharing links
- Multiple parents linked to one player
- Multi-admin leagues (single admin — the builder — for now)
- Single-stat-line editing (whole-game delete + re-import only)

---

## 12. Naming & Legal Note

App name: **@Batz**. Do not use "GameChanger" in the app's name or branding, and do not imply affiliation — it's an actively trademarked product (DICK'S Sporting Goods). Position as independent: "your stats, your data, no subscription."

**Trademark due-diligence note:** MLB's own app was branded "At Bat" for many years (now part of their main "MLB" app) and is tied to MLB Advanced Media, a large and protective trademark holder. "@Batz" puts meaningful distance between itself and "At Bat"/"At Bats" via the deliberate misspelling, but a proper trademark search — or a quick attorney consult — is still worth doing before committing to this name publicly (App Store listing, marketing, etc.). This is not legal advice; just a flag worth acting on.

---

## 13. Suggested Build Order

1. Data model + local logic layer (pure functions for stat calculations), tested against fake data before any UI exists — get the baseball math right first (AVG, OBP, SLG, OPS from raw counts).
2. CSV parser for the per-game batting export (column-position based, strips header/Totals/Glossary rows).
3. Core screens end-to-end, one at a time: Add Player → Log/Import Game → Game Log → Season/Career Stats.
4. Team creation + League/Division admin screens.
5. Roster CSV import + invite email blast + claim flow.
6. Home screen team switcher.
7. Career Profile view, open to any signed-up user (current + past seasons).
8. Player search (needed so users can find and follow players at all).
9. Social layer: team leaderboard, follow, activity feed, block/report.
10. Account recovery, Customer Care AI bot + Supabase request tracking.
11. Privacy Policy, Terms of Service, and app store submission prep (age rating, data-safety disclosures).

---

## 14. Realistic Sprint Timeline

Assumes 1-week sprints, steady part-time effort. Claude can generate code for any given feature quickly — the real pacing constraint is testing, iteration, and external dependencies (app review turnaround, account approvals) rather than code generation speed.

| Sprint | Focus | Why this takes a full week, not a day |
|---|---|---|
| **0** | Environment setup — Supabase project, Expo scaffold | Runs entirely in Expo Go, no developer accounts needed yet |
| **1** | Data model (Postgres tables) + stat-calculation logic (AVG/OBP/SLG/OPS), tested against real numbers | Getting baseball math exactly right needs real test cases, not just code that compiles |
| **2** | CSV parser + Import a Game screen (date, game number, opponent, duplicate detection, delete) | This is where GameChanger's actual quirky export format gets battle-tested against real files, likely several rounds |
| **3** | Auth + Team creation + League/Division admin + Coach invites | Auth flows always surface edge cases in testing (expired links, wrong role, etc.) |
| **4** | Roster CSV import + email invites + parent claim flow | Depends on real email delivery testing, not just code |
| **5** | Home screen, Game Log, Season/Career stat views | Straightforward once data model's solid — likely the fastest sprint |
| **6** | Career Profile + Public/Private/PlayerTag + Row Level Security policies | The most conceptually complex piece designed so far — RLS policies need careful testing to confirm they actually enforce what's specified |
| **7** | Player search + follow + activity feed + team leaderboard + block/report | Several interconnected features; realistically the biggest sprint |
| **8** | Account recovery + Customer Care AI bot + assistant coach accounts | New territory (AI bot integration), so expect some iteration |
| **9** | OS-level CSV file association (EAS custom dev client, intent filters/UTIs) | **Apple Developer Program ($99/yr) becomes required here** — Apple requires code-signing for any real-device build, even internal testing. Native config work is also finicky to get right — budget extra time. |
| **10** | Privacy Policy, Terms of Service, app store submission prep, bug-fixing pass | **Google Play account ($25 one-time) needed here** — Android allows sideloaded test builds without one until actual submission. App store review (often 1–7 days of waiting) eats real calendar time too. |

**Realistic total: roughly 10–12 weeks of calendar time** working steadily part-time. Full-time effort could compress Sprints 0–9 to something like 6–7 weeks, but Sprint 10's app store review wait is largely outside anyone's control.

---

## 15. Open Items for Future Versions

- Multi-admin support (per-league admins instead of one global admin)
- Expansion beyond baseball/softball
- Any richer social mechanics beyond follow/leaderboard/activity feed
- **Backup manual-entry template** — a fallback CSV/template a coach can fill in by hand for a game's stats, in case GameChanger changes its export format and breaks the automated per-game import. Explicitly a contingency plan, not part of the v1 release — only worth building if the GameChanger export actually breaks.
