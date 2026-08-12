"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";

type ResetState = "checking" | "ready" | "missing-session" | "saving" | "saved";

export function ResetPasswordForm() {
  const [state, setState] = useState<ResetState>("checking");
  const [message, setMessage] = useState("正在验证重置链接...");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    let mounted = true;
    const supabase = createSupabaseBrowserClient();

    async function prepareRecoverySession() {
      const currentUrl = new URL(window.location.href);
      const code = currentUrl.searchParams.get("code");

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          if (!mounted) return;
          setState("missing-session");
          setMessage("重置链接已失效或已被使用，请重新发送重置邮件。");
          return;
        }
        window.history.replaceState({}, "", "/auth/reset-password");
      }

      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!mounted) return;
      if (session) {
        setState("ready");
        setMessage("验证成功，请设置新密码。");
      } else {
        setState("missing-session");
        setMessage("请先通过邮件中的重置链接打开本页面。");
      }
    }

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" && mounted) {
        setState("ready");
        setMessage("验证成功，请设置新密码。");
      }
    });

    prepareRecoverySession();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state !== "ready") return;

    if (password.length < 6) {
      setMessage("密码至少需要 6 位。");
      return;
    }

    if (password !== confirmPassword) {
      setMessage("两次输入的密码不一致。");
      return;
    }

    setState("saving");
    setMessage("正在更新密码...");

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setState("ready");
      setMessage(error.message || "密码更新失败，请稍后重试。");
      return;
    }

    await supabase.auth.signOut({ scope: "local" });
    setState("saved");
    setMessage("密码已更新，请使用新密码登录。");
    window.location.href = `/auth/login?message=${encodeURIComponent("密码已更新，请使用新密码登录。")}`;
  }

  const isSaving = state === "saving";
  const disabled = state !== "ready" && !isSaving;

  return (
    <div className="grid gap-4">
      <p
        className={`rounded-lg p-3 text-sm font-semibold ${
          state === "missing-session"
            ? "bg-red-50 text-red-700"
            : state === "saved"
              ? "bg-emerald-50 text-emerald-700"
              : "bg-field text-muted"
        }`}
      >
        {message}
      </p>
      <form onSubmit={handleSubmit} className="grid gap-4">
        <label className="label">
          新密码
          <input
            className="form-input"
            type="password"
            minLength={6}
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={disabled || isSaving}
            required
          />
        </label>
        <label className="label">
          确认新密码
          <input
            className="form-input"
            type="password"
            minLength={6}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            disabled={disabled || isSaving}
            required
          />
        </label>
        <Button type="submit" disabled={disabled || isSaving}>
          {isSaving ? "更新中" : "更新密码"}
        </Button>
      </form>
      <Link className="text-sm font-semibold text-board underline" href="/auth/forgot-password">
        重新发送重置邮件
      </Link>
    </div>
  );
}
