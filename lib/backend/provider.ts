export const backendProviders = ["supabase", "tencent"] as const;

export type BackendProvider = (typeof backendProviders)[number];

export type BackendCapability =
  | "auth"
  | "database"
  | "storage"
  | "matchSettlement"
  | "cloudFunctions";

export type BackendReadiness = {
  provider: BackendProvider;
  enabled: boolean;
  capabilities: Record<BackendCapability, boolean>;
  missingEnv: string[];
};

const providerEnv = "CODL_BACKEND_PROVIDER";

function normalizeProvider(value: string | undefined): BackendProvider {
  if (value === "tencent") return "tencent";
  return "supabase";
}

function missing(keys: string[]) {
  return keys.filter((key) => !process.env[key]);
}

export function getBackendProvider(): BackendProvider {
  return normalizeProvider(process.env[providerEnv]);
}

export function getBackendReadiness(): BackendReadiness {
  const provider = getBackendProvider();

  if (provider === "tencent") {
    const missingEnv = missing([
      "CLOUDBASE_ENV_ID",
      "CLOUDBASE_SERVICE_NAME",
      "TENCENT_POSTGRES_URL",
      "TENCENT_COS_BUCKET",
      "TENCENT_COS_REGION"
    ]);

    return {
      provider,
      enabled: missingEnv.length === 0,
      missingEnv,
      capabilities: {
        auth: false,
        database: false,
        storage: false,
        matchSettlement: false,
        cloudFunctions: Boolean(process.env.CLOUDBASE_ENV_ID)
      }
    };
  }

  const missingEnv = missing([
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY"
  ]);

  return {
    provider,
    enabled: missingEnv.length === 0,
    missingEnv,
    capabilities: {
      auth: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      database: missingEnv.length === 0,
      storage: missingEnv.length === 0,
      matchSettlement: missingEnv.length === 0,
      cloudFunctions: false
    }
  };
}

export function assertSupabaseBackend(feature: string) {
  const provider = getBackendProvider();
  if (provider !== "supabase") {
    throw new Error(`${feature} is still implemented by Supabase. Current provider: ${provider}.`);
  }
}
