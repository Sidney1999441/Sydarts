import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  children: ReactNode;
};

export function Button({ className, variant = "primary", children, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex min-h-11 touch-manipulation items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55",
        variant === "primary" && "bg-board text-white hover:bg-teal-800",
        variant === "secondary" && "border border-wire bg-white text-ink hover:bg-field",
        variant === "danger" && "bg-red-600 text-white hover:bg-red-700",
        variant === "ghost" && "text-ink hover:bg-field",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
