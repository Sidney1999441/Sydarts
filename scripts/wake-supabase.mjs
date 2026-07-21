#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_WAKE_TABLE = "profiles";
const RETRY_DELAYS_MS = [0, 3_000, 10_000, 20_000];

const REQUIRED_TABLES = [
  "profiles",
  "user_stats",
  "general_user_stats",
  "soft_user_stats",
  "tournaments",
  "tournament_registrations",
  "saved_teams",
  "teams",
  "team_members",
  "tournament_participants",
  "groups",
  "group_members",
  "matches",
  "match_legs",
  "match_turns",
  "match_result_confirmations",
  "rating_logs",
  "casual_matches",
  "casual_match_turns",
  "site_theme_settings"
];

const REQUIRED_COLUMN_SELECTS = [
  { table: "match_turns", select: "user_id" },
  { table: "soft_user_stats", select: "total_marks,count_5_marks,count_6_marks,count_7_marks" }
];

const SERVICE_ROLE_TABLES = [
  "match_settlements",
  "match_user_stat_baselines",
  "match_user_stat_events"
];

const SERVICE_ROLE_COLUMN_SELECTS = [
  { table: "match_settlements", select: "submission_id,recalculated_at" },
  { table: "match_user_stat_events", select: "match_id,user_id,stats_scope,total_marks,count_7_marks" }
];

const args = new Set(process.argv.slice(2));
const shouldCheckSchema = args.has("--check-schema") || args.has("--test");

loadEnvFile(".env");
loadEnvFile(".env.local");

const supabaseUrl = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const wakeTable = process.env.SUPABASE_KEEP_ALIVE_TABLE || DEFAULT_WAKE_TABLE;
const apiKey = shouldCheckSchema && serviceRoleKey ? serviceRoleKey : anonKey;

if (!supabaseUrl || !anonKey) {
  fail(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Fill .env.local locally or add GitHub Actions secrets."
  );
}

if (shouldCheckSchema && !serviceRoleKey) {
  console.warn(
    "SUPABASE_SERVICE_ROLE_KEY is not set; schema checks will use the anon key and may be limited by RLS."
  );
}

const headers = {
  apikey: apiKey,
  authorization: `Bearer ${apiKey}`,
  accept: "application/json"
};

try {
  await wakeSupabase();

  if (shouldCheckSchema) {
    await checkDatabaseSchema();
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

async function wakeSupabase() {
  const response = await requestWithRetry(
    `/rest/v1/${encodeURIComponent(wakeTable)}?select=*&limit=1`
  );

  if (isSuccess(response.status)) {
    console.log(`Supabase wake check OK via table "${wakeTable}" (HTTP ${response.status}).`);
    return;
  }

  const fallback = await requestWithRetry("/rest/v1/");
  if (isSuccess(fallback.status)) {
    console.log(`Supabase wake check OK via REST root (HTTP ${fallback.status}).`);
    return;
  }

  throw new Error(
    `Supabase wake check failed. Table response: HTTP ${response.status}. REST root: HTTP ${fallback.status}.`
  );
}

async function checkDatabaseSchema() {
  const failures = [];

  for (const table of REQUIRED_TABLES) {
    const response = await requestWithRetry(
      `/rest/v1/${encodeURIComponent(table)}?select=*&limit=1`,
      { retryServerErrors: false }
    );

    if (!isSuccess(response.status)) {
      failures.push(`${table}: HTTP ${response.status}`);
    }
  }

  for (const check of REQUIRED_COLUMN_SELECTS) {
    const response = await requestWithRetry(
      `/rest/v1/${encodeURIComponent(check.table)}?select=${encodeURIComponent(check.select)}&limit=1`,
      { retryServerErrors: false }
    );

    if (!isSuccess(response.status)) {
      failures.push(`${check.table}.${check.select}: HTTP ${response.status}`);
    }
  }

  if (serviceRoleKey) {
    for (const table of SERVICE_ROLE_TABLES) {
      const response = await requestWithRetry(
        `/rest/v1/${encodeURIComponent(table)}?select=*&limit=1`,
        { retryServerErrors: false, useServiceRole: true }
      );

      if (!isSuccess(response.status)) {
        failures.push(`${table}: HTTP ${response.status}`);
      }
    }

    for (const check of SERVICE_ROLE_COLUMN_SELECTS) {
      const response = await requestWithRetry(
        `/rest/v1/${encodeURIComponent(check.table)}?select=${encodeURIComponent(check.select)}&limit=1`,
        { retryServerErrors: false, useServiceRole: true }
      );

      if (!isSuccess(response.status)) {
        failures.push(`${check.table}.${check.select}: HTTP ${response.status}`);
      }
    }

    const bucketResponse = await requestWithRetry("/storage/v1/bucket/avatars", {
      retryServerErrors: false,
      useServiceRole: true
    });

    if (!isSuccess(bucketResponse.status)) {
      failures.push(`storage bucket avatars: HTTP ${bucketResponse.status}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`Database schema check failed:\n- ${failures.join("\n- ")}`);
  }

  console.log(
    `Database schema check OK (${REQUIRED_TABLES.length} public tables, ${SERVICE_ROLE_TABLES.length} internal tables, ${REQUIRED_COLUMN_SELECTS.length + SERVICE_ROLE_COLUMN_SELECTS.length} column groups checked).`
  );
}

async function requestWithRetry(path, options = {}) {
  const retryServerErrors = options.retryServerErrors ?? true;
  let lastResponse = null;
  let lastError = null;

  for (const delayMs of RETRY_DELAYS_MS) {
    if (delayMs > 0) {
      await delay(delayMs);
    }

    try {
      const response = await fetch(`${supabaseUrl}${path}`, {
        headers: options.useServiceRole
          ? {
              ...headers,
              apikey: serviceRoleKey,
              authorization: `Bearer ${serviceRoleKey}`
            }
          : headers
      });

      lastResponse = response;

      if (!retryServerErrors || response.status < 500) {
        return response;
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (lastResponse) {
    return lastResponse;
  }

  throw lastError || new Error(`Request failed: ${path}`);
}

function loadEnvFile(fileName) {
  const filePath = resolve(process.cwd(), fileName);
  if (!existsSync(filePath)) return;

  const content = readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1).trim();
    if (!key || process.env[key] !== undefined) continue;

    process.env[key] = stripQuotes(rawValue);
  }
}

function normalizeSupabaseUrl(value) {
  if (!value) return "";
  return value.replace(/\/+$/, "");
}

function stripQuotes(value) {
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function isSuccess(status) {
  return status >= 200 && status < 300;
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
