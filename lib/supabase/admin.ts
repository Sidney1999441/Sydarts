import { createClient } from "@supabase/supabase-js";
import { assertSupabaseBackend } from "@/lib/backend/provider";
import { getSupabaseServiceRoleKey, getSupabaseUrl } from "@/lib/env";

export function createSupabaseAdminClient() {
  assertSupabaseBackend("Supabase admin client");
  const serviceRoleKey = getSupabaseServiceRoleKey();

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for privileged writes.");
  }

  return createClient(getSupabaseUrl(), serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}
