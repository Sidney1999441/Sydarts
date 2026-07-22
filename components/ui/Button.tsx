"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { useFormStatus } from "react-dom";
import { cn } from "@/lib/utils";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  pendingText?: string;
  children: ReactNode;
};

export function Button({
  className,
  disabled,
  pendingText,
  type,
  variant = "primary",
  children,
  ...props
}: ButtonProps) {
  const { pending } = useFormStatus();
  const isBusy = Boolean((type === undefined || type === "submit") && pending);

  return (
    <button
      className={cn(
        "inline-flex min-h-12 touch-manipulation select-none items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-bold transition-colors duration-75 ease-out active:brightness-90 disabled:cursor-not-allowed disabled:opacity-55",
        variant === "primary" && "bg-board text-white shadow-sm hover:bg-board/95",
        variant === "secondary" &&
          "border border-wire bg-surface text-ink hover:border-board/35 hover:bg-field active:bg-field",
        variant === "danger" && "bg-red-600 text-white hover:bg-red-700 active:bg-red-700",
        variant === "ghost" && "text-ink hover:bg-field active:bg-field",
        className
      )}
      aria-busy={isBusy || undefined}
      data-pending={isBusy ? "true" : undefined}
      disabled={disabled || isBusy}
      type={type}
      {...props}
    >
      {isBusy ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          {pendingText || "\u5904\u7406\u4e2d"}
        </>
      ) : (
        children
      )}
    </button>
  );
}
