"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fromFormString } from "@/lib/utils";

const AUTH_REQUEST_TIMEOUT_MS = 15000;
const AUTH_NETWORK_MESSAGE =
  "登录服务暂时无法连接，请检查网络后重试。当前 Supabase 服务在中国大陆网络下可能不稳定。";

function getAuthActionErrorMessage(error: unknown) {
  const message =
    typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message || "")
      : typeof error === "string"
        ? error
        : "";
  const normalized = message.toLowerCase();

  if (
    !message ||
    normalized.includes("fetch failed") ||
    normalized.includes("failed to fetch") ||
    normalized.includes("network") ||
    normalized.includes("abort") ||
    normalized.includes("timeout") ||
    normalized.includes("supabase request failed") ||
    normalized.includes("authretryablefetcherror") ||
    normalized === "{}" ||
    normalized === "[object object]"
  ) {
    return AUTH_NETWORK_MESSAGE;
  }

  if (normalized.includes("invalid login credentials")) {
    return "邮箱或密码不正确。";
  }

  if (normalized.includes("email not confirmed")) {
    return "邮箱尚未验证，请先完成邮箱验证。";
  }

  if (normalized.includes("already registered") || normalized.includes("user already")) {
    return "该邮箱已注册，请直接登录。";
  }

  return message;
}

function sanitizeOrigin(value: string | null | undefined) {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    return new URL(trimmed).origin;
  } catch {
    const host = trimmed.replace(/^https?:\/\//i, "").split("/")[0];
    if (!host) return null;
    const protocol = host.includes("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
    return `${protocol}://${host}`;
  }
}

async function getRequestOrigin() {
  const configuredOrigin =
    sanitizeOrigin(process.env.NEXT_PUBLIC_SITE_URL) ||
    sanitizeOrigin(process.env.NEXT_PUBLIC_APP_URL) ||
    sanitizeOrigin(process.env.SITE_URL) ||
    sanitizeOrigin(process.env.APP_URL);

  if (configuredOrigin) return configuredOrigin;

  const headerStore = await headers();
  const forwardedHost = headerStore.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = headerStore.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const host = forwardedHost || headerStore.get("host");
  const cleanedHost = host?.replace(/^https?:\/\//i, "").split("/")[0] || "";
  const protocol =
    forwardedProto || (cleanedHost.includes("localhost") || cleanedHost.startsWith("127.0.0.1") ? "http" : "https");

  return `${protocol}://${cleanedHost}`;
}

export async function signUpAction(formData: FormData) {
  const email = fromFormString(formData.get("email"));
  const password = fromFormString(formData.get("password"));
  const displayName = fromFormString(formData.get("display_name"));
  let failureMessage: string | null = null;

  try {
    const supabase = await createSupabaseServerClient({ timeoutMs: AUTH_REQUEST_TIMEOUT_MS });
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName || email.split("@")[0]
        }
      }
    });

    if (error) failureMessage = getAuthActionErrorMessage(error);
  } catch (error) {
    failureMessage = getAuthActionErrorMessage(error);
  }

  if (failureMessage) redirect(`/auth/register?message=${encodeURIComponent(failureMessage)}`);
  redirect(`/auth/login?message=${encodeURIComponent("注册成功，请登录。")}`);
}

export async function requestPasswordResetAction(formData: FormData) {
  const email = fromFormString(formData.get("email"));
  let failureMessage: string | null = null;

  try {
    const origin = await getRequestOrigin();
    const supabase = await createSupabaseServerClient({ timeoutMs: AUTH_REQUEST_TIMEOUT_MS });
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/auth/reset-password`
    });

    if (error) failureMessage = getAuthActionErrorMessage(error);
  } catch (error) {
    failureMessage = getAuthActionErrorMessage(error);
  }

  if (failureMessage) {
    redirect(`/auth/forgot-password?message=${encodeURIComponent(failureMessage)}`);
  }

  redirect(
    `/auth/forgot-password?message=${encodeURIComponent("如果该邮箱已注册，重置邮件会发送到邮箱，请按邮件提示设置新密码。")}`
  );
}

export async function signInAction(formData: FormData) {
  const email = fromFormString(formData.get("email"));
  const password = fromFormString(formData.get("password"));
  let failureMessage: string | null = null;

  try {
    const supabase = await createSupabaseServerClient({ timeoutMs: AUTH_REQUEST_TIMEOUT_MS });
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) failureMessage = getAuthActionErrorMessage(error);
  } catch (error) {
    failureMessage = getAuthActionErrorMessage(error);
  }

  if (failureMessage) redirect(`/auth/login?message=${encodeURIComponent(failureMessage)}`);

  revalidatePath("/", "layout");
  redirect("/");
}

export async function signOutAction() {
  try {
    const supabase = await createSupabaseServerClient({ timeoutMs: AUTH_REQUEST_TIMEOUT_MS });
    await supabase.auth.signOut();
  } catch {
    // Local cookies will be ignored on the next unauthenticated request.
  }

  revalidatePath("/", "layout");
  redirect("/auth/login");
}
