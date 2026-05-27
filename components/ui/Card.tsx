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
    <section className={cn("rounded-lg border border-wire bg-white p-5 shadow-soft", className)}>
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
    <div className="rounded-lg border border-wire bg-white p-4">
      <div className="text-sm font-medium text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-bold text-ink">{value}</div>
      {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
    </div>
  );
}
