# App Store / Play Store Submission Prep (Sprint 10)

Draft answers for the App Store Connect "App Privacy" questionnaire and the Google Play "Data
safety" form, plus age-rating guidance -- for you to transcribe once you have store accounts set
up (Apple blocked on the LLC; Google Play needs its $25 one-time account). Based on exactly what
this app collects as of Sprint 9 (see [privacy-policy.tsx](app/app/privacy-policy.tsx) for the
full policy this is derived from). **Not legal advice** -- worth a quick sanity check against the
actual current console forms, since Apple/Google both change these periodically.

---

## 1. What this app actually collects (source of truth for both forms)

| Data | Collected? | Notes |
|---|---|---|
| Email address | Yes | Account login (Supabase Auth) |
| Password | Yes | Hashed by Supabase Auth, never visible to us in plaintext |
| Name | Yes | Coach's name (registration); player's name (optional, entered by a parent/coach) |
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
  display name; a player's name, entered by their parent/guardian, only ever shown to that
  parent during registration unless explicitly revealed in Settings). Not used for tracking.
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
sign in, and interact with the UI) are adults -- coaches and parents/guardians. Players never sign
in or use the app directly; their name and stats are entered on their behalf by an adult. Apple's
Kids Category is for apps *designed for and used by* children, which this isn't. Marking it as a
Kids Category app would trigger requirements (e.g. no third-party analytics/ads at all, parental
gates) this app doesn't need to meet but also isn't built for review under -- and could be flagged
as a mismatch during review. A standard **4+ age rating** (no objectionable content) under Apple's
regular content questionnaire is the correct fit.

---

## 3. Google Play Data safety form

- **Data collected**: Personal info -> Email address, Name. App activity -> User-generated
  content (Block/Report, Customer Care text).
- **Data shared with third parties**: No (Supabase and a future transactional-email provider are
  processors operating the app's own infrastructure, not third parties Play considers "shared
  with" in the marketing/advertising sense -- Play's own help center confirms infrastructure
  processors don't count as "sharing").
- **Is data encrypted in transit?**: Yes (Supabase enforces TLS).
- **Can users request data deletion?**: Yes -- describe the process from the Privacy Policy
  (email-based request; also self-service Public/Private and reveal-name toggles for players).
- **Independent security review**: No (unless you commission one before submitting).
- **Data collection is required or optional**: Email/password required to create an account;
  a player's real name is optional (PlayerTag is the default identity).

**Do not opt into Google Play's "Designed for Families" program.** Same reasoning as the Apple
Kids Category above -- this app's actual users are adults. Under Play's **Target audience and
content** section, set the target audience to **18 and older / Adults**, even though the data
concerns minors. Opting into Families would impose Play's stricter ads/analytics/data rules meant
for apps children directly use, which doesn't match how this app actually works, and would likely
cause a policy mismatch during review.

---

## 4. COPPA -- why this app is likely out of scope (confirm with a lawyer)

COPPA restricts operators of services **directed to children under 13**, or with actual knowledge
of collecting personal info directly from a child under 13. In this app:

- Children never create an account, sign in, or submit anything themselves.
- Every piece of information about a player is entered by the adult (parent/guardian, or a coach
  before a parent claims the roster spot) who registers them.
- The app's UI, account flows, and marketing are all coach/parent-facing, not child-facing.

This is analogous to a school's parent portal or a youth-sports registration site -- generally
understood to fall outside COPPA's direct-collection trigger, because the child isn't the one
interacting with the service. That said, this app **does** handle data connected to minors at
scale, which is exactly the kind of thing worth a real (cheap, one-time) attorney consult before
public launch -- flagging it here rather than asserting it as settled, same spirit as the
trademark note in the spec (Section 12).

---

## 5. Still blocked on accounts (nothing to do here yet)

- Actually filling in and submitting these forms (needs the Apple Developer Program + Google Play
  console accounts).
- Screenshots, app description, keywords, support URL -- straightforward once you're in the
  consoles; happy to help draft the store listing copy whenever you're ready.
