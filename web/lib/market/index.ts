// One store per page: Supabase when both public keys are set at build time, otherwise this browser's own storage.
import { createCloudStore } from "./cloud.ts";
import { createLocalStore, seedDemoMakers } from "./local.ts";
import type { Store } from "./types.ts";

export { MarketError, STATUS_LABEL } from "./types.ts";
export type { Craft, DesignRequest, DesignSnapshot, Message, MessageKind, Profile, RequestStatus, Role, SignUp, Store } from "./types.ts";
export { MISSING_OPTIONS, missingLabel } from "./missing.ts";
export { CHECK_EMAIL, LINK_EXPIRED, MAX_BODY } from "./rules.ts";

let store: Store | undefined;

/** Created on first call, never at import, so it is safe for server rendering and client components alike. */
export function getStore(): Store {
  if (store) return store;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && key) {
    store = createCloudStore(url, key);
  } else {
    const local = createLocalStore();
    void seedDemoMakers(local);
    store = local;
  }
  return store;
}
