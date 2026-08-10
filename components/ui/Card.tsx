import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Card({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("min-w-0 rounded-lg border border-wire bg-surface/95 p-4 shadow-[0_18px_45px_rgb(17_24_39/0.06)] sm:p-5", className)}>
      {children}
    </section>
  );
}

export function StatCard({
  label,
  value,
  hint
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-wire bg-surface/95 p-4 shadow-[0_14px_34px_rgb(17_24_39/0.05)]">
      <div className="text-xs font-black uppercase text-muted">{label}</div>
      <div className="mt-2 text-3xl font-black text-ink">{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted">{hint}</div> : null}
    </div>
  );
}
