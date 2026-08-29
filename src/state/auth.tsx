import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "../cloud/client";

export interface AuthState {
  cloudConfigured: boolean;
  loading: boolean;
  session: Session | null;
  userId: string | null;
  email: string | null;
  error: string | null;
  signIn: (email: string, password: string) => Promise<boolean>;
  signOut: () => Promise<boolean>;
  clearError: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

function friendlyAuthError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "ログインに失敗しました。設定と入力内容を確認してください。";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const client = useMemo<SupabaseClient | null>(() => getSupabaseClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (client === null) {
      setLoading(false);
      return;
    }
    let disposed = false;
    void client.auth.getSession().then(({ data, error: sessionError }) => {
      if (disposed) return;
      if (sessionError) setError(friendlyAuthError(sessionError));
      setSession(data.session);
      setLoading(false);
    }).catch((sessionError: unknown) => {
      if (disposed) return;
      setError(friendlyAuthError(sessionError));
      setLoading(false);
    });

    const { data } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (!disposed) {
        setSession(nextSession);
        setLoading(false);
      }
    });
    return () => {
      disposed = true;
      data.subscription.unsubscribe();
    };
  }, [client]);

  const signIn = useCallback(async (email: string, password: string): Promise<boolean> => {
    if (client === null) {
      setError("Supabaseが設定されていないため、クラウド保存を利用できません。");
      return false;
    }
    if (!email.trim() || !password) {
      setError("EmailとPasswordを入力してください。");
      return false;
    }
    setError(null);
    setLoading(true);
    try {
      const result = await client.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) {
        setError(friendlyAuthError(result.error));
        setLoading(false);
        return false;
      }
      setSession(result.data.session);
      setLoading(false);
      return true;
    } catch (signInError) {
      setError(friendlyAuthError(signInError));
      setLoading(false);
      return false;
    }
  }, [client]);

  const signOut = useCallback(async (): Promise<boolean> => {
    if (client === null) {
      setSession(null);
      return true;
    }
    setError(null);
    try {
      const result = await client.auth.signOut();
      if (result.error) {
        setError(friendlyAuthError(result.error));
        return false;
      }
      setSession(null);
      return true;
    } catch (signOutError) {
      setError(friendlyAuthError(signOutError));
      return false;
    }
  }, [client]);

  const value = useMemo<AuthState>(() => ({
    cloudConfigured: client !== null,
    loading,
    session,
    userId: session?.user.id ?? null,
    email: session?.user.email ?? null,
    error,
    signIn,
    signOut,
    clearError: () => setError(null),
  }), [client, loading, session, error, signIn, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (context === null) throw new Error("useAuth must be used inside <AuthProvider>");
  return context;
}
