import type { Session } from "@supabase/supabase-js";
import {
  createAnonymousSessionBootstrap,
  type AnonymousAuthApi,
} from "../src/cloud/anonymousIdentity";
import { resolveCloudPersistenceMode } from "../src/cloud/authMode";

let failures = 0;
function check(name: string, condition: boolean): void {
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}`);
  if (!condition) failures += 1;
}

function session(id: string): Session {
  return { user: { id } } as Session;
}

function fakeAuth(options: { existing?: Session | null; signIn?: Session | null; failGet?: boolean } = {}) {
  let getCalls = 0;
  let signInCalls = 0;
  const auth: AnonymousAuthApi = {
    async getSession() {
      getCalls += 1;
      if (options.failGet) return { data: { session: null }, error: new Error("session probe failed") };
      return { data: { session: options.existing ?? null }, error: null };
    },
    async signInAnonymously() {
      signInCalls += 1;
      return { data: { session: options.signIn ?? session("anonymous-1") }, error: null };
    },
  };
  return { auth, calls: () => ({ getCalls, signInCalls }) };
}

check("CLOUD-ANON-1: missing cloud config stays local", resolveCloudPersistenceMode(false, null) === "local");
check("CLOUD-ANON-1: configured without a session remains local during bootstrap", resolveCloudPersistenceMode(true, null) === "local");
check("CLOUD-ANON-1: an anonymous session enables cloud mode", resolveCloudPersistenceMode(true, "anonymous-1") === "cloud");

const existing = fakeAuth({ existing: session("restored-anonymous") });
const existingBootstrap = createAnonymousSessionBootstrap(existing.auth);
const restored = await existingBootstrap();
check("CLOUD-ANON-2: existing session is reused", restored.user.id === "restored-anonymous");
check("CLOUD-ANON-2: existing session does not create another user", existing.calls().signInCalls === 0);

const fresh = fakeAuth();
const freshBootstrap = createAnonymousSessionBootstrap(fresh.auth);
const [createdA, createdB] = await Promise.all([freshBootstrap(), freshBootstrap()]);
check("CLOUD-ANON-3: missing session creates an anonymous session", createdA.user.id === "anonymous-1");
check("CLOUD-ANON-3: concurrent bootstrap calls share one request", createdA === createdB && fresh.calls().getCalls === 1 && fresh.calls().signInCalls === 1);

const failed = fakeAuth({ failGet: true });
const failedBootstrap = createAnonymousSessionBootstrap(failed.auth);
let failedOnce = false;
try {
  await failedBootstrap();
} catch {
  failedOnce = true;
}
check("CLOUD-ANON-4: bootstrap exposes session errors", failedOnce);

if (failures > 0) process.exit(1);
console.log("\nAll anonymous cloud identity checks passed.");
