import { ScrollView, Text, StyleSheet } from "react-native";
import { colors } from "../lib/theme";
import SafeTopSpacer from "../components/SafeTopSpacer";

// Sprint 10 (spec Section 10/13): required by both App Store and Play
// Store before submission, "given the app handles data connected to
// minors." Reflects only what this app actually collects -- push
// notifications and phone/location data haven't been built, so this
// deliberately doesn't claim to collect them. Team logo upload was added
// later; the "Information we collect" section below covers it.
// Replace EFFECTIVE_DATE and CONTACT_EMAIL, and have this reviewed by a
// lawyer before real users onboard -- this is a solid first draft, not
// legal advice.
const EFFECTIVE_DATE = "August 14, 2026";
const CONTACT_EMAIL = "atbatz@brain-spell.com";

const SECTIONS: Array<{ heading: string; body: string }> = [
  {
    heading: "Who we are",
    body:
      "@Batz is an independent app for tracking little league hitting statistics. " +
      "It is not affiliated with, endorsed by, or connected to any third-party scorekeeping service. " +
      "This policy explains what information @Batz collects, how it's used, and the choices available to you.",
  },
  {
    heading: "Children's privacy",
    body:
      "@Batz accounts require the account holder to be at least 13 years old -- this is confirmed with an " +
      "age attestation at sign-up, before an account is ever created, and the email address used to sign up " +
      "must be confirmed with a verification code before the account can be used. Players themselves do not create accounts " +
      "and do not provide any information directly to @Batz, regardless of age. All information about a player " +
      "(name, uniform number, stats) is entered by the coach or parent/guardian who registers or imports that " +
      "player. Whoever registers a player is the accountable party for that player's account-related decisions -- " +
      "including their visibility setting, display name, and the parental-consent step described below. If you " +
      "believe a player's information was added without appropriate parental involvement, contact us at " +
      CONTACT_EMAIL + " and we will investigate and remove it if warranted.",
  },
  {
    heading: "Locked players and parental consent",
    body:
      "A player imported from a game file starts in a locked state, owned by the team's Head Coach, until a " +
      "parent/guardian claims them. While locked, a player's name and uniform number are hidden from everyone " +
      "except that team's coaching staff -- everyone else sees only a generic identifier such as " +
      "\"Rays Player 17\" and their stats show as blank. The player never appears on any leaderboard while " +
      "locked.\n\n" +
      "A player is unlocked only after an explicit parental-consent step: either a parent/guardian requests to " +
      "claim the player and the coach approves it, or a coach offers the player to a specific team member who " +
      "must then agree before anything changes. Either way, the parent/guardian must scroll through and agree to " +
      "a consent screen -- itemizing what information is collected, how it's used, how long it's kept, and their " +
      "rights -- before unlocking takes effect, and receives a confirmation email immediately afterward with a " +
      "window to flag it if the agreement wasn't actually theirs. A parent/guardian can unlink a player at " +
      "any time afterward, returning them to the locked state; a team's Head Coach can also unlink a player " +
      "unilaterally.\n\n" +
      "A parent/guardian can also set a player's visibility to \"Only Me\" from Player Settings: the player's " +
      "card (name, photo, uniform number) remains visible to other users, but hitting statistics are replaced " +
      "with a placeholder for everyone except that parent/guardian.",
  },
  {
    heading: "Information we collect",
    body:
      "Account information: the email address and password you use to sign in (your password is handled " +
      "entirely by our authentication provider, Supabase, and is never visible to us in plain text), and an " +
      "age attestation timestamp confirming you were 13 or older when the account was created.\n\n" +
      "Coach information: first and last name, entered when registering as a coach.\n\n" +
      "Player information: first and last name (optional -- a player can be identified only by their PlayerTag, " +
      "see below), uniform number, and hitting statistics imported from a CSV export the coach uploads.\n\n" +
      "Team logo: a coach may optionally upload an image to display as their team's logo. This is the only " +
      "photo-type data @Batz collects, and it's a team logo, not a photo of any person.\n\n" +
      "User-generated content: text you submit through the Block/Report feature or a Customer Care request.\n\n" +
      "We do not collect phone numbers, home addresses, photos of people, precise location, payment information, " +
      "or any government-issued ID. We do not use advertising or analytics tracking SDKs.",
  },
  {
    heading: "PlayerTag and stat visibility",
    body:
      "Once unlocked (claimed), a player is identified in the app by a PlayerTag (a pseudonym) rather than " +
      "their real name by default. A player's real name is never shown in search results, leaderboards, or the " +
      "activity feed, unless that player's parent/guardian explicitly chooses to reveal it in Settings. Before " +
      "being claimed, see \"Locked players and parental consent\" above -- the player's real name is hidden " +
      "entirely, not just pseudonymized.\n\n" +
      "Hitting statistics (current and past season) for a claimed, unlocked player are visible to any signed-in " +
      "@Batz user by design -- this is intentional and central to the app's purpose of making performance " +
      "auditable rather than hidden behind a single coach's view. A parent/guardian can additionally set a " +
      "player's profile to Private, which restricts their Player Profile to that player's own team roster (up " +
      "to 100 members: coaches, parents, and followers who joined via that team's link). A Private player's row " +
      "still appears on leaderboards, but their name is not a link there, and they're excluded from search " +
      "results entirely. Statistics are never accessible outside the app (no public web page) and require " +
      "signing in to view.",
  },
  {
    heading: "How we use information",
    body:
      "To operate the app: storing and displaying stats, search, following, leaderboards, and the activity feed.\n\n" +
      "To communicate with you: password reset emails and responses to Customer Care requests.\n\n" +
      "To maintain safety: reviewing Block/Report submissions.\n\n" +
      "We do not sell personal information, and we do not share it with third parties for their own marketing purposes.",
  },
  {
    heading: "Third-party service providers",
    body:
      "@Batz is built on Supabase (database, authentication, and hosting) and Resend (delivery of account " +
      "verification, password-recovery, and consent-confirmation emails). These providers process data solely " +
      "to provide their infrastructure service to @Batz and are not permitted to use it for their own purposes. " +
      "@Batz does not use advertising or analytics tracking SDKs; if that ever changes, any such integration " +
      "will be configured as child-directed (no behavioral targeting or device-level tracking).",
  },
  {
    heading: "Data retention and deletion",
    body:
      "Information is retained as long as the associated account or team is active. An unclaimed (locked) " +
      "player's identifying information -- name, photo, and uniform number -- is automatically and permanently " +
      "deleted once the coach marks that team's season complete; only an anonymized, non-attributable team " +
      "total of that player's statistics is kept afterward, and the player can no longer be claimed. A claimed " +
      "player's career statistics are retained for as long as their profile remains claimed. You can delete " +
      "your own account at any time from User Settings, which removes your personal account information. To " +
      "request deletion of a specific player's information, contact us at " + CONTACT_EMAIL + ".",
  },
  {
    heading: "Your choices",
    body:
      "Parents/guardians can, at any time from Player Settings: set a player's visibility to Public or Private, " +
      "customize or regenerate a player's PlayerTag, and choose whether to reveal the player's real name. " +
      "Any user can request access to, correction of, or deletion of their own account information by " +
      "contacting " + CONTACT_EMAIL + ".",
  },
  {
    heading: "Security",
    body:
      "Access to data is enforced through database-level row security policies, so that, for example, a " +
      "Private player's information is only ever returned to users who are permitted to see it -- this is " +
      "enforced by the database itself, not just by app-side checks. Passwords are managed by Supabase Auth " +
      "and are never stored or visible to us in plain text.",
  },
  {
    heading: "Changes to this policy",
    body:
      "If this policy changes materially, we'll update the effective date below and, where appropriate, notify " +
      "users in-app.",
  },
  {
    heading: "Contact us",
    body: "Questions about this policy or your information? Email " + CONTACT_EMAIL + ".",
  },
];

export default function PrivacyPolicyScreen() {
  return (
    <>
      <SafeTopSpacer />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Privacy Policy</Text>
        <Text style={styles.effectiveDate}>Effective {EFFECTIVE_DATE}</Text>
        {SECTIONS.map((section) => (
          <Text key={section.heading} style={styles.section}>
            <Text style={styles.heading}>{section.heading}{"\n"}</Text>
            {section.body}
          </Text>
        ))}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 48, gap: 16, backgroundColor: colors.background },
  title: { fontSize: 26, fontFamily: "Montserrat_700Bold", color: colors.textPrimary },
  effectiveDate: { color: colors.textSecondary, fontSize: 14, fontFamily: "Montserrat_400Regular", marginBottom: 4 },
  section: { fontSize: 15, fontFamily: "Montserrat_400Regular", lineHeight: 21, color: colors.textPrimary },
  heading: { fontSize: 18, fontFamily: "Montserrat_700Bold", color: colors.textPrimary },
});
