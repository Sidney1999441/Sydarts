import Link from "next/link";
import { ArrowLeft, History, Swords } from "lucide-react";
import { requireUser } from "@/lib/auth/guards";
import { getMatchRulesSummary } from "@/lib/darts/variants";
import { hasSupabaseEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn, formatDateTime } from "@/lib/utils";
import { CodlPageHeader } from "@/components/CodlPageHeader";
import { SetupNotice } from "@/components/SetupNotice";
import { Card } from "@/components/ui/Card";
import { PlayerAvatar } from "@/components/ui/PlayerIdentity";

export const dynamic = "force-dynamic";

type CasualSide = "A" | "B";
type CasualMember = {
  userId?: string | null;
  linked?: boolean | null;
};
type MatchHistoryItem = {
  id: string;
  source: "赛事" | "切磋";
  title: string;
  detailHref: string;
  playedAt: string;
  result: "胜" | "负" | "待确认" | "争议";
  statusLabel: string;
  scoreLabel: string;
  myName: string;
  opponentName: string;
  myAvatarUrl?: string | null;
  opponentAvatarUrl?: string | null;
};

function readCasualMemberSide(details: unknown, userId: string): CasualSide | null {
  const participantMembers = (details as { participantMembers?: { A?: CasualMember[]; B?: CasualMember[] } } | null)
    ?.participantMembers;
  if (participantMembers?.A?.some((member) => member.linked && member.userId === userId)) return "A";
  if (participantMembers?.B?.some((member) => member.linked && member.userId === userId)) return "B";
  return null;
}

function casualModeLabel(details: unknown) {
  const participantMode = (details as { participantMode?: string } | null)?.participantMode;
  return participantMode === "doubles" ? "双人切磋" : "单人切磋";
}

export default async function ProfileHistoryPage() {
  if (!hasSupabaseEnv()) return <SetupNotice />;

  const { user } = await requireUser();
  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();

  const [{ data: teamMemberships }, { data: registrations }] = await Promise.all([
    supabase.from("team_members").select("team_id").eq("user_id", user.id),
    supabase
      .from("tournament_registrations")
      .select("tournament_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30)
  ]);

  const teamIds = (teamMemberships || []).map((item) => item.team_id);
  const participantFilters = [`user_id.eq.${user.id}`];
  if (teamIds.length > 0) participantFilters.push(`team_id.in.(${teamIds.join(",")})`);

  const { data: myParticipants } = await supabase
    .from("tournament_participants")
    .select("id, display_name")
    .or(participantFilters.join(","));
  const myParticipantIds = (myParticipants || []).map((participant) => participant.id);
  const myParticipantIdSet = new Set(myParticipantIds);
  const { data: officialMatches } =
    myParticipantIds.length > 0
      ? await supabase
          .from("matches")
          .select("id, tournament_id, stage, round_number, participant_a_id, participant_b_id, winner_participant_id, status, score_a, score_b, dart_mode, game_variant, details, created_at, updated_at")
          .or(`participant_a_id.in.(${myParticipantIds.join(",")}),participant_b_id.in.(${myParticipantIds.join(",")})`)
          .eq("status", "completed")
          .order("updated_at", { ascending: false })
          .limit(80)
      : { data: [] };

  const officialParticipantIds = [
    ...new Set(
      (officialMatches || [])
        .flatMap((match) => [match.participant_a_id, match.participant_b_id])
        .filter(Boolean)
    )
  ] as string[];
  const tournamentIds = [
    ...new Set([
      ...(officialMatches || []).map((match) => match.tournament_id),
      ...(registrations || []).map((registration) => registration.tournament_id)
    ])
  ];

  const [{ data: officialParticipants }, { data: tournaments }] = await Promise.all([
    officialParticipantIds.length > 0
      ? supabase.from("tournament_participants").select("id, display_name, user_id, team_id").in("id", officialParticipantIds)
      : Promise.resolve({ data: [] }),
    tournamentIds.length > 0
      ? supabase.from("tournaments").select("id, name").in("id", tournamentIds)
      : Promise.resolve({ data: [] })
  ]);

  const [
    { data: directCasualMatches },
    { data: casualMatchesAsA },
    { data: casualMatchesAsB }
  ] = await Promise.all([
    admin
      .from("casual_matches")
      .select("*")
      .or(`created_by.eq.${user.id},player_a_user_id.eq.${user.id},player_b_user_id.eq.${user.id}`)
      .order("created_at", { ascending: false })
      .limit(80),
    admin
      .from("casual_matches")
      .select("*")
      .contains("details", { participantMembers: { A: [{ userId: user.id, linked: true }] } })
      .order("created_at", { ascending: false })
      .limit(80),
    admin
      .from("casual_matches")
      .select("*")
      .contains("details", { participantMembers: { B: [{ userId: user.id, linked: true }] } })
      .order("created_at", { ascending: false })
      .limit(80)
  ]);

  const participantById = new Map((officialParticipants || []).map((participant) => [participant.id, participant]));
  const tournamentById = new Map((tournaments || []).map((tournament) => [tournament.id, tournament]));
  const casualMatchesById = new Map<string, NonNullable<typeof directCasualMatches>[number]>();
  for (const match of [...(directCasualMatches || []), ...(casualMatchesAsA || []), ...(casualMatchesAsB || [])]) {
    casualMatchesById.set(match.id, match);
  }
  const officialParticipantRows = (officialParticipants || []) as Array<{
    id: string;
    display_name: string;
    user_id?: string | null;
    team_id?: string | null;
  }>;
  const officialTeamIds = [...new Set(officialParticipantRows.map((participant) => participant.team_id).filter(Boolean))] as string[];
  const { data: officialTeamMembers } =
    officialTeamIds.length > 0
      ? await admin.from("team_members").select("team_id, user_id").in("team_id", officialTeamIds)
      : { data: [] };
  const casualUserIds = Array.from(casualMatchesById.values())
    .flatMap((match) => [match.player_a_user_id, match.player_b_user_id])
    .filter(Boolean) as string[];
  const avatarUserIds = [
    ...new Set([
      ...officialParticipantRows.map((participant) => participant.user_id).filter(Boolean),
      ...(officialTeamMembers || []).map((member) => member.user_id),
      ...casualUserIds
    ])
  ] as string[];
  const { data: avatarProfiles } =
    avatarUserIds.length > 0
      ? await admin.from("profiles").select("id, avatar_url").in("id", avatarUserIds)
      : { data: [] };
  const avatarProfileById = new Map((avatarProfiles || []).map((profile) => [profile.id, profile.avatar_url]));
  const participantAvatarById = new Map<string, string | null>();
  for (const participant of officialParticipantRows) {
    if (participant.user_id) {
      participantAvatarById.set(participant.id, avatarProfileById.get(participant.user_id) || null);
      continue;
    }
    const firstTeamMemberAvatar = (officialTeamMembers || [])
      .filter((member) => member.team_id === participant.team_id)
      .map((member) => avatarProfileById.get(member.user_id) || null)
      .find(Boolean) || null;
    participantAvatarById.set(participant.id, firstTeamMemberAvatar);
  }

  const history = [
    ...(officialMatches || []).flatMap((match): MatchHistoryItem[] => {
      const myParticipantId =
        [match.participant_a_id, match.participant_b_id].find((participantId) =>
          participantId ? myParticipantIdSet.has(participantId) : false
        ) || null;
      if (!myParticipantId) return [];
      const opponentParticipantId =
        myParticipantId === match.participant_a_id ? match.participant_b_id : match.participant_a_id;
      const myName = participantById.get(myParticipantId)?.display_name || "我方";
      const opponentName = opponentParticipantId
        ? participantById.get(opponentParticipantId)?.display_name || "对手"
        : "对手";
      const myScore = myParticipantId === match.participant_a_id ? match.score_a : match.score_b;
      const opponentScore = myParticipantId === match.participant_a_id ? match.score_b : match.score_a;

      return [
        {
          id: match.id,
          source: "赛事",
          title: tournamentById.get(match.tournament_id)?.name || "赛事比赛",
          detailHref: `/profile/history/official/${match.id}`,
          playedAt: match.updated_at || match.created_at,
          result: match.winner_participant_id === myParticipantId ? "胜" : "负",
          statusLabel: `${match.stage === "group" ? "小组赛" : `淘汰赛 R${match.round_number}`} / ${getMatchRulesSummary({
            dartMode: match.dart_mode,
            gameVariant: match.game_variant,
            legRules: (match.details as { legRules?: unknown } | null)?.legRules
          })}`,
          scoreLabel: `${myScore}:${opponentScore}`,
          myName,
          opponentName,
          myAvatarUrl: participantAvatarById.get(myParticipantId) || null,
          opponentAvatarUrl: opponentParticipantId ? participantAvatarById.get(opponentParticipantId) || null : null
        }
      ];
    }),
    ...Array.from(casualMatchesById.values()).map((match): MatchHistoryItem => {
      const casualMemberSide = readCasualMemberSide(match.details, user.id);
      const mySide: CasualSide =
        casualMemberSide || (match.player_a_user_id === user.id || match.created_by === user.id ? "A" : "B");
      const statusLabel =
        match.confirmation_status === "pending"
          ? "待对手确认"
          : match.confirmation_status === "rejected"
            ? "对手已拒绝"
            : "已记录";
      const result =
        match.confirmation_status === "rejected"
          ? "争议"
          : match.confirmation_status === "pending" && mySide === "B"
            ? "待确认"
            : match.winner_side === mySide
              ? "胜"
              : "负";

      return {
        id: match.id,
        source: "切磋",
        title: `${match.player_a_name} vs ${match.player_b_name}`,
        detailHref: `/profile/history/casual/${match.id}`,
        playedAt: match.created_at,
        result,
        statusLabel: `${casualModeLabel(match.details)} / ${statusLabel}`,
        scoreLabel: mySide === "A" ? `${match.score_a}:${match.score_b}` : `${match.score_b}:${match.score_a}`,
        myName: mySide === "A" ? match.player_a_name : match.player_b_name,
        opponentName: mySide === "A" ? match.player_b_name : match.player_a_name,
        myAvatarUrl:
          mySide === "A"
            ? avatarProfileById.get(match.player_a_user_id) || null
            : avatarProfileById.get(match.player_b_user_id) || null,
        opponentAvatarUrl:
          mySide === "A"
            ? avatarProfileById.get(match.player_b_user_id) || null
            : avatarProfileById.get(match.player_a_user_id) || null
      };
    })
  ]
    .sort((a, b) => new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime())
    .slice(0, 120);

  return (
    <div className="grid gap-5">
      <CodlPageHeader
        kicker="Profile History"
        title="历史战绩"
        description="赛事与切磋统一归档，点击任意一行查看完整回合与个人统计。"
        icon={<History className="h-6 w-6" aria-hidden />}
        art="white"
        actions={
          <Link
            className="inline-flex min-h-11 touch-manipulation items-center justify-center gap-2 rounded-lg border border-wire bg-surface px-4 text-sm font-black text-board shadow-soft"
            href="/profile"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            返回个人页
          </Link>
        }
      />

      <section className="grid gap-3">
        {history.map((item) => (
          <HistoryCard key={`${item.source}-${item.id}`} item={item} />
        ))}
        {history.length === 0 ? (
          <Card>
            <p className="text-sm text-muted">还没有可展示的战绩。完成一场赛事或切磋后，这里会自动出现记录。</p>
          </Card>
        ) : null}
      </section>
    </div>
  );
}

function HistoryCard({ item }: { item: MatchHistoryItem }) {
  return (
    <Link
      className="grid min-h-16 touch-manipulation gap-3 rounded-lg border border-wire bg-surface p-3 shadow-soft transition-colors duration-75 active:bg-field sm:grid-cols-[auto_1fr_auto_auto] sm:items-center"
      href={item.detailHref}
    >
      <span
        className={cn(
          "inline-flex w-fit items-center gap-1 rounded-full px-2 py-1 text-xs font-bold",
          item.source === "赛事" ? "bg-violet-100 text-violet-700" : "bg-emerald-100 text-emerald-700"
        )}
      >
        <Swords className="h-3 w-3" aria-hidden />
        {item.source}
      </span>
      <span className="min-w-0">
        <span className="flex min-w-0 items-center gap-2">
          <PlayerAvatar name={item.myName} avatarUrl={item.myAvatarUrl} size="sm" />
          <span className="min-w-0 truncate text-sm font-black text-ink">{item.myName}</span>
          <span className="shrink-0 text-xs font-black text-muted">vs</span>
          <PlayerAvatar name={item.opponentName} avatarUrl={item.opponentAvatarUrl} size="sm" />
          <span className="min-w-0 truncate text-sm font-black text-ink">{item.opponentName}</span>
        </span>
        <span className="mt-1 block truncate text-xs font-semibold text-muted">
          {item.title} · {item.statusLabel} · {formatDateTime(item.playedAt)}
        </span>
      </span>
      <span
        className={cn(
          "text-lg font-black",
          item.result === "胜" ? "text-emerald-700" : item.result === "负" ? "text-red-700" : "text-amber-700"
        )}
      >
        {item.result}
      </span>
      <span className="text-sm font-black text-board">{item.scoreLabel}</span>
    </Link>
  );
}
