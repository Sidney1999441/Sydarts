"use client";

import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function MatchScorerError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section role="alert" className="grid gap-4 rounded-lg border border-wire bg-surface p-5">
      <h1 className="text-lg font-black">计分页面加载失败</h1>
      <p className="text-sm text-muted">请重试。此操作不会清除已保存的布阵和比赛进度。</p>
      <div className="flex flex-wrap gap-3">
        <Button type="button" onClick={reset}><RefreshCw className="h-4 w-4" aria-hidden />重试</Button>
        <Button type="button" variant="secondary" onClick={() => window.location.reload()}>重新加载页面</Button>
      </div>
    </section>
  );
}
