import { ScrollView, Text, StyleSheet } from "react-native";
import { colors } from "../lib/theme";

// Sprint 10 (spec Section 10/13): required by both App Store and Play
// Store before submission, "given the app handles data connected to
// minors." Reflects only what this app actually collects -- push
// notifications and phone/location data haven't been built, so this
// deliberately doesn't claim to collect them. Team logo upload was added
// later; the "Information we collect" section below covers it.
// Replace EFFECTIVE_DATE and CONTACT_EMAIL, and have this reviewed by a
// lawyer before real users onboard -- this is a solid first draft, not
// legal advice.
const EFFECTIVE_DATE = "July 20, 2026";
const CONTACT_EMAIL = "tekdevbi@gmail.com";

const SECTIONS: Array<{ heading: string; body: string }> = [
  {
    heading: "Who we are",
    body:
      "@Batz is an independent app for tracking little league hitting statistics. " +
      "It is not affiliated with, endorsed by, or connected to GameChanger or DICK'S Sporting Goods. " +
      "This policy explains what information @Batz collects, how it's used, and the choices available to you.",
  },
  {
    heading: "Children's privacy",
    body:
      "@Batz is designed for use by adults -- coaches and parents/guardians -- on behalf of youth players. " +
      "Players do not create their own accounts and do not provide any information directly to @Batz. " +
      "All account creation, and all information about a player (name, uniform number, stats), is entered by " +
      "the coach or parent/guardian who registers that player. Whoever registers a player is the accountable " +
      "party for that player's account-related decisions -- including their visibility setting and display name. " +
      "If you believe a player's information was added without appropriate parental involvement, contact us at " +
      CONTACT_EMAIL + " and we will investigate and remove it if warranted.",
  },
  {
    heading: "Information we collect",
    body:
      "Account information: the email address and password you use to sign in (your password is handled " +
      "entirely by our authentication provider, Supabase, and is never visible to us in plain text).\n\n" +
      "Coach information: first and last name, entered when registering as a coach.\n\n" +
      "Player information: first and last name (optional -- a player can be identified only by their PlayerTag, " +
      "see below), uniform number, and hitting statistics imported from a GameChanger CSV export the coach uploads.\n\n" +
      "Team logo: a coach may optionally upload an image to display as their team's logo. This is the only " +
      "photo-type data @Batz collects, and it's a team logo, not a photo of any person.\n\n" +
      "User-generated content: text you submit through the Block/Report feature or a Customer Care request.\n\n" +
      "We do not collect phone numbers, home addresses, photos of people, precise location, payment information, " +
      "or any government-issued ID. We do not use advertising or analytics tracking SDKs.",
  },
  {
    heading: "PlayerTag and stat visibility",
    body:
      "By default, a player is identified in the app by a PlayerTag (a pseudonym) rather than their real name. " +
      "A player's real name is only ever shown once, during the registration/claim process, to the parent " +
      "completing it -- never in search results, leaderboards, or the activity feed, unless that player's " +
      "parent/guardian explicitly chooses to reveal it in Settings.\n\n" +
      "Hitting statistics (current and past season) are visible to any signed-in @Batz user by design -- this " +
      "is intentional and central to the app's purpose of making performance auditable rather than hidden " +
      "behind a single coach's view. A parent/guardian can additionally set a player's profile to Private, " +
      "which restricts it to coaches and parents within that player's League/Division for the current season. " +
      "Statistics are never accessible outside the app (no public web page) and require signing in to view.",
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
      "@Batz is built on Supabase (database, authentication, and hosting) and, for future account-recovery email " +
      "delivery, a transactional email provider. These providers process data solely to provide their " +
      "infrastructure service to @Batz and are not permitted to use it for their own purposes.",
  },
  {
    heading: "Data retention and deletion",
    body:
      "Information is retained as long as the associated account or team is active. To request deletion of an " +
      "account or a player's information, contact us at " + CONTACT_EMAIL + ". Deleting a player removes their " +
      "profile; the underlying game stats remain as part of the team's historical record but are no longer " +
      "linked to a claimed player.",
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
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 48, gap: 16, backgroundColor: colors.background },
  title: { fontSize: 26, fontWeight: "700", color: colors.textPrimary },
  effectiveDate: { color: colors.textSecondary, fontSize: 14, marginBottom: 4 },
  section: { fontSize: 15, lineHeight: 21, color: colors.textPrimary },
  heading: { fontSize: 18, fontWeight: "700", color: colors.textPrimary },
});
