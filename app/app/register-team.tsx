import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useRequireAuth } from "../lib/AuthContext";
import { resetDevWizardState, updateDevWizardState } from "../lib/devRegistrationWizard";
import { colors } from "../lib/theme";

// "Add a Team I Coach" -- for a coach who already has an account (e.g.
// one kid in Majors, another in Minors) and needs to become Head Coach of
// a second, separate team. Reuses the exact same wizard as brand-new
// registration (dev-register-league.tsx onward), just entered with
// skipAccountCreation set and identity pre-filled from the existing
// session, so dev-register-confirm.tsx uses this session instead of
// calling signUp() again. router.replace (not push) so this screen never
// sits in the back stack -- "Back" from the league page goes straight to
// Home, not back into a redirect loop here.
export default function RegisterTeamScreen() {
  const router = useRouter();
  const { session } = useRequireAuth();

  useEffect(() => {
    if (!session) return;
    resetDevWizardState();
    updateDevWizardState({
      firstName: (session.user.user_metadata?.first_name as string | undefined) ?? "",
      lastName: (session.user.user_metadata?.last_name as string | undefined) ?? "",
      skipAccountCreation: true,
    });
    router.replace("/dev-register-league");
  }, [session, router]);

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background }}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}
