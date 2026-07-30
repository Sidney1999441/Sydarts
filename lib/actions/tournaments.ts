"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { generateGroups, generatePreferredBalancedTeams } from "@/lib/algorithms/grouping";
import {
  expandMixedDartRoundRobinMatches,
  generateRoundRobinMatches,
  generateSingleEliminationBracket
} from "@/lib/algorithms/schedule";
import { requireAdmin, requireUser } from "@/lib/auth/guards";
import { isSnowGame, resolveMatchLegRules, selectMatchLegRules, validateMatchLegRules } from "@/lib/darts/variants";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fromFormString } from "@/lib/utils";
import type {
  DartMode,
  FirstThrowMode,
  MatchDartMode,
  MatchFinishMode,
  MatchLegRuleConfig,
  MatchRuleMode,
  MixedFirstDartMode,
  ParticipantSeed,
  PlayerSeed,
  SoftGameVariant,
  TournamentFormat,
  TournamentType
} from "@/types/domain";

const matchLegRuleSchema = z.object({
  legNumber: z.number().int().min(1),
  participantMode: z.enum(["singles", "doubles", "team"]),
  dartMode: z.enum(["steel", "soft"]),
  gameVariant: z.string()
});

const matchLegRuleConfigSchema = z.union([
  z.array(matchLegRuleSchema),
  z.object({
    steel: z.array(matchLegRuleSchema).optional(),
    soft: z.array(matchLegRuleSchema).optional()
  })
]);

const tournamentSchema = z
  .object({
    name: z.string().min(2),
    description: z.string().optional(),
    location: z.string().optional(),
    registration_start_at: z.string().min(1),
    registration_end_at: z.string().min(1),
    tournament_start_at: z.string().min(1),
    max_participants: z.coerce.number().int().min(2),
    tournament_type: z.enum(["individual", "doubles", "team"]),
    team_size: z.coerce.number().int().min(1).max(8),
    format: z.enum(["round_robin", "single_elimination", "double_elimination"]),
    dart_mode: z.enum(["steel", "soft", "mixed_alternating"]),
    dart_game: z.coerce.number().pipe(z.union([z.literal(301), z.literal(501), z.literal(701)])),
    soft_game: z.enum([
      "soft_301",
      "soft_501",
      "soft_701",
      "soft_cricket",
      "soft_half_it",
      "soft_high_score",
      "snow_501",
      "snow_701"
    ]),
    mixed_first_dart_mode: z.enum(["soft", "steel"]),
    match_rule_mode: z.enum(["standard", "custom_legs"]),
    match_leg_rules: matchLegRuleConfigSchema,
    match_finish_mode: z.enum(["majority", "play_all"]),
    first_throw_mode: z.enum(["alternate", "winner"]).nullable().optional(),
    soft_machine_provider: z.string().trim().max(80).default("manual"),
    soft_machine_event_ref: z.string().trim().max(120).optional(),
    soft_machine_sync_enabled: z.boolean(),
    best_of: z.coerce.number().pipe(z.union([z.literal(3), z.literal(5), z.literal(7)])),
    auto_grouping_enabled: z.boolean(),
    balanced_grouping_enabled: z.boolean(),
    manual_result_allowed: z.boolean()
  })
  .superRefine((values, ctx) => {
    if (values.format === "double_elimination") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "双淘汰赛制暂未开放，请先使用小组循环或单淘汰赛。"
      });
    }

    if (
      values.match_rule_mode !== "custom_legs" &&
      values.dart_mode !== "steel" &&
      isSnowGame(values.soft_game) &&
      !(values.tournament_type === "doubles" && values.team_size === 2)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "雪分制501/701 目前仅限双人赛，每队 2 人。"
      });
    }

    if (values.match_rule_mode === "custom_legs") {
      const modesToValidate: MatchDartMode[] =
        values.dart_mode === "mixed_alternating"
          ? ["steel", "soft"]
          : [values.dart_mode === "soft" ? "soft" : "steel"];

      for (const matchDartMode of modesToValidate) {
        const rules = selectMatchLegRules({
          customRules: values.match_leg_rules,
          matchDartMode,
          dartMode: values.dart_mode,
          dartGame: values.dart_game,
          softGame: values.soft_game
        });
        const error = validateMatchLegRules({
          dartMode: matchDartMode,
          rules,
          finishMode: values.match_finish_mode
        });
        if (error) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: error });
        }
      }
    }
  });

type ParsedTournamentForm = z.infer<typeof tournamentSchema>;

function booleanFromForm(formData: FormData, key: string) {
  return formData.get(key) === "on" || formData.get(key) === "true";
}

function parseFirstThrowMode(value: FormDataEntryValue | null): FirstThrowMode | null {
  const mode = fromFormString(value);
  return mode === "alternate" || mode === "winner" ? mode : null;
}

const userLookupSelect =
  "id, uid, display_name, rating, skill_level, tournament_rating, tournament_skill_level";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function isProfileUid(value: string) {
  return /^[0-9]{6}$/.test(value);
}

function parseIdentifierList(value: FormDataEntryValue | null) {
  return [
    ...new Set(
      fromFormString(value)
        .split(/[\s,，;；]+/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  ];
}

async function resolveProfileByIdentifier(identifier: string) {
  const keyword = identifier.trim();
  if (!keyword) throw new Error("请输入用户 UID 或用户 ID。");

  const admin = createSupabaseAdminClient();
  const query = admin.from("profiles").select(userLookupSelect).eq("status", "active").limit(2);
  const { data, error } = isUuid(keyword)
    ? await query.eq("id", keyword)
    : isProfileUid(keyword)
      ? await query.eq("uid", keyword)
      : await query.ilike("display_name", keyword);

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error(`找不到用户：${keyword}`);
  if (data.length > 1) throw new Error(`“${keyword}”匹配到多个用户，请改用 6 位 UID。`);
  return data[0];
}

async function resolveProfilesByIdentifiers(identifiers: string[]) {
  const profiles = [];
  for (const identifier of identifiers) {
    profiles.push(await resolveProfileByIdentifier(identifier));
  }
  return profiles;
}

async function getTeamCaptainUserId(teamId: string) {
  const admin = createSupabaseAdminClient();
  const { data: team, error: teamError } = await admin
    .from("teams")
    .select("captain_user_id")
    .eq("id", teamId)
    .single();
  if (teamError) throw new Error(teamError.message);
  if (team.captain_user_id) return team.captain_user_id as string;

  const { data: captain } = await admin
    .from("team_members")
    .select("user_id")
    .eq("team_id", teamId)
    .eq("role", "captain")
    .maybeSingle();
  if (captain?.user_id) return captain.user_id as string;

  const { data: firstMember } = await admin
    .from("team_members")
    .select("user_id")
    .eq("team_id", teamId)
    .order("created_at")
    .limit(1)
    .maybeSingle();

  return (firstMember?.user_id as string | undefined) || null;
}

async function syncTournamentTeamSnapshot(input: { tournamentId: string; teamId: string }) {
  const admin = createSupabaseAdminClient();
  const { data: team, error: teamError } = await admin
    .from("teams")
    .select("id, name, captain_user_id")
    .eq("id", input.teamId)
    .single();
  if (teamError) throw new Error(teamError.message);

  const { data: members, error: memberError } = await admin
    .from("team_members")
    .select("rating_snapshot")
    .eq("team_id", input.teamId);
  if (memberError) throw new Error(memberError.message);

  const totalRating = (members || []).reduce(
    (total, member) => total + Number(member.rating_snapshot || 0),
    0
  );

  await admin
    .from("teams")
    .update({
      total_rating: totalRating,
      captain_user_id: team.captain_user_id || (await getTeamCaptainUserId(input.teamId))
    })
    .eq("id", input.teamId);

  await admin
    .from("tournament_participants")
    .update({
      display_name: team.name,
      rating_snapshot: totalRating
    })
    .eq("tournament_id", input.tournamentId)
    .eq("team_id", input.teamId);
}

async function ensureTeamCaptain(input: {
  tournamentId: string;
  teamId: string;
  captainIdentifier: string;
}) {
  const admin = createSupabaseAdminClient();
  const captain = await resolveProfileByIdentifier(input.captainIdentifier);
  const { data: existingMember } = await admin
    .from("team_members")
    .select("id")
    .eq("team_id", input.teamId)
    .eq("user_id", captain.id)
    .maybeSingle();

  if (!existingMember) {
    const { error: insertError } = await admin.from("team_members").insert({
      team_id: input.teamId,
      user_id: captain.id,
      rating_snapshot: captain.tournament_rating ?? captain.rating ?? 1000,
      skill_level_snapshot: captain.tournament_skill_level ?? captain.skill_level ?? "Beginner",
      role: "member"
    });
    if (insertError) throw new Error(insertError.message);
  }

  const { error: resetError } = await admin
    .from("team_members")
    .update({ role: "member" })
    .eq("team_id", input.teamId);
  if (resetError) throw new Error(resetError.message);

  const { error: captainError } = await admin
    .from("team_members")
    .update({ role: "captain" })
    .eq("team_id", input.teamId)
    .eq("user_id", captain.id);
  if (captainError) throw new Error(captainError.message);

  const { error: teamError } = await admin
    .from("teams")
    .update({ captain_user_id: captain.id })
    .eq("id", input.teamId);
  if (teamError) throw new Error(teamError.message);
  await syncTournamentTeamSnapshot({ tournamentId: input.tournamentId, teamId: input.teamId });
  return captain;
}

function parseMatchLegRuleConfig(raw: FormDataEntryValue | null): MatchLegRuleConfig {
  if (!raw) return [];
  try {
    const value = JSON.parse(String(raw)) as MatchLegRuleConfig;
    if (Array.isArray(value)) {
      return value.map((rule, index) => ({
        legNumber: index + 1,
        participantMode: rule.participantMode,
        dartMode: rule.dartMode,
        gameVariant: rule.gameVariant
      }));
    }
    if (value && typeof value === "object") {
      return {
        steel: Array.isArray(value.steel)
          ? value.steel.map((rule, index) => ({ ...rule, legNumber: index + 1, dartMode: "steel" }))
          : [],
        soft: Array.isArray(value.soft)
          ? value.soft.map((rule, index) => ({ ...rule, legNumber: index + 1, dartMode: "soft" }))
          : []
      };
    }
    return [];
  } catch {
    return [];
  }
}

function parseTournamentForm(formData: FormData) {
  const matchRuleMode = (fromFormString(formData.get("match_rule_mode")) || "standard") as MatchRuleMode;

  return tournamentSchema.parse({
    name: fromFormString(formData.get("name")),
    description: fromFormString(formData.get("description")),
    location: fromFormString(formData.get("location")),
    registration_start_at: new Date(fromFormString(formData.get("registration_start_at"))).toISOString(),
    registration_end_at: new Date(fromFormString(formData.get("registration_end_at"))).toISOString(),
    tournament_start_at: new Date(fromFormString(formData.get("tournament_start_at"))).toISOString(),
    max_participants: formData.get("max_participants"),
    tournament_type: fromFormString(formData.get("tournament_type")) as TournamentType,
    team_size: formData.get("team_size"),
    format: fromFormString(formData.get("format")) as TournamentFormat,
    dart_mode: fromFormString(formData.get("dart_mode")) as DartMode,
    dart_game: formData.get("dart_game"),
    soft_game: fromFormString(formData.get("soft_game")) as SoftGameVariant,
    mixed_first_dart_mode: (fromFormString(formData.get("mixed_first_dart_mode")) || "soft") as MixedFirstDartMode,
    match_rule_mode: matchRuleMode,
    match_leg_rules: matchRuleMode === "custom_legs" ? parseMatchLegRuleConfig(formData.get("match_leg_rules")) : [],
    match_finish_mode: (fromFormString(formData.get("match_finish_mode")) || "majority") as MatchFinishMode,
    first_throw_mode: parseFirstThrowMode(formData.get("first_throw_mode")),
    soft_machine_provider: fromFormString(formData.get("soft_machine_provider")) || "manual",
    soft_machine_event_ref: fromFormString(formData.get("soft_machine_event_ref")) || undefined,
    soft_machine_sync_enabled: booleanFromForm(formData, "soft_machine_sync_enabled"),
    best_of: formData.get("best_of"),
    auto_grouping_enabled: booleanFromForm(formData, "auto_grouping_enabled"),
    balanced_grouping_enabled: booleanFromForm(formData, "balanced_grouping_enabled"),
    manual_result_allowed: booleanFromForm(formData, "manual_result_allowed")
  });
}

function buildMatchRuleSnapshot(tournament: ParsedTournamentForm & { roundNumber?: number; forceDartMode?: MatchDartMode }) {
  const legRules = resolveMatchLegRules({
    matchRuleMode: tournament.match_rule_mode,
    customRules: tournament.match_leg_rules,
    dartMode: tournament.forceDartMode || tournament.dart_mode,
    dartGame: tournament.dart_game,
    softGame: tournament.soft_game,
    bestOf: tournament.best_of,
    tournamentType: tournament.tournament_type,
    teamSize: tournament.team_size,
    roundNumber: tournament.roundNumber,
    mixedFirstDartMode: tournament.mixed_first_dart_mode
  });
  const firstRule = legRules[0];

  return {
    dart_mode: firstRule?.dartMode || tournament.forceDartMode || tournament.dart_mode,
    game_variant: firstRule?.gameVariant || String(tournament.dart_game || 501),
    leg_rules: legRules,
    match_finish_mode: tournament.match_finish_mode || "majority",
    first_throw_mode: tournament.first_throw_mode || null
  };
}

export async function createTournamentAction(formData: FormData) {
  const { user } = await requireAdmin();
  const values = parseTournamentForm(formData);
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("tournaments")
    .insert({ ...values, created_by: user.id, status: "draft" })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/admin/tournaments");
  redirect(`/admin/tournaments/${data.id}/edit?created=1`);
}

export async function updateTournamentAction(tournamentId: string, formData: FormData) {
  await requireAdmin();
  const values = parseTournamentForm(formData);
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("tournaments")
    .update(values)
    .eq("id", tournamentId);

  if (error) throw new Error(error.message);
  revalidatePath(`/admin/tournaments/${tournamentId}/edit`);
  revalidatePath(`/tournaments/${tournamentId}`);
  redirect(`/admin/tournaments/${tournamentId}/edit?saved=1`);
}

export async function setTournamentStatusAction(formData: FormData) {
  await requireAdmin();
  const tournamentId = fromFormString(formData.get("tournament_id"));
  const status = fromFormString(formData.get("status"));
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("tournaments")
    .update({ status })
    .eq("id", tournamentId);

  if (error) throw new Error(error.message);
  revalidatePath("/admin/tournaments");
  revalidatePath(`/tournaments/${tournamentId}`);
}

export async function deleteTournamentAction(formData: FormData) {
  await requireAdmin();
  const tournamentId = fromFormString(formData.get("tournament_id"));
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.from("tournaments").delete().eq("id", tournamentId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/tournaments");
}

export async function registerForTournamentAction(formData: FormData) {
  const { user, profile } = await requireUser();
  const tournamentId = fromFormString(formData.get("tournament_id"));
  const preferredPartnerIdentifier =
    fromFormString(formData.get("preferred_partner_user_id")) ||
    fromFormString(formData.get("preferred_partner_identifier"));
  const preferredPartnerProfile = preferredPartnerIdentifier
    ? await resolveProfileByIdentifier(preferredPartnerIdentifier)
    : null;
  const preferredPartnerUserId = preferredPartnerProfile?.id || null;
  if (preferredPartnerUserId === user.id) {
    throw new Error("搭档不能选择自己。");
  }
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.from("tournament_registrations").upsert(
    {
      tournament_id: tournamentId,
      user_id: user.id,
      status: "registered",
      rating_snapshot: profile?.tournament_rating ?? profile?.rating ?? 1000,
      skill_level_snapshot: profile?.tournament_skill_level ?? profile?.skill_level ?? "Beginner",
      preferred_partner_user_id: preferredPartnerUserId
    },
    { onConflict: "tournament_id,user_id" }
  );

  if (error) throw new Error(error.message);
  revalidatePath(`/tournaments/${tournamentId}`);
}

export async function cancelRegistrationAction(formData: FormData) {
  const { user } = await requireUser();
  const tournamentId = fromFormString(formData.get("tournament_id"));
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("tournament_registrations")
    .update({ status: "cancelled" })
    .eq("tournament_id", tournamentId)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);
  revalidatePath(`/tournaments/${tournamentId}`);
}

export async function updateRegistrationStatusAction(formData: FormData) {
  await requireAdmin();
  const registrationId = fromFormString(formData.get("registration_id"));
  const status = fromFormString(formData.get("status"));
  const tournamentId = fromFormString(formData.get("tournament_id"));
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("tournament_registrations")
    .update({ status })
    .eq("id", registrationId);

  if (error) throw new Error(error.message);
  revalidatePath(`/admin/tournaments/${tournamentId}/participants`);
}

export async function adminAddRegistrationByUserIdAction(formData: FormData) {
  await requireAdmin();
  const tournamentId = fromFormString(formData.get("tournament_id"));
  const userIdentifier =
    fromFormString(formData.get("user_identifier")) || fromFormString(formData.get("user_id"));
  const admin = createSupabaseAdminClient();
  const profile = await resolveProfileByIdentifier(userIdentifier);

  const { error } = await admin.from("tournament_registrations").upsert(
    {
      tournament_id: tournamentId,
      user_id: profile.id,
      status: "confirmed",
      rating_snapshot: profile.tournament_rating ?? profile.rating ?? 1000,
      skill_level_snapshot: profile.tournament_skill_level ?? profile.skill_level ?? "Beginner"
    },
    { onConflict: "tournament_id,user_id" }
  );

  if (error) throw new Error(error.message);
  revalidatePath(`/admin/tournaments/${tournamentId}/participants`);
}

async function loadConfirmedPlayers(tournamentId: string): Promise<PlayerSeed[]> {
  const supabase = await createSupabaseServerClient();
  const { data: registrations, error } = await supabase
    .from("tournament_registrations")
    .select("user_id, rating_snapshot, skill_level_snapshot, preferred_partner_user_id, status")
    .eq("tournament_id", tournamentId)
    .in("status", ["registered", "confirmed"]);

  if (error) throw new Error(error.message);

  const userIds = (registrations || []).map((registration) => registration.user_id);
  if (userIds.length === 0) return [];

  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, display_name, rating, skill_level, tournament_rating, tournament_skill_level")
    .in("id", userIds);

  if (profileError) throw new Error(profileError.message);
  const profileById = new Map((profiles || []).map((profile) => [profile.id, profile]));

  return (registrations || []).map((registration) => {
    const profile = profileById.get(registration.user_id);
    return {
      id: registration.user_id,
      name: profile?.display_name || "Unnamed player",
      rating: registration.rating_snapshot || profile?.tournament_rating || profile?.rating || 1000,
      skillLevel: registration.skill_level_snapshot || profile?.tournament_skill_level || profile?.skill_level || "Beginner",
      preferredPartnerId: registration.preferred_partner_user_id
    };
  });
}

export async function generateTeamsAction(formData: FormData) {
  await requireAdmin();
  const tournamentId = fromFormString(formData.get("tournament_id"));
  const supabase = await createSupabaseServerClient();

  const { data: tournament, error: tournamentError } = await supabase
    .from("tournaments")
    .select("id, name, team_size, tournament_type")
    .eq("id", tournamentId)
    .single();

  if (tournamentError) throw new Error(tournamentError.message);

  const players = await loadConfirmedPlayers(tournamentId);
  const { data: preservedTeams } = await supabase
    .from("teams")
    .select("id")
    .eq("tournament_id", tournamentId)
    .not("saved_team_id", "is", null);
  const preservedTeamIds = (preservedTeams || []).map((team) => team.id);
  const seedOffset = preservedTeamIds.length;
  const { data: preservedMembers } =
    preservedTeamIds.length > 0
      ? await supabase.from("team_members").select("user_id").in("team_id", preservedTeamIds)
      : { data: [] };
  const preservedUserIds = new Set((preservedMembers || []).map((member) => member.user_id));
  const playersForGeneration = players.filter((player) => !preservedUserIds.has(player.id));

  await supabase.from("matches").delete().eq("tournament_id", tournamentId);
  await supabase.from("groups").delete().eq("tournament_id", tournamentId);
  if (preservedTeamIds.length > 0) {
    await supabase
      .from("tournament_participants")
      .delete()
      .eq("tournament_id", tournamentId)
      .is("team_id", null);
    const { data: generatedTeams } = await supabase
      .from("teams")
      .select("id")
      .eq("tournament_id", tournamentId)
      .is("saved_team_id", null);
    const generatedTeamIds = (generatedTeams || []).map((team) => team.id);
    if (generatedTeamIds.length > 0) {
      await supabase
        .from("tournament_participants")
        .delete()
        .eq("tournament_id", tournamentId)
        .in("team_id", generatedTeamIds);
      await supabase.from("teams").delete().in("id", generatedTeamIds);
    }
  } else {
    await supabase.from("tournament_participants").delete().eq("tournament_id", tournamentId);
    await supabase.from("teams").delete().eq("tournament_id", tournamentId);
  }

  if (Number(tournament.team_size) === 1 || tournament.tournament_type === "individual") {
    const rows = playersForGeneration.map((player, index) => ({
      tournament_id: tournamentId,
      user_id: player.id,
      participant_type: "user",
      display_name: player.name,
      rating_snapshot: player.rating,
      skill_level_snapshot: player.skillLevel,
      seed: seedOffset + index + 1,
      status: "active"
    }));
    if (rows.length > 0) {
      const { error } = await supabase.from("tournament_participants").insert(rows);
      if (error) throw new Error(error.message);
    }
  } else {
    const teams = generatePreferredBalancedTeams(playersForGeneration, { teamSize: Number(tournament.team_size) });

    for (const [index, team] of teams.entries()) {
      const { data: createdTeam, error: teamError } = await supabase
        .from("teams")
        .insert({
          tournament_id: tournamentId,
          name: team.name,
          total_rating: team.totalRating,
          captain_user_id: team.members[0]?.id || null,
          status: "active"
        })
        .select("id")
        .single();

      if (teamError) throw new Error(teamError.message);

      const memberRows = team.members.map((member, memberIndex) => ({
        team_id: createdTeam.id,
        user_id: member.id,
        rating_snapshot: member.rating,
        skill_level_snapshot: member.skillLevel || "Beginner",
        role: memberIndex === 0 ? "captain" : "member"
      }));
      const { error: memberError } = await supabase.from("team_members").insert(memberRows);
      if (memberError) throw new Error(memberError.message);

      const { error: participantError } = await supabase.from("tournament_participants").insert({
        tournament_id: tournamentId,
        team_id: createdTeam.id,
        participant_type: "team",
        display_name: team.name,
        rating_snapshot: team.totalRating,
        seed: seedOffset + index + 1,
        status: "active"
      });
      if (participantError) throw new Error(participantError.message);
    }
  }

  await supabase
    .from("tournament_registrations")
    .update({ status: "confirmed" })
    .eq("tournament_id", tournamentId)
    .in("status", ["registered", "confirmed"]);

  revalidatePath(`/admin/tournaments/${tournamentId}/participants`);
  revalidatePath(`/admin/tournaments/${tournamentId}/schedule`);
}

export async function updateTournamentTeamAction(formData: FormData) {
  await requireAdmin();
  const tournamentId = fromFormString(formData.get("tournament_id"));
  const teamId = fromFormString(formData.get("team_id"));
  const name = fromFormString(formData.get("name"));
  const captainIdentifier = fromFormString(formData.get("captain_identifier"));
  const admin = createSupabaseAdminClient();

  if (!name) throw new Error("请输入队伍名称。");

  const { error } = await admin
    .from("teams")
    .update({
      name
    })
    .eq("id", teamId)
    .eq("tournament_id", tournamentId);
  if (error) throw new Error(error.message);

  await admin
    .from("tournament_participants")
    .update({ display_name: name })
    .eq("tournament_id", tournamentId)
    .eq("team_id", teamId);

  if (captainIdentifier) {
    await ensureTeamCaptain({ tournamentId, teamId, captainIdentifier });
  } else {
    await syncTournamentTeamSnapshot({ tournamentId, teamId });
  }

  revalidatePath(`/admin/tournaments/${tournamentId}/participants`);
  revalidatePath(`/tournaments/${tournamentId}`);
}

export async function addTournamentTeamMemberAction(formData: FormData) {
  await requireAdmin();
  const tournamentId = fromFormString(formData.get("tournament_id"));
  const teamId = fromFormString(formData.get("team_id"));
  const userIdentifier =
    fromFormString(formData.get("user_identifier")) || fromFormString(formData.get("user_id"));
  const profile = await resolveProfileByIdentifier(userIdentifier);
  const admin = createSupabaseAdminClient();

  const { data: team, error: teamError } = await admin
    .from("teams")
    .select("captain_user_id")
    .eq("id", teamId)
    .eq("tournament_id", tournamentId)
    .single();
  if (teamError) throw new Error(teamError.message);

  const { error } = await admin.from("team_members").upsert(
    {
      team_id: teamId,
      user_id: profile.id,
      rating_snapshot: profile.tournament_rating ?? profile.rating ?? 1000,
      skill_level_snapshot: profile.tournament_skill_level ?? profile.skill_level ?? "Beginner",
      role: team?.captain_user_id ? "member" : "captain"
    },
    { onConflict: "team_id,user_id" }
  );
  if (error) throw new Error(error.message);

  if (!team?.captain_user_id) {
    await admin.from("teams").update({ captain_user_id: profile.id }).eq("id", teamId);
  }

  await syncTournamentTeamSnapshot({ tournamentId, teamId });
  revalidatePath(`/admin/tournaments/${tournamentId}/participants`);
  revalidatePath(`/tournaments/${tournamentId}`);
}

export async function removeTournamentTeamMemberAction(formData: FormData) {
  await requireAdmin();
  const tournamentId = fromFormString(formData.get("tournament_id"));
  const teamId = fromFormString(formData.get("team_id"));
  const userId = fromFormString(formData.get("user_id"));
  const admin = createSupabaseAdminClient();

  const { error } = await admin
    .from("team_members")
    .delete()
    .eq("team_id", teamId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);

  const { data: team } = await admin
    .from("teams")
    .select("captain_user_id")
    .eq("id", teamId)
    .maybeSingle();

  if (team?.captain_user_id === userId) {
    const { data: nextCaptain } = await admin
      .from("team_members")
      .select("user_id")
      .eq("team_id", teamId)
      .order("created_at")
      .limit(1)
      .maybeSingle();
    await admin
      .from("teams")
      .update({ captain_user_id: nextCaptain?.user_id || null })
      .eq("id", teamId);
    if (nextCaptain?.user_id) {
      await ensureTeamCaptain({
        tournamentId,
        teamId,
        captainIdentifier: nextCaptain.user_id
      });
    }
  }

  await syncTournamentTeamSnapshot({ tournamentId, teamId });
  revalidatePath(`/admin/tournaments/${tournamentId}/participants`);
  revalidatePath(`/tournaments/${tournamentId}`);
}

export async function saveTournamentTeamAsSavedAction(formData: FormData) {
  await requireAdmin();
  const tournamentId = fromFormString(formData.get("tournament_id"));
  const teamId = fromFormString(formData.get("team_id"));
  const admin = createSupabaseAdminClient();

  const { data: team, error: teamError } = await admin
    .from("teams")
    .select("id, name, avatar_url, captain_user_id, saved_team_id")
    .eq("id", teamId)
    .eq("tournament_id", tournamentId)
    .single();
  if (teamError) throw new Error(teamError.message);

  const captainUserId = team.captain_user_id || (await getTeamCaptainUserId(teamId));
  if (!captainUserId) throw new Error("保存长期队伍前需要先设置队长。");

  if (team.saved_team_id) {
    const { error: updateError } = await admin
      .from("saved_teams")
      .update({
        name: team.name,
        avatar_url: team.avatar_url || null,
        captain_user_id: captainUserId,
        status: "active"
      })
      .eq("id", team.saved_team_id);
    if (updateError) throw new Error(updateError.message);
  } else {
    const { data: savedTeam, error: insertError } = await admin
      .from("saved_teams")
      .insert({
        name: team.name,
        avatar_url: team.avatar_url || null,
        captain_user_id: captainUserId,
        created_by: captainUserId,
        status: "active"
      })
      .select("id")
      .single();
    if (insertError) throw new Error(insertError.message);

    const { error: linkError } = await admin
      .from("teams")
      .update({
        saved_team_id: savedTeam.id,
        captain_user_id: captainUserId
      })
      .eq("id", teamId);
    if (linkError) throw new Error(linkError.message);
  }

  revalidatePath(`/admin/tournaments/${tournamentId}/participants`);
  revalidatePath("/profile");
}

export async function registerSavedTeamForTournamentAction(formData: FormData) {
  const { user, profile } = await requireUser();
  const tournamentId = fromFormString(formData.get("tournament_id"));
  const savedTeamId = fromFormString(formData.get("saved_team_id"));
  const memberIdentifiers = parseIdentifierList(formData.get("member_identifiers"));
  const admin = createSupabaseAdminClient();

  const { data: savedTeam, error: savedTeamError } = await admin
    .from("saved_teams")
    .select("id, name, avatar_url, captain_user_id, status")
    .eq("id", savedTeamId)
    .single();
  if (savedTeamError) throw new Error(savedTeamError.message);
  if (savedTeam.status !== "active") throw new Error("这个长期队伍已归档。");
  if (profile?.role !== "admin" && savedTeam.captain_user_id !== user.id) {
    throw new Error("只有队长或管理员可以使用这个长期队伍报名。");
  }

  const { data: tournament, error: tournamentError } = await admin
    .from("tournaments")
    .select("id, status, tournament_type, team_size")
    .eq("id", tournamentId)
    .single();
  if (tournamentError) throw new Error(tournamentError.message);
  if (Number(tournament.team_size) <= 1 || tournament.tournament_type === "individual") {
    throw new Error("长期队伍只能报名双人赛或队制赛。");
  }
  if (profile?.role !== "admin" && tournament.status !== "registration_open") {
    throw new Error("当前赛事未开放队伍报名。");
  }

  const profiles = await resolveProfilesByIdentifiers(memberIdentifiers);
  const teamSize = Number(tournament.team_size || 2);
  if (profiles.length !== teamSize) {
    throw new Error(`本赛事每队 ${teamSize} 人，请输入刚好 ${teamSize} 个队员 UID。`);
  }
  if (!profiles.some((item) => item.id === savedTeam.captain_user_id)) {
    throw new Error("本次报名队员必须包含队长。");
  }

  const { data: existingTeam } = await admin
    .from("teams")
    .select("id")
    .eq("tournament_id", tournamentId)
    .eq("saved_team_id", savedTeam.id)
    .eq("status", "active")
    .maybeSingle();
  if (existingTeam) {
    throw new Error("这个长期队伍已经报名了本赛事。");
  }

  const totalRating = profiles.reduce(
    (total, item) => total + Number(item.tournament_rating ?? item.rating ?? 1000),
    0
  );

  const { data: createdTeam, error: teamError } = await admin
    .from("teams")
    .insert({
      tournament_id: tournamentId,
      saved_team_id: savedTeam.id,
      captain_user_id: savedTeam.captain_user_id,
      name: savedTeam.name,
      avatar_url: savedTeam.avatar_url || null,
      total_rating: totalRating,
      status: "active"
    })
    .select("id")
    .single();
  if (teamError) throw new Error(teamError.message);

  const { error: memberError } = await admin.from("team_members").insert(
    profiles.map((item) => ({
      team_id: createdTeam.id,
      user_id: item.id,
      rating_snapshot: item.tournament_rating ?? item.rating ?? 1000,
      skill_level_snapshot: item.tournament_skill_level ?? item.skill_level ?? "Beginner",
      role: item.id === savedTeam.captain_user_id ? "captain" : "member"
    }))
  );
  if (memberError) throw new Error(memberError.message);

  const { error: registrationError } = await admin.from("tournament_registrations").upsert(
    profiles.map((item) => ({
      tournament_id: tournamentId,
      user_id: item.id,
      status: "confirmed",
      rating_snapshot: item.tournament_rating ?? item.rating ?? 1000,
      skill_level_snapshot: item.tournament_skill_level ?? item.skill_level ?? "Beginner"
    })),
    { onConflict: "tournament_id,user_id" }
  );
  if (registrationError) throw new Error(registrationError.message);

  const { error: participantError } = await admin.from("tournament_participants").insert({
    tournament_id: tournamentId,
    team_id: createdTeam.id,
    participant_type: "team",
    display_name: savedTeam.name,
    rating_snapshot: totalRating,
    status: "active"
  });
  if (participantError) throw new Error(participantError.message);

  revalidatePath(`/admin/tournaments/${tournamentId}/participants`);
  revalidatePath(`/tournaments/${tournamentId}`);
  revalidatePath("/profile");
}

export async function generateGroupsAndScheduleAction(formData: FormData) {
  await requireAdmin();
  const tournamentId = fromFormString(formData.get("tournament_id"));
  const groupCount = Number(formData.get("group_count") || 2);
  const supabase = await createSupabaseServerClient();

  const { data: tournament, error: tournamentError } = await supabase
    .from("tournaments")
    .select("id, format, balanced_grouping_enabled, tournament_type, team_size, dart_mode, dart_game, soft_game, mixed_first_dart_mode, match_rule_mode, match_leg_rules, match_finish_mode, first_throw_mode, best_of")
    .eq("id", tournamentId)
    .single();

  if (tournamentError) throw new Error(tournamentError.message);

  const { data: participants, error: participantsError } = await supabase
    .from("tournament_participants")
    .select("id, display_name, rating_snapshot")
    .eq("tournament_id", tournamentId)
    .eq("status", "active")
    .order("seed");

  if (participantsError) throw new Error(participantsError.message);
  const seeds: ParticipantSeed[] = (participants || []).map((participant) => ({
    id: participant.id,
    name: participant.display_name,
    rating: participant.rating_snapshot || 1000
  }));

  await supabase.from("matches").delete().eq("tournament_id", tournamentId);
  await supabase.from("groups").delete().eq("tournament_id", tournamentId);

  if (tournament.format === "single_elimination") {
    const generated = generateSingleEliminationBracket(seeds);
    const { data: insertedMatches, error } = await supabase.from("matches").insert(
      generated.map((match) => ({
        tournament_id: tournamentId,
        stage: match.stage,
        round_number: match.roundNumber,
        match_number: match.matchNumber,
        participant_a_id: match.participantAId,
        participant_b_id: match.participantBId,
        winner_participant_id:
          match.status === "bye" ? match.participantAId || match.participantBId : null,
        status: match.status,
        ...buildMatchRuleSnapshot({ ...(tournament as unknown as ParsedTournamentForm), roundNumber: match.roundNumber }),
        details: { tempId: match.tempId }
      }))
    ).select("id, details");
    if (error) throw new Error(error.message);

    const idByTempId = new Map(
      (insertedMatches || []).map((match) => [
        (match.details as { tempId?: string } | null)?.tempId,
        match.id
      ])
    );

    for (const match of generated) {
      const matchId = idByTempId.get(match.tempId);
      const nextMatchId = match.nextMatchTempId
        ? idByTempId.get(match.nextMatchTempId)
        : undefined;
      if (!matchId || !nextMatchId || !match.nextMatchSlot) continue;

      const { error: linkError } = await supabase
        .from("matches")
        .update({
          next_match_id: nextMatchId,
          next_match_slot: match.nextMatchSlot
        })
        .eq("id", matchId);
      if (linkError) throw new Error(linkError.message);

      if (match.status === "bye") {
        const byeWinnerId = match.participantAId || match.participantBId;
        if (!byeWinnerId) continue;
        const nextSlotColumn =
          match.nextMatchSlot === "A" ? "participant_a_id" : "participant_b_id";
        const { error: advanceError } = await supabase
          .from("matches")
          .update({ [nextSlotColumn]: byeWinnerId })
          .eq("id", nextMatchId);
        if (advanceError) throw new Error(advanceError.message);
      }
    }
  } else {
    const groups = generateGroups(seeds, {
      groupCount,
      balanced: Boolean(tournament.balanced_grouping_enabled)
    });

    for (const group of groups) {
      const { data: createdGroup, error: groupError } = await supabase
        .from("groups")
        .insert({
          tournament_id: tournamentId,
          name: group.name,
          group_index: group.index,
          status: "active"
        })
        .select("id")
        .single();

      if (groupError) throw new Error(groupError.message);

      const groupMembers = group.members.map((member, index) => ({
        group_id: createdGroup.id,
        participant_id: member.id,
        position: index + 1
      }));
      if (groupMembers.length > 0) {
        const { error: memberError } = await supabase.from("group_members").insert(groupMembers);
        if (memberError) throw new Error(memberError.message);
      }

      const matches = generateRoundRobinMatches(group.members, { groupName: group.name });
      if (matches.length > 0) {
        const scheduledMatches =
          tournament.dart_mode === "mixed_alternating"
            ? expandMixedDartRoundRobinMatches(matches, {
                firstDartMode: tournament.mixed_first_dart_mode
              })
            : matches.map((match) => ({ ...match, forceDartMode: undefined as MatchDartMode | undefined }));

        const { error: matchError } = await supabase.from("matches").insert(
          scheduledMatches.map((match, index) => ({
            tournament_id: tournamentId,
            group_id: createdGroup.id,
            stage: match.stage,
            round_number: match.roundNumber,
            match_number: index + 1,
            participant_a_id: match.participantAId,
            participant_b_id: match.participantBId,
            status: "not_started",
            ...buildMatchRuleSnapshot({
              ...(tournament as unknown as ParsedTournamentForm),
              roundNumber: match.roundNumber,
              forceDartMode: match.forceDartMode
            })
          }))
        );
        if (matchError) throw new Error(matchError.message);
      }
    }
  }

  await supabase.from("tournaments").update({ status: "in_progress" }).eq("id", tournamentId);
  revalidatePath(`/admin/tournaments/${tournamentId}/schedule`);
  revalidatePath(`/tournaments/${tournamentId}`);
}
