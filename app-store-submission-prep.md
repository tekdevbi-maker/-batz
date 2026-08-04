# App Store / Play Store Submission Prep (Sprint 10, updated 2026-08-04 for the age-gate/locked-player rework)

Draft answers for the App Store Connect "App Privacy" questionnaire and the Google Play "Data
safety" form, plus age-rating guidance -- for you to transcribe once you have store accounts set
up (Apple blocked on the LLC; Google Play needs its $25 one-time account). Based on exactly what
this app collects as of the 2026-08-04 COPPA-compliance rework (see
[privacy-policy.tsx](app/app/privacy-policy.tsx) for the full policy this is derived from).
**Not legal advice** -- worth a quick sanity check against the actual current console forms,
since Apple/Google both change these periodically.

---

## 1. What this app actually collects (source of truth for both forms)

| Data | Collected? | Notes |
|---|---|---|
| Email address | Yes | Account login (Supabase Auth) |
| Password | Yes | Hashed by Supabase Auth, never visible to us in plaintext |
| Age attestation | Yes | Timestamp confirming the account holder was 13+ at signup -- collected via a required attestation screen before any account is created, not a self-reported birthdate |
| Name | Yes | Coach's name (registration); player's name (optional, entered by a parent/coach) -- hidden from everyone except that team's coaching staff until a parent completes the unlock/consent step described below |
| User-generated text | Yes | Block/Report reason, Customer Care request description |
| Hitting statistics | Yes | Imported from a GameChanger CSV the coach uploads -- not personal info about the uploader |
| Photos | No | Not implemented (spec's profile-picture upload is out of scope for what's built) |
| Precise/coarse location | No | |
| Phone number | No | |
| Physical address | No | |
| Payment info | No | |
| Contacts / calendar | No | |
| Browsing/search history | No | |
| Device identifiers / advertising ID | No | No ad SDK, no analytics SDK integrated |
| Crash/diagnostic data | No | No crash-reporting SDK integrated (consider Sentry/similar later -- if added, both forms below need updating) |
| Health/fitness, financial, biometric data | No | |

Nothing here is shared with third parties for their own purposes, sold, or used for
cross-app/cross-site tracking.

---

## 2. Apple App Privacy questionnaire (App Store Connect)

For each category Apple asks about, answer:

- **Contact Info -> Email Address**: Collected. Linked to identity. Used for: App Functionality
  (account login), Other Purposes: none. Not used for tracking.
- **Contact Info -> Name**: Collected. Linked to identity. Used for: App Functionality (coach
  display name; a player's name, entered by a coach/parent, hidden from everyone but that
  team's coaching staff until a parent completes the in-app claim/consent step, after which it
  follows that parent's own display-name choice). Not used for tracking.
- **User Content -> Other User Content**: Collected (Block/Report reason text, Customer Care
  request description). Linked to identity. Used for: App Functionality. Not used for tracking.
- **Identifiers -> User ID**: Collected (Supabase Auth UUID, needed for login/session). Linked to
  identity. App Functionality only.
- Every other category (Health & Fitness, Financial Info, Location, Contacts, Browsing History,
  Search History, Identifiers -> Device ID, Purchases, Photos/Videos, Audio Data, Sensitive Info,
  Diagnostics): **not collected** -- answer "No" / skip.
- **"Do you or your third-party partners use this data for tracking?"**: **No.** Nothing here
  meets Apple's definition of tracking (linking data with third parties for
  advertising/measurement, or sharing with data brokers).

**Do not enroll this app in Apple's Kids Category.** The app's actual users (who create accounts,
sign in, and interact with the UI) are coaches, parents/guardians, and other family/team members
13 and older -- enforced by a required age-attestation screen before any account is created.
Players never sign in or use the app directly, regardless of their own age; their name and stats
are entered on their behalf by an adult, and stay hidden behind a generic placeholder until a
parent/guardian completes an explicit in-app consent step to unlock them. Apple's Kids Category is
for apps *designed for and used by* children, which this isn't. Marking it as a Kids Category app
would trigger requirements (e.g. no third-party analytics/ads at all, parental gates) this app
doesn't need to meet but also isn't built for review under -- and could be flagged as a mismatch
during review. A standard **4+ age rating** (no objectionable content) under Apple's regular
content questionnaire is still the correct fit for content maturity -- the 13+ *account* minimum
is a separate, additional gate enforced in-app via the attestation screen and the Terms of
Service, not something the App Store's content rating itself needs to encode.

---

## 3. Google Play Data safety form

- **Data collected**: Personal info -> Email address, Name. App activity -> User-generated
  content (Block/Report, Customer Care text). Note the age-attestation timestamp under
  App info -> Other -- it's a compliance record, not personal info collected for a feature.
- **Data shared with third parties**: No (Supabase and a future transactional-email provider are
  processors operating the app's own infrastructure, not third parties Play considers "shared
  with" in the marketing/advertising sense -- Play's own help center confirms infrastructure
  processors don't count as "sharing").
- **Is data encrypted in transit?**: Yes (Supabase enforces TLS).
- **Can users request data deletion?**: Yes -- describe the process from the Privacy Policy
  (email-based request; also self-service Public/Private, display-mode, and per-leaderboard
  visibility toggles for players, plus the self-service "unlink" that returns a player to a
  locked/hidden state without waiting on an email request).
- **Independent security review**: No (unless you commission one before submitting).
- **Data collection is required or optional**: Email/password required to create an account;
  a player's real name is optional (PlayerTag is the default identity).

**Do not opt into Google Play's "Designed for Families" program.** Same reasoning as the Apple
Kids Category above -- this app's actual users are coaches, parents/guardians, and other
family/team members, gated at 13+ by a required in-app attestation, not children directly. Under
Play's **Target audience and content** section, set the target audience to **13 and older**
(Play's terminology: include the "13-15", "16-17", and "18+" age groups, exclude "Under 13"),
reflecting the enforced account minimum -- not "18 and older," since the app no longer restricts
itself to adults-only account holders. Opting into Families would still impose Play's stricter
ads/analytics/data rules meant for apps children directly use, which doesn't match how this app
actually works (players never hold accounts or interact with the UI at all, at any age), and
would likely cause a policy mismatch during review.

---

## 4. COPPA -- why this app is likely out of scope (confirm with a lawyer)

COPPA restricts operators of services **directed to children under 13**, or with actual knowledge
of collecting personal info directly from a child under 13. In this app:

- Children never create an account, sign in, or submit anything themselves -- account holders are
  gated at 13+ by a required age-attestation screen before signup completes (see
  [AgeAttestationGate.tsx](app/components/AgeAttestationGate.tsx)), recorded as a timestamp on the
  account.
- Every piece of information about a player is entered by the adult (parent/guardian, or a coach
  before a parent claims the roster spot) who registers or imports them.
- An imported player starts **locked**: their name/uniform number are hidden from everyone except
  that team's coaching staff, stats show blank, and they're excluded from every leaderboard, until
  a parent/guardian completes an explicit in-app consent step to unlock them (either requesting
  the claim themselves with the coach's approval, or agreeing to a coach-initiated offer -- either
  path ends in the same consent screen describing what unlocking means). A parent/guardian can
  reverse this at any time via a self-service "unlink," and a team's Head Coach can also unlink a
  player unilaterally.
- The app's UI, account flows, and marketing are all coach/parent-facing, not child-facing.

This is analogous to a school's parent portal or a youth-sports registration site -- generally
understood to fall outside COPPA's direct-collection trigger, because the child isn't the one
interacting with the service. The locked-player/consent mechanism above is a deliberately stronger
posture than the statutory minimum requires (COPPA's trigger is about the service collecting
directly from a child, which never happens here regardless), but it gives a real, auditable
parental-consent record for each player's data becoming visible -- worth mentioning to a reviewer
or a lawyer as evidence of a considered privacy design, not just an absence-of-collection argument.
That said, this app **does** handle data connected to minors at scale, which is exactly the kind
of thing worth a real (cheap, one-time) attorney consult before public launch -- flagging it here
rather than asserting it as settled, same spirit as the trademark note in the spec (Section 12).

---

## 5. Still blocked on accounts (nothing to do here yet)

- Actually filling in and submitting these forms (needs the Apple Developer Program + Google Play
  console accounts).
- Screenshots, app description, keywords, support URL -- straightforward once you're in the
  consoles; happy to help draft the store listing copy whenever you're ready.
