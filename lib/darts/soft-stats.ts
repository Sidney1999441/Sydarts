import type { LegGameVariant } from "@/types/domain";

export type ManualMatchStats = {
  averageScore?: number;
  averageMpr?: number;
  countTon80?: number;
  countHatTrick?: number;
  highestCheckout?: number;
  countHighCheckout?: number;
  countWhiteHorse?: number;
  totalMarks?: number;
  count5Marks?: number;
  count6Marks?: number;
  count7Marks?: number;
  count9Marks?: number;
  averagePer3Darts?: number;
  totalScoredPoints?: number;
  totalDarts?: number;
  highestTurnScore?: number;
  bustCount?: number;
  checkoutCount?: number;
  count60Plus?: number;
  count80Plus?: number;
  count180?: number;
  count100Plus?: number;
  count140Plus?: number;
  count170Plus?: number;
};

export type ManualSoftStats = ManualMatchStats;

export type SoftStatField = {
  key: keyof ManualMatchStats;
  label: string;
  step?: string;
  integer?: boolean;
};

const soft01Variants = new Set(["soft_301", "soft_501", "soft_701", "snow_501", "snow_701"]);

export function ppdToPpr(ppd: number) {
  return Number((ppd * 3).toFixed(2));
}

export function pprToPpd(ppr: number) {
  return Number((ppr / 3).toFixed(2));
}

export function isSoft01Variant(gameVariant?: string | number | null) {
  return soft01Variants.has(String(gameVariant || "soft_501"));
}

export function isSoftHighScoreVariant(gameVariant?: string | number | null) {
  return String(gameVariant || "") === "soft_high_score";
}

export function isSoftCricketVariant(gameVariant?: string | number | null) {
  return String(gameVariant || "") === "soft_cricket";
}

export function getSoftStatFields(gameVariant?: string | number | null): SoftStatField[] {
  const value = String(gameVariant || "soft_501") as LegGameVariant;

  if (isSoftCricketVariant(value)) {
    return [
      { key: "averageMpr", label: "MPR", step: "0.01" },
      { key: "count5Marks", label: "5 Mark", integer: true },
      { key: "count6Marks", label: "6 Mark", integer: true },
      { key: "count7Marks", label: "7 Mark", integer: true },
      { key: "count9Marks", label: "9 Mark", integer: true },
      { key: "countWhiteHorse", label: "白马", integer: true }
    ];
  }

  if (isSoftHighScoreVariant(value)) {
    return [
      { key: "highestTurnScore", label: "高分成绩", integer: true },
      { key: "countHatTrick", label: "帽子数量", integer: true },
      { key: "countTon80", label: "TON80", integer: true }
    ];
  }

  if (value === "soft_half_it") {
    return [
      { key: "totalScoredPoints", label: "本局得分", integer: true },
      { key: "highestTurnScore", label: "最高轮分", integer: true },
      { key: "countHatTrick", label: "帽子数量", integer: true }
    ];
  }

  return [
    { key: "averageScore", label: "PPR / 均分", step: "0.01" },
    { key: "countHatTrick", label: "帽子数量", integer: true },
    { key: "countTon80", label: "TON80", integer: true },
    { key: "highestCheckout", label: "最高拆", integer: true },
    { key: "countHighCheckout", label: "高拆次数", integer: true }
  ];
}

export function compactManualStats(stats: ManualMatchStats) {
  return Object.fromEntries(
    Object.entries(stats).filter(([, value]) => value !== undefined && value !== null && Number.isFinite(value))
  ) as ManualMatchStats;
}

function averageDefined(values: Array<number | undefined>) {
  const defined = values.filter((value): value is number => value !== undefined);
  if (defined.length === 0) return undefined;
  return Number((defined.reduce((total, value) => total + value, 0) / defined.length).toFixed(2));
}

function sum(values: Array<number | undefined>) {
  return values.reduce<number>((total, value) => total + (value || 0), 0);
}

function max(values: Array<number | undefined>) {
  const defined = values.filter((value): value is number => value !== undefined);
  return defined.length > 0 ? Math.max(...defined) : undefined;
}

export function mergeManualStats(stats: ManualMatchStats[]) {
  if (stats.length === 0) return {};

  return compactManualStats({
    averageScore: averageDefined(stats.map((item) => item.averageScore ?? item.averagePer3Darts)),
    averagePer3Darts: averageDefined(stats.map((item) => item.averagePer3Darts ?? item.averageScore)),
    averageMpr: averageDefined(stats.map((item) => item.averageMpr)),
    countTon80: sum(stats.map((item) => item.countTon80)),
    countHatTrick: sum(stats.map((item) => item.countHatTrick)),
    highestCheckout: max(stats.map((item) => item.highestCheckout)),
    countHighCheckout: sum(stats.map((item) => item.countHighCheckout)),
    countWhiteHorse: sum(stats.map((item) => item.countWhiteHorse)),
    totalMarks: sum(stats.map((item) => item.totalMarks)),
    count5Marks: sum(stats.map((item) => item.count5Marks)),
    count6Marks: sum(stats.map((item) => item.count6Marks)),
    count7Marks: sum(stats.map((item) => item.count7Marks)),
    count9Marks: sum(stats.map((item) => item.count9Marks)),
    totalScoredPoints: sum(stats.map((item) => item.totalScoredPoints)),
    totalDarts: sum(stats.map((item) => item.totalDarts)),
    highestTurnScore: max(stats.map((item) => item.highestTurnScore)),
    bustCount: sum(stats.map((item) => item.bustCount)),
    checkoutCount: sum(stats.map((item) => item.checkoutCount)),
    count60Plus: sum(stats.map((item) => item.count60Plus)),
    count80Plus: sum(stats.map((item) => item.count80Plus)),
    count180: sum(stats.map((item) => item.count180)),
    count100Plus: sum(stats.map((item) => item.count100Plus)),
    count140Plus: sum(stats.map((item) => item.count140Plus)),
    count170Plus: sum(stats.map((item) => item.count170Plus))
  });
}
