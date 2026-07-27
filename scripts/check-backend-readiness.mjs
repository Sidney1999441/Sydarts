import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

loadEnvFile(".env");
loadEnvFile(".env.local");

const provider = process.env.CODL_BACKEND_PROVIDER || "supabase";

const requiredByProvider = {
  supabase: [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY"
  ],
  tencent: [
    "CLOUDBASE_ENV_ID",
    "CLOUDBASE_SERVICE_NAME",
    "TENCENT_POSTGRES_URL",
    "TENCENT_COS_BUCKET",
    "TENCENT_COS_REGION"
  ]
};

if (!Object.hasOwn(requiredByProvider, provider)) {
  console.error(`Unknown CODL_BACKEND_PROVIDER "${provider}". Use "supabase" or "tencent".`);
  process.exit(1);
}

const missing = requiredByProvider[provider].filter((key) => !process.env[key]);

console.log(`CODL backend provider: ${provider}`);

if (missing.length > 0) {
  console.error(`Missing environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

console.log("Backend readiness check OK.");

function loadEnvFile(fileName) {
  const path = resolve(process.cwd(), fileName);
  if (!existsSync(path)) return;

  const content = readFileSync(path, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}
