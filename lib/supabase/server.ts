import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { assertSupabaseBackend } from "@/lib/backend/provider";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/env";
import { createTimedSupabaseFetch } from "@/lib/supabase/fetch";

type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

type ServerClientOptions = {
  timeoutMs?: number | false;
};

const DEFAULT_SERVER_CLIENT_TIMEOUT_MS = 10000;

export async function createSupabaseServerClient(options: ServerClientOptions = {}) {
  assertSupabaseBackend("Supabase server client");
  const cookieStore = await cookies();
  const timeoutMs =
    options.timeoutMs === undefined ? DEFAULT_SERVER_CLIENT_TIMEOUT_MS : options.timeoutMs;
  const global = timeoutMs
    ? {
        fetch: createTimedSupabaseFetch(timeoutMs)
      }
    : undefined;

  return createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    global,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot set cookies; middleware and actions can.
        }
      }
    }
  });
}
