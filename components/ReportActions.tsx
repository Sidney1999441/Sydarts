"use client";

import { useState } from "react";
import { Copy, Printer } from "lucide-react";
import { cn } from "@/lib/utils";

export function ReportActions({ className }: { className?: string }) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    if (!navigator.clipboard) return;
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className={cn("flex flex-wrap gap-2 print:hidden", className)}>
      <button
        className="inline-flex min-h-11 touch-manipulation items-center justify-center gap-2 rounded-lg bg-board px-4 text-sm font-black text-white shadow-sm active:brightness-90"
        type="button"
        onClick={() => window.print()}
      >
        <Printer className="h-4 w-4" aria-hidden />
        打印/保存
      </button>
      <button
        className="inline-flex min-h-11 touch-manipulation items-center justify-center gap-2 rounded-lg border border-wire bg-surface px-4 text-sm font-black text-board shadow-sm active:bg-field"
        type="button"
        onClick={copyLink}
      >
        <Copy className="h-4 w-4" aria-hidden />
        {copied ? "已复制" : "复制链接"}
      </button>
    </div>
  );
}
