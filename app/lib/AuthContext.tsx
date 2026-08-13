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
  signUp: (
    email: string,
    password: string,
    metadata?: { firstName: string; lastName: string }
  ) => Promise<string>;
  verifySignUpCode: (email: string, code: string) => Promise<void>;
  resendSignUpCode: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  completePasswordReset: (newPassword: string) => Promise<void>;
  impersonatingEmail: string | null;
  impersonate: (targetEmail: string) => Promise<void>;
  returnToAdmin: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  // The admin's own session, stashed while a target user's session is
  // active, so "Return to Admin" is a restore rather than a re-login.
  const [adminSession, setAdminSession] = useState<Session | null>(null);
  const [impersonatingEmail, setImpersonatingEmail] = useState<string | null>(null);

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
    // signUp() is only ever called after the caller has already shown
    // AgeAttestationGate and the user confirmed -- stamping it here (rather
    // than trusting each call site) guarantees every account, regardless of
    // entry point, carries the same attestation record.
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          ...(metadata ? { first_name: metadata.firstName, last_name: metadata.lastName } : {}),
          age_attested_at: new Date().toISOString(),
        },
      },
    });
    if (error) throw error;
    if (!data.user) throw new Error("Sign up did not return a user.");
    return data.user.id;
  }

  // Confirms the 6-digit code emailed at sign-up (Supabase Auth's built-in
  // OTP, type "signup") -- success both marks the email verified AND
  // returns a real session, so this is also what actually logs the user
  // in for the first time (signUp() itself no longer does, now that email
  // confirmation is required).
  async function verifySignUpCode(email: string, code: string) {
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "signup" });
    if (error) throw error;
  }

  async function resendSignUpCode(email: string) {
    const { error } = await supabase.auth.resend({ type: "signup", email });
    if (error) throw error;
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

  // Admin-only: swaps the active session to the target user's, via the
  // admin-impersonate Edge Function (the only place the service role key
  // is ever used). Stashes the current (admin) session first so
  // returnToAdmin() can restore it without a re-login.
  async function impersonate(targetEmail: string) {
    if (!session) throw new Error("Not signed in.");
    const { data, error } = await supabase.functions.invoke("admin-impersonate", {
      body: { targetEmail },
    });
    if (error) {
      // Supabase's client doesn't unwrap a non-2xx function response body
      // automatically -- the real reason (e.g. "user_not_found") is JSON
      // on the raw Response it attaches as `.context`, not on `error`
      // itself, which otherwise only ever says "non-2xx status code".
      const context = (error as { context?: Response }).context;
      const body = await context?.json().catch(() => null);
      throw new Error(body?.detail ?? body?.error ?? error.message);
    }
    if (data?.error) throw new Error(data.error);

    setAdminSession(session);
    const { error: setError } = await supabase.auth.setSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
    });
    if (setError) throw setError;
    setImpersonatingEmail(data.email);
  }

  async function returnToAdmin() {
    if (!adminSession) return;
    const { error } = await supabase.auth.setSession({
      access_token: adminSession.access_token,
      refresh_token: adminSession.refresh_token,
    });
    if (error) throw error;
    setAdminSession(null);
    setImpersonatingEmail(null);
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
        verifySignUpCode,
        resendSignUpCode,
        signOut,
        requestPasswordReset,
        completePasswordReset,
        impersonatingEmail,
        impersonate,
        returnToAdmin,
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
