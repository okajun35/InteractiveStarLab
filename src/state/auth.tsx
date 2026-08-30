import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "../cloud/client";
import { createAnonymousSessionBootstrap, type AnonymousAuthApi } from "../cloud/anonymousIdentity";

export interface AuthState {
  cloudConfigured: boolean;
  loading: boolean;
  session: Session | null;
  userId: string | null;
  error: string | null;
  clearError: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

function friendlyAuthError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Cloud接続に失敗しました。この端末ではローカル保存を続けます。";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const client = useMemo<SupabaseClient | null>(() => getSupabaseClient(), []);
  const anonymousAuth = useMemo<AnonymousAuthApi | null>(() => {
    if (client === null) return null;
    return {
      getSession: () => client.auth.getSession(),
      signInAnonymously: () => client.auth.signInAnonymously(),
    };
  }, [client]);
  const bootstrapAnonymousSession = useMemo(
    () => anonymousAuth === null ? null : createAnonymousSessionBootstrap(anonymousAuth),
    [anonymousAuth],
  );
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (client === null || bootstrapAnonymousSession === null) {
      setLoading(false);
      return;
    }
    let disposed = false;
    setLoading(true);
    void bootstrapAnonymousSession().then((nextSession) => {
      if (disposed) return;
      setSession(nextSession);
      setError(null);
      setLoading(false);
    }).catch((sessionError: unknown) => {
      if (disposed) return;
      setError(friendlyAuthError(sessionError));
      setLoading(false);
    });

    const { data } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (!disposed) {
        setSession(nextSession);
        if (nextSession !== null) setError(null);
        setLoading(false);
      }
    });
    return () => {
      disposed = true;
      data.subscription.unsubscribe();
    };
  }, [bootstrapAnonymousSession, client]);

  const value = useMemo<AuthState>(() => ({
    cloudConfigured: client !== null,
    loading,
    session,
    userId: session?.user.id ?? null,
    error,
    clearError: () => setError(null),
  }), [client, loading, session, error]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (context === null) throw new Error("useAuth must be used inside <AuthProvider>");
  return context;
}
