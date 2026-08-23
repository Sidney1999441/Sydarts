"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { CheckCircle2, Play } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PlayerIdentity } from "@/components/ui/PlayerIdentity";

type Pairing = {
  index: number;
  ruleLabel?: string;
  participantAName: string;
  participantBName: string;
  participantAAvatarUrl?: string | null;
  participantBAvatarUrl?: string | null;
};

export function OfficialLineupGate({
  title = "赛前对阵公示",
  description = "双方队长已提交布阵。确认无误后开始本场计分。",
  initiallyStarted = false,
  pairings,
  children
}: {
  title?: string;
  description?: string;
  initiallyStarted?: boolean;
  pairings: Pairing[];
  children: ReactNode;
}) {
  const [started, setStarted] = useState(initiallyStarted);

  if (started) return <>{children}</>;

  return (
    <Card className="grid gap-4">
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-board text-white">
          <CheckCircle2 className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0">
          <h2 className="text-xl font-black">{title}</h2>
          <p className="mt-1 text-sm font-semibold text-muted">{description}</p>
        </div>
      </div>

      <div className="grid gap-2">
        {pairings.map((pairing) => (
          <div key={pairing.index} className="grid gap-2 rounded-lg border border-wire bg-field p-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
            <PlayerIdentity
              name={pairing.participantAName}
              avatarUrl={pairing.participantAAvatarUrl}
              subtitle={`第 ${pairing.index} 局`}
              size="sm"
              compact
            />
            <div className="text-center text-xs font-black uppercase text-muted">
              <div>VS</div>
              {pairing.ruleLabel ? <div className="mt-1 normal-case">{pairing.ruleLabel}</div> : null}
            </div>
            <PlayerIdentity
              name={pairing.participantBName}
              avatarUrl={pairing.participantBAvatarUrl}
              subtitle={`第 ${pairing.index} 局`}
              size="sm"
              compact
            />
          </div>
        ))}
      </div>

      <Button type="button" onClick={() => setStarted(true)}>
        <Play className="h-4 w-4" aria-hidden />
        开始计分
      </Button>
    </Card>
  );
}
