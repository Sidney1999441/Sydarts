export type AchievementTone = "board" | "green" | "gold" | "violet" | "rose" | "slate";

export type Achievement = {
  id: string;
  title: string;
  description: string;
  category: "基础" | "得分" | "结镖" | "软镖" | "稳定";
  badge: string;
  tone: AchievementTone;
  unlocked: boolean;
  current: number;
  target: number;
};

export type SteelStatsInput = {
  matches_played?: number | string | null;
  wins?: number | string | null;
  losses?: number | string | null;
  legs_played?: number | string | null;
  legs_won?: number | string | null;
  average_per_3_darts?: number | string | null;
  highest_turn_score?: number | string | null;
  checkout_count?: number | string | null;
  highest_checkout?: number | string | null;
  count_high_checkout?: number | string | null;
  count_100_plus?: number | string | null;
  count_140_plus?: number | string | null;
  count_170_plus?: number | string | null;
  count_180?: number | string | null;
};

export type SoftStatsInput = {
  matches_played?: number | string | null;
  wins?: number | string | null;
  average_score?: number | string | null;
  average_mpr?: number | string | null;
  highest_checkout?: number | string | null;
  count_high_checkout?: number | string | null;
  count_ton80?: number | string | null;
  count_hat_trick?: number | string | null;
  count_white_horse?: number | string | null;
  total_marks?: number | string | null;
  count_7_marks?: number | string | null;
  count_9_marks?: number | string | null;
};

function toNumber(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function clampProgress(current: number, target: number) {
  if (target <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((current / target) * 100)));
}

function achievement(input: Omit<Achievement, "unlocked">): Achievement {
  return {
    ...input,
    unlocked: input.current >= input.target
  };
}

export function buildAchievements({
  generalStats,
  tournamentStats,
  softStats
}: {
  generalStats?: SteelStatsInput | null;
  tournamentStats?: SteelStatsInput | null;
  softStats?: SoftStatsInput | null;
}) {
  const generalMatches = toNumber(generalStats?.matches_played);
  const tournamentMatches = toNumber(tournamentStats?.matches_played);
  const softMatches = toNumber(softStats?.matches_played);
  const totalMatches = Math.max(generalMatches, tournamentMatches) + softMatches;
  const totalWins = Math.max(toNumber(generalStats?.wins), toNumber(tournamentStats?.wins)) + toNumber(softStats?.wins);
  const winRate = totalMatches > 0 ? Math.round((totalWins / totalMatches) * 100) : 0;
  const legsPlayed = Math.max(toNumber(generalStats?.legs_played), toNumber(tournamentStats?.legs_played));
  const legsWon = Math.max(toNumber(generalStats?.legs_won), toNumber(tournamentStats?.legs_won));
  const legWinRate = legsPlayed > 0 ? Math.round((legsWon / legsPlayed) * 100) : 0;
  const highestCheckout = Math.max(
    toNumber(generalStats?.highest_checkout),
    toNumber(tournamentStats?.highest_checkout),
    toNumber(softStats?.highest_checkout)
  );
  const highCheckoutCount = Math.max(
    toNumber(generalStats?.count_high_checkout),
    toNumber(tournamentStats?.count_high_checkout),
    toNumber(softStats?.count_high_checkout)
  );
  const highestTurn = Math.max(toNumber(generalStats?.highest_turn_score), toNumber(tournamentStats?.highest_turn_score));
  const count180 = Math.max(toNumber(generalStats?.count_180), toNumber(tournamentStats?.count_180));
  const count100 = Math.max(toNumber(generalStats?.count_100_plus), toNumber(tournamentStats?.count_100_plus));
  const count140 = Math.max(toNumber(generalStats?.count_140_plus), toNumber(tournamentStats?.count_140_plus));
  const count170 = Math.max(toNumber(generalStats?.count_170_plus), toNumber(tournamentStats?.count_170_plus));
  const average = Math.max(toNumber(generalStats?.average_per_3_darts), toNumber(tournamentStats?.average_per_3_darts));
  const softAverage = toNumber(softStats?.average_score);
  const softMpr = toNumber(softStats?.average_mpr);

  const items = [
    achievement({
      id: "first-match",
      title: "登场认证",
      description: "完成第一场可统计比赛。",
      category: "基础",
      badge: "START",
      tone: "slate",
      current: totalMatches,
      target: 1
    }),
    achievement({
      id: "first-win",
      title: "首胜入账",
      description: "拿下第一场胜利。",
      category: "基础",
      badge: "WIN",
      tone: "green",
      current: totalWins,
      target: 1
    }),
    achievement({
      id: "regular",
      title: "稳定参赛",
      description: "累计完成 10 场比赛。",
      category: "稳定",
      badge: "10G",
      tone: "board",
      current: totalMatches,
      target: 10
    }),
    achievement({
      id: "winner-pace",
      title: "胜率压制",
      description: "至少 8 场后保持 60% 胜率。",
      category: "稳定",
      badge: "60%",
      tone: "gold",
      current: totalMatches >= 8 ? winRate : 0,
      target: 60
    }),
    achievement({
      id: "leg-control",
      title: "控局能力",
      description: "Leg 胜率达到 60%。",
      category: "稳定",
      badge: "LEG",
      tone: "green",
      current: legWinRate,
      target: 60
    }),
    achievement({
      id: "ton-up",
      title: "百分轰炸",
      description: "累计打出 20 次 100+。",
      category: "得分",
      badge: "100+",
      tone: "board",
      current: count100,
      target: 20
    }),
    achievement({
      id: "heavy-scoring",
      title: "重火力输出",
      description: "累计打出 10 次 140+。",
      category: "得分",
      badge: "140+",
      tone: "violet",
      current: count140,
      target: 10
    }),
    achievement({
      id: "max-score",
      title: "满分一轮",
      description: "打出至少一次 180。",
      category: "得分",
      badge: "180",
      tone: "rose",
      current: Math.max(count180, highestTurn >= 180 ? 1 : 0),
      target: 1
    }),
    achievement({
      id: "max-score-chain",
      title: "180 猎手",
      description: "累计打出 5 次 180。",
      category: "得分",
      badge: "5x180",
      tone: "rose",
      current: count180,
      target: 5
    }),
    achievement({
      id: "checkout-master",
      title: "拆分大师",
      description: "完成一次 100+ 结镖。",
      category: "结镖",
      badge: "CO",
      tone: "gold",
      current: highestCheckout,
      target: 100
    }),
    achievement({
      id: "big-checkout",
      title: "高拆先生",
      description: "累计完成 5 次高拆。",
      category: "结镖",
      badge: "HC5",
      tone: "gold",
      current: highCheckoutCount,
      target: 5
    }),
    achievement({
      id: "seventy-avg",
      title: "均分标杆",
      description: "硬镖三镖均分达到 70。",
      category: "稳定",
      badge: "AVG",
      tone: "violet",
      current: average,
      target: 70
    }),
    achievement({
      id: "soft-hat",
      title: "帽子戏法",
      description: "软镖打出帽子。",
      category: "软镖",
      badge: "HAT",
      tone: "board",
      current: toNumber(softStats?.count_hat_trick),
      target: 1
    }),
    achievement({
      id: "white-horse",
      title: "白马时刻",
      description: "米老鼠打出白马。",
      category: "软镖",
      badge: "WH",
      tone: "green",
      current: toNumber(softStats?.count_white_horse),
      target: 1
    }),
    achievement({
      id: "nine-mark",
      title: "九标爆发",
      description: "米老鼠打出 9 Mark。",
      category: "软镖",
      badge: "9M",
      tone: "rose",
      current: toNumber(softStats?.count_9_marks),
      target: 1
    }),
    achievement({
      id: "soft-engine",
      title: "软镖引擎",
      description: "软镖均分达到 60 或 MPR 达到 2.4。",
      category: "软镖",
      badge: "SFT",
      tone: "board",
      current: Math.max(softAverage, softMpr * 25),
      target: 60
    }),
    achievement({
      id: "ton80-soft",
      title: "TON80",
      description: "软镖打出 TON80。",
      category: "软镖",
      badge: "T80",
      tone: "rose",
      current: toNumber(softStats?.count_ton80),
      target: 1
    }),
    achievement({
      id: "mark-collector",
      title: "标数收割",
      description: "软镖累计取得 200 个 Mark。",
      category: "软镖",
      badge: "200M",
      tone: "violet",
      current: toNumber(softStats?.total_marks),
      target: 200
    }),
    achievement({
      id: "seventeen-plus",
      title: "极限压迫",
      description: "累计打出 3 次 170+。",
      category: "得分",
      badge: "170+",
      tone: "rose",
      current: count170,
      target: 3
    })
  ];

  return items.map((item) => ({
    ...item,
    progress: clampProgress(item.current, item.target)
  }));
}

export function summarizeAchievements(achievements: Array<Achievement & { progress: number }>) {
  const unlocked = achievements.filter((item) => item.unlocked);
  const next = achievements
    .filter((item) => !item.unlocked)
    .sort((a, b) => b.progress - a.progress || a.target - b.target)
    .slice(0, 3);

  return {
    unlocked,
    next,
    unlockedCount: unlocked.length,
    totalCount: achievements.length,
    completion: clampProgress(unlocked.length, achievements.length)
  };
}
