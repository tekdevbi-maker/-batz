import { ScrollView, Text, StyleSheet } from "react-native";
import { colors } from "../lib/theme";

// Companion to privacy-policy.tsx (Sprint 10, spec Section 10/13) --
// same caveat applies: solid first draft, have it reviewed by a lawyer
// (and fill in GOVERNING_LAW) before real users onboard.
const EFFECTIVE_DATE = "July 20, 2026";
const CONTACT_EMAIL = "tekdevbi@gmail.com";
const GOVERNING_LAW = "[State/Country to be specified]";

const SECTIONS: Array<{ heading: string; body: string }> = [
  {
    heading: "Agreement to terms",
    body:
      "By creating an account or using @Batz, you agree to these Terms of Service. If you don't agree, please " +
      "don't use the app.",
  },
  {
    heading: "Independent product",
    body:
      "@Batz is an independently developed app for tracking little league hitting statistics. It is not " +
      "affiliated with, endorsed by, or sponsored by GameChanger, DICK'S Sporting Goods, or any league, team, " +
      "or sanctioning body referenced within it. Team, league, and division names entered by users belong to " +
      "those organizations, not to @Batz.",
  },
  {
    heading: "Eligibility and accounts",
    body:
      "You must be at least 18 years old to create an @Batz account. @Batz accounts are for coaches and " +
      "parents/guardians -- players themselves do not create accounts. You're responsible for keeping your " +
      "login credentials secure and for all activity under your account. Provide accurate information when " +
      "registering as a coach or registering a player.",
  },
  {
    heading: "Accountability for player information",
    body:
      "Whoever registers a player in @Batz is the accountable party for that player's account-related " +
      "decisions -- including their visibility setting (Public/Private), display name, and PlayerTag. By " +
      "registering a player, you confirm you are that player's parent or legal guardian, or are otherwise " +
      "authorized to act on their behalf (e.g. as their coach, where no parent has yet claimed the player).",
  },
  {
    heading: "Acceptable use",
    body:
      "Don't: impersonate another person or team; upload stat data you know to be false or falsified; harass, " +
      "bully, or misuse the Block/Report feature to target another user in bad faith; attempt to access data " +
      "you're not authorized to view or to circumvent the app's access controls; or use the app for any " +
      "unlawful purpose. We may suspend or terminate accounts that violate this section.",
  },
  {
    heading: "Content you provide",
    body:
      "You retain ownership of the information you submit (e.g. a player's name, a Customer Care request). By " +
      "submitting it, you grant @Batz the license needed to store, process, and display it as intended by the " +
      "app's features (e.g. showing stats to other users per the visibility rules described in our Privacy Policy).",
  },
  {
    heading: "Imported data",
    body:
      "Game statistics are imported from CSV files you export from GameChanger or a similar service. You're " +
      "responsible for ensuring you're authorized to export and import that data (e.g. as the team's coach). " +
      "@Batz is not responsible for the accuracy of data as exported by a third-party service.",
  },
  {
    heading: "No warranty",
    body:
      "@Batz is provided \"as is\" and \"as available,\" without warranties of any kind, express or implied. We " +
      "don't guarantee the app will be uninterrupted, error-free, or that statistics will always be accurate " +
      "(e.g. due to an import error or a mistaken CSV upload).",
  },
  {
    heading: "Limitation of liability",
    body:
      "To the fullest extent permitted by law, @Batz and its developer aren't liable for any indirect, " +
      "incidental, or consequential damages arising from your use of the app, including disputes arising from " +
      "how statistics are used (e.g. in all-star selection decisions) -- @Batz provides the data; decisions " +
      "made using it are outside our control.",
  },
  {
    heading: "Termination",
    body:
      "You may stop using @Batz and request account deletion at any time by contacting " + CONTACT_EMAIL + ". " +
      "We may suspend or terminate an account that violates these terms or poses a risk to other users, " +
      "particularly where a player's safety or privacy is concerned.",
  },
  {
    heading: "Changes to these terms",
    body:
      "If these terms change materially, we'll update the effective date below and, where appropriate, notify " +
      "users in-app. Continued use after a change means you accept the updated terms.",
  },
  {
    heading: "Governing law",
    body: "These terms are governed by the laws of " + GOVERNING_LAW + ", without regard to conflict-of-law principles.",
  },
  {
    heading: "Contact us",
    body: "Questions about these terms? Email " + CONTACT_EMAIL + ".",
  },
];

export default function TermsOfServiceScreen() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Terms of Service</Text>
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
  title: { fontSize: 24, fontWeight: "700", color: colors.textPrimary },
  effectiveDate: { color: colors.textSecondary, fontSize: 13, marginBottom: 4 },
  section: { fontSize: 14, lineHeight: 21, color: colors.textPrimary },
  heading: { fontSize: 16, fontWeight: "700", color: colors.textPrimary },
});
