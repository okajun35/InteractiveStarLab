import type { Session } from "@supabase/supabase-js";

export interface AnonymousAuthApi {
  getSession: () => Promise<{ data: { session: Session | null }; error: Error | null }>;
  signInAnonymously: () => Promise<{ data: { session: Session | null }; error: Error | null }>;
}

/**
 * Bootstraps one anonymous Supabase session per client instance. The returned
 * function shares an in-flight request so React Strict Mode cannot create two
 * anonymous users during the initial render cycle.
 */
export function createAnonymousSessionBootstrap(auth: AnonymousAuthApi): () => Promise<Session> {
  let pending: Promise<Session> | null = null;

  return () => {
    if (pending !== null) return pending;
    const request = (async () => {
      const current = await auth.getSession();
      if (current.error) throw current.error;
      if (current.data.session !== null) return current.data.session;

      const created = await auth.signInAnonymously();
      if (created.error) throw created.error;
      if (created.data.session === null) throw new Error("Supabase did not return an anonymous session");
      return created.data.session;
    })();
    const tracked = request.then(
      (value) => {
        if (pending === tracked) pending = null;
        return value;
      },
      (error: unknown) => {
        if (pending === tracked) pending = null;
        throw error;
      },
    );
    pending = tracked;
    return tracked;
  };
}
