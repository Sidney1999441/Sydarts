import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

export function LevelExplanation({
  className,
  compact = false
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <details
      className={cn(
        "rounded-lg border border-wire bg-field/85 p-3 text-sm text-muted",
        compact ? "w-full sm:w-auto sm:min-w-80" : "w-full",
        className
      )}
    >
      <summary className="inline-flex cursor-pointer items-center gap-2 text-sm font-black text-board">
        <Info className="h-4 w-4" aria-hidden />
        段位说明
      </summary>
      <div className="mt-3 grid gap-2 leading-6">
        <p>
          段位是 1-99 级的综合评分。新选手没有比赛数据时，系统按管理员设置的初始等级
          作为报名排序和公平分组参考。
        </p>
        <p>
          有比赛数据后，系统会综合硬镖三镖均分、胜率、Leg 胜率、高分能力和爆镖惩罚；软镖数据会按均分/MPR、胜率、Hat Trick、White Horse、9 Mark 等表现作为补充。
        </p>
        <p>
          比赛场次越多，可信度越高，真实表现的权重越大；初始等级会逐步被实际成绩修正。
        </p>
      </div>
    </details>
  );
}
