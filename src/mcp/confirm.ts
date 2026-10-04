/**
 * Undo-token registry for consequential tool actions. A tool that just mutated
 * state issues a token carrying a way to put the state back; the same tool later
 * accepts that token to run the reversal. Tokens are single-use and expire —
 * an agent holding one cannot be sure the state it would restore is still the
 * state on the screen, so a token is only good for a short window.
 *
 * The clock is injectable so verification can expire tokens deterministically.
 */

export const DEFAULT_UNDO_TTL_MS = 5 * 60_000;

export interface UndoIssue {
  undoToken: string;
  undoExpiresAt: string;
}

export interface UndoRegistry {
  issue(description: string, run: () => unknown | Promise<unknown>, ttlMs?: number): UndoIssue;
  consume(token: string): Promise<unknown>;
}

interface UndoEntry {
  description: string;
  expiresAtMs: number;
  run: () => unknown | Promise<unknown>;
}

export function createUndoRegistry(options?: { now?: () => number }): UndoRegistry {
  const now = options?.now ?? (() => Date.now());
  const entries = new Map<string, UndoEntry>();
  let counter = 0;

  return {
    issue(description, run, ttlMs = DEFAULT_UNDO_TTL_MS): UndoIssue {
      counter += 1;
      const token = `undo-${counter}`;
      entries.set(token, { description, expiresAtMs: now() + ttlMs, run });
      return {
        undoToken: token,
        undoExpiresAt: new Date(now() + ttlMs).toISOString(),
      };
    },
    async consume(token: string): Promise<unknown> {
      const entry = entries.get(token);
      if (entry === undefined || entry.expiresAtMs <= now()) {
        entries.delete(token);
        const error = new Error(
          `No action can be undone with that token: it is unknown, already spent, or expired.`,
        );
        error.name = "NothingToUndoError";
        throw error;
      }
      entries.delete(token);
      return entry.run();
    },
  };
}
