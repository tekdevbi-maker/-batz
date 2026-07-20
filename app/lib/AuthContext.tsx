import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { usePathname, useRouter, useGlobalSearchParams } from "expo-router";
import * as Linking from "expo-linking";
import { supabase } from "./supabase";

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  isPasswordRecovery: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, metadata?: { firstName: string; lastName: string }) => Promise<string>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  completePasswordReset: (newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      if (event === "PASSWORD_RECOVERY") setIsPasswordRecovery(true);
      if (event === "SIGNED_OUT") setIsPasswordRecovery(false);
    });
    return () => subscription.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setIsAdmin(false);
      return;
    }
    supabase
      .from("app_admin")
      .select("user_id")
      .eq("user_id", session.user.id)
      .maybeSingle()
      .then(({ data }) => setIsAdmin(!!data));
  }, [session]);

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async function signUp(
    email: string,
    password: string,
    metadata?: { firstName: string; lastName: string }
  ): Promise<string> {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: metadata ? { data: { first_name: metadata.firstName, last_name: metadata.lastName } } : undefined,
    });
    if (error) throw error;
    if (!data.user) throw new Error("Sign up did not return a user.");
    return data.user.id;
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }

  async function requestPasswordReset(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: Linking.createURL("/reset-password"),
    });
    if (error) throw error;
  }

  async function completePasswordReset(newPassword: string) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
    setIsPasswordRecovery(false);
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        loading,
        isAdmin,
        isPasswordRecovery,
        signIn,
        signUp,
        signOut,
        requestPasswordReset,
        completePasswordReset,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

// Redirects to /login when there's no session. Screens that need a signed-in
// user call this instead of each rolling their own guard. Carries the
// screen the user was trying to reach as a returnTo param, so login.tsx can
// send them back after signing in instead of stranding them on Home --
// this matters for flows like /shared-csv (opening a CSV from the OS
// "Open With" menu while logged out) where losing the original params
// means having to redo the OS-level action.
export function useRequireAuth(): AuthContextValue {
  const auth = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const params = useGlobalSearchParams<Record<string, string>>();
  useEffect(() => {
    if (!auth.loading && !auth.session) {
      const query = new URLSearchParams(params).toString();
      const returnTo = query ? `${pathname}?${query}` : pathname;
      router.replace({ pathname: "/login", params: { returnTo } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.loading, auth.session, router, pathname]);
  return auth;
}
