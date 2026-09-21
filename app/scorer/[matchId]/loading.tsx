import { LoaderCircle } from "lucide-react";

export default function MatchScorerLoading() {
  return (
    <section role="status" className="flex items-center gap-3 rounded-lg border border-wire bg-surface p-5">
      <LoaderCircle className="h-5 w-5 shrink-0 animate-spin text-board motion-reduce:animate-none" aria-hidden />
      <div>
        <h1 className="font-black">正在打开计分</h1>
        <p className="mt-1 text-sm text-muted">正在读取最新布阵和已保存进度。</p>
      </div>
    </section>
  );
}
