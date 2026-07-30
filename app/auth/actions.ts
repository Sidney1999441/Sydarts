"use server";

import { redirect } from "next/navigation";
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
