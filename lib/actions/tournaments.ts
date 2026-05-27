"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { generateGroups, generatePreferredBalancedTeams } from "@/lib/algorithms/grouping";
import { generateRoundRobinMatches, generateSingleEliminationBracket } from "@/lib/algorithms/schedule";
import { requireAdmin, requireUser } from "@/lib/auth/guards";
import { isSnowGame, resolveMatchLegRules, validateMatchLegRules } from "@/lib/darts/variants";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fromFormString } from "@/lib/utils";
import type {
  DartMode,
  MatchFinishMode,
  MatchLegRule,
  MatchRuleMode,
  MixedFirstDartMode,
  ParticipantSeed,
  PlayerSeed,
  SoftGameVariant,
  TournamentFormat,
  TournamentType
} from "@/types/domain";

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
    dart_mode: z.enum(["steel", "soft"]),
    dart_game: z.coerce.number().pipe(z.union([z.literal(301), z.literal(501), z.literal(701)])),
    soft_game: z.enum(["soft_301", "soft_501", "soft_cricket", "snow_501", "snow_701"]),
    mixed_first_dart_mode: z.enum(["soft", "steel"]),
    match_rule_mode: z.enum(["standard", "custom_legs"]),
    match_leg_rules: z.array(
      z.object({
        legNumber: z.number().int().min(1),
        participantMode: z.enum(["singles", "doubles", "team"]),
        dartMode: z.enum(["steel", "soft"]),
        gameVariant: z.string()
      })
    ),
    match_finish_mode: z.enum(["majority", "play_all"]),
    soft_machine_provider: z.string().trim().max(80).default("manual"),
    soft_machine_event_ref: z.string().trim().max(120).optional(),
    soft_machine_sync_enabled: z.boolean(),
    best_of: z.coerce.number().pipe(z.union([z.literal(3), z.literal(5), z.literal(7)])),
    auto_grouping_enabled: z.boolean(),
    balanced_grouping_enabled: z.boolean(),
    manual_result_allowed: z.boolean()
  })
  .superRefine((values, ctx) => {
    if (
      values.dart_mode === "soft" &&
      isSnowGame(values.soft_game) &&
      !(values.tournament_type === "doubles" && values.team_size === 2)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "雪分制501/701 目前仅限双人赛，每队 2 人。"
      });
    }

    if (values.match_rule_mode === "custom_legs") {
      const error = validateMatchLegRules({
        dartMode: values.dart_mode,
        rules: values.match_leg_rules as MatchLegRule[],
        finishMode: values.match_finish_mode
      });
      if (error) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: error });
      }
    }
  });

type ParsedTournamentForm = z.infer<typeof tournamentSchema>;

function booleanFromForm(formData: FormData, key: string) {
  return formData.get(key) === "on" || formData.get(key) === "true";
}

function parseMatchLegRules(raw: FormDataEntryValue | null): MatchLegRule[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(String(raw)) as MatchLegRule[];
    if (!Array.isArray(value)) return [];
    return value.map((rule, index) => ({
      legNumber: index + 1,
      participantMode: rule.participantMode,
      dartMode: rule.dartMode,
      gameVariant: rule.gameVariant
    }));
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
    dart_mode: fromFormString(formData.get("dart_mode")) as Exclude<DartMode, "mixed_alternating">,
    dart_game: formData.get("dart_game"),
    soft_game: fromFormString(formData.get("soft_game")) as SoftGameVariant,
    mixed_first_dart_mode: (fromFormString(formData.get("mixed_first_dart_mode")) || "soft") as MixedFirstDartMode,
    match_rule_mode: matchRuleMode,
    match_leg_rules: matchRuleMode === "custom_legs" ? parseMatchLegRules(formData.get("match_leg_rules")) : [],
    match_finish_mode: (fromFormString(formData.get("match_finish_mode")) || "majority") as MatchFinishMode,
    soft_machine_provider: fromFormString(formData.get("soft_machine_provider")) || "manual",
    soft_machine_event_ref: fromFormString(formData.get("soft_machine_event_ref")) || undefined,
    soft_machine_sync_enabled: booleanFromForm(formData, "soft_machine_sync_enabled"),
    best_of: formData.get("best_of"),
    auto_grouping_enabled: booleanFromForm(formData, "auto_grouping_enabled"),
    balanced_grouping_enabled: booleanFromForm(formData, "balanced_grouping_enabled"),
    manual_result_allowed: booleanFromForm(formData, "manual_result_allowed")
  });
}

function buildMatchRuleSnapshot(tournament: ParsedTournamentForm & { roundNumber?: number }) {
  const legRules = resolveMatchLegRules({
    matchRuleMode: tournament.match_rule_mode,
    customRules: tournament.match_leg_rules,
    dartMode: tournament.dart_mode,
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
    dart_mode: firstRule?.dartMode || tournament.dart_mode,
    game_variant: firstRule?.gameVariant || String(tournament.dart_game || 501),
    leg_rules: legRules,
    match_finish_mode: tournament.match_finish_mode || "majority"
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
  const preferredPartnerUserId = fromFormString(formData.get("preferred_partner_user_id")) || null;
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
  const userId = fromFormString(formData.get("user_id"));
  const supabase = await createSupabaseServerClient();

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, rating, skill_level, tournament_rating, tournament_skill_level")
    .eq("id", userId)
    .single();

  if (profileError) throw new Error(profileError.message);

  const { error } = await supabase.from("tournament_registrations").upsert(
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
  await supabase.from("matches").delete().eq("tournament_id", tournamentId);
  await supabase.from("groups").delete().eq("tournament_id", tournamentId);
  await supabase.from("tournament_participants").delete().eq("tournament_id", tournamentId);
  await supabase.from("teams").delete().eq("tournament_id", tournamentId);

  if (Number(tournament.team_size) === 1 || tournament.tournament_type === "individual") {
    const rows = players.map((player, index) => ({
      tournament_id: tournamentId,
      user_id: player.id,
      participant_type: "user",
      display_name: player.name,
      rating_snapshot: player.rating,
      skill_level_snapshot: player.skillLevel,
      seed: index + 1,
      status: "active"
    }));
    if (rows.length > 0) {
      const { error } = await supabase.from("tournament_participants").insert(rows);
      if (error) throw new Error(error.message);
    }
  } else {
    const teams = generatePreferredBalancedTeams(players, { teamSize: Number(tournament.team_size) });

    for (const [index, team] of teams.entries()) {
      const { data: createdTeam, error: teamError } = await supabase
        .from("teams")
        .insert({
          tournament_id: tournamentId,
          name: team.name,
          total_rating: team.totalRating,
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
        display_name: team.members.map((member) => member.name).join(" / "),
        rating_snapshot: team.totalRating,
        seed: index + 1,
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

export async function generateGroupsAndScheduleAction(formData: FormData) {
  await requireAdmin();
  const tournamentId = fromFormString(formData.get("tournament_id"));
  const groupCount = Number(formData.get("group_count") || 2);
  const supabase = await createSupabaseServerClient();

  const { data: tournament, error: tournamentError } = await supabase
    .from("tournaments")
    .select("id, format, balanced_grouping_enabled, tournament_type, team_size, dart_mode, dart_game, soft_game, mixed_first_dart_mode, match_rule_mode, match_leg_rules, match_finish_mode, best_of")
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
        const { error: matchError } = await supabase.from("matches").insert(
          matches.map((match) => ({
            tournament_id: tournamentId,
            group_id: createdGroup.id,
            stage: match.stage,
            round_number: match.roundNumber,
            match_number: match.matchNumber,
            participant_a_id: match.participantAId,
            participant_b_id: match.participantBId,
            status: "not_started",
            ...buildMatchRuleSnapshot({ ...(tournament as unknown as ParsedTournamentForm), roundNumber: match.roundNumber })
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
