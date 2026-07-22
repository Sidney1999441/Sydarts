#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

loadEnvFile(".env");
loadEnvFile(".env.local");

const args = new Set(process.argv.slice(2));
const teamCount = Number(process.env.DONGKANG_TEST_TEAMS || 8);
const batchId = process.env.DONGKANG_TEST_BATCH || new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const emailPrefix = `dk-league-${batchId}`;
const password = process.env.DONGKANG_TEST_PASSWORD || "DongkangTest2026!";

if (teamCount < 8) {
  throw new Error("DONGKANG_TEST_TEAMS must be at least 8 to cover the attachment playoff cutoff.");
}

const supabaseUrl = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const HARD_RULES = [
  { legNumber: 1, participantMode: "singles", dartMode: "steel", gameVariant: "301" },
  { legNumber: 2, participantMode: "doubles", dartMode: "steel", gameVariant: "501" },
  { legNumber: 3, participantMode: "singles", dartMode: "steel", gameVariant: "301" },
  { legNumber: 4, participantMode: "singles", dartMode: "steel", gameVariant: "501" },
  { legNumber: 5, participantMode: "doubles", dartMode: "steel", gameVariant: "501" },
  { legNumber: 6, participantMode: "singles", dartMode: "steel", gameVariant: "501" },
  { legNumber: 7, participantMode: "doubles", dartMode: "steel", gameVariant: "501" }
];

const SOFT_RULES = [
  { legNumber: 1, participantMode: "singles", dartMode: "soft", gameVariant: "soft_501" },
  { legNumber: 2, participantMode: "doubles", dartMode: "soft", gameVariant: "soft_501" },
  { legNumber: 3, participantMode: "singles", dartMode: "soft", gameVariant: "soft_cricket" },
  { legNumber: 4, participantMode: "doubles", dartMode: "soft", gameVariant: "soft_half_it" },
  { legNumber: 5, participantMode: "singles", dartMode: "soft", gameVariant: "soft_501" },
  { legNumber: 6, participantMode: "singles", dartMode: "soft", gameVariant: "soft_high_score" },
  { legNumber: 7, participantMode: "doubles", dartMode: "soft", gameVariant: "soft_701" }
];

const report = {
  batchId,
  createdAt: new Date().toISOString(),
  tournamentId: null,
  tournamentName: "",
  playerCount: 0,
  playerIds: [],
  teamCount,
  expectedMatchCount: 0,
  actualMatchCount: 0,
  settledMatchCount: 0,
  checks: [],
  warnings: []
};

try {
  await main();
} catch (error) {
  report.checks.push({
    name: "script completed",
    ok: false,
    detail: error instanceof Error ? error.message : String(error)
  });
  persistReport();
  throw error;
}

async function main() {
  const users = await createPlayers();
  report.playerCount = users.length;
  report.playerIds = users.map((user) => user.id);
  addCheck("created enough mock accounts", users.length === teamCount * 2, `${users.length} users`);

  const tournament = await createTournament(users[0].id);
  report.tournamentId = tournament.id;
  report.tournamentName = tournament.name;

  const teams = await createTeamsAndParticipants(tournament.id, users);
  addCheck("created A+B doubles teams", teams.every((team) => team.members.some((m) => m.tier === "A") && team.members.some((m) => m.tier === "B")), `${teams.length} teams`);

  const matches = await createRegularSeasonSchedule(tournament.id, teams);
  report.expectedMatchCount = (teamCount * (teamCount - 1)) / 2 * 2;
  report.actualMatchCount = matches.length;
  addCheck("created hard+soft double round robin", matches.length === report.expectedMatchCount, `${matches.length}/${report.expectedMatchCount} matches`);
  addCheck("every pair has one steel and one soft match", verifyPairModes(matches), "pair mode coverage");

  await settleAllMatches(tournament.id, teams, matches);

  const verification = await verifyDatabaseState(tournament.id, report.playerIds);
  report.settledMatchCount = verification.settledMatchCount;
  for (const check of verification.checks) report.checks.push(check);

  report.warnings.push(
    "A/B tier is represented in this smoke test by ratings and manual team creation; the product still lacks a first-class tier/draw workflow.",
    "Manual soft result forms can store personal totals, but do not yet capture per-leg winner details from the machine UI.",
    "Attachment playoff/extra playoff format uses two-match soft+hard aggregate ties; current bracket automation is still single-match advancement."
  );

  persistReport();
  printSummary();
}

async function createPlayers() {
  const players = [];

  for (let index = 0; index < teamCount * 2; index += 1) {
    const tier = index < teamCount ? "A" : "B";
    const tierIndex = index % teamCount;
    const rating = tier === "A" ? 1680 - tierIndex * 25 : 1220 - tierIndex * 20;
    const displayName = `DK ${tier}${tierIndex + 1} ${batchId}`;
    const email = `${emailPrefix}-${tier.toLowerCase()}${tierIndex + 1}@example.com`;

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: displayName }
    });
    if (error) throw new Error(`createUser ${email}: ${error.message}`);
    if (!data.user?.id) throw new Error(`createUser ${email}: missing user id`);

    await waitForProfile(data.user.id);
    await must(
      admin
        .from("profiles")
        .update({
          display_name: displayName,
          rating,
          tournament_rating: rating,
          casual_rating: rating,
          soft_rating: rating,
          skill_level: tier === "A" ? "Advanced" : "Intermediate",
          tournament_skill_level: tier === "A" ? "Advanced" : "Intermediate",
          casual_skill_level: tier === "A" ? "Advanced" : "Intermediate",
          soft_skill_level: tier === "A" ? "Advanced" : "Intermediate"
        })
        .eq("id", data.user.id),
      `update profile ${email}`
    );

    players.push({
      id: data.user.id,
      email,
      displayName,
      tier,
      rating
    });
  }

  return players;
}

async function waitForProfile(userId) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const { data, error } = await admin.from("profiles").select("id").eq("id", userId).maybeSingle();
    if (error) throw new Error(`wait profile ${userId}: ${error.message}`);
    if (data) return;
    await delay(500);
  }
  throw new Error(`Profile trigger did not create profile for ${userId}`);
}

async function createTournament(createdBy) {
  const tournamentName = `DK Rule Closed Loop ${batchId}`;
  const now = new Date();
  const registrationStart = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const registrationEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  const tournamentStart = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();

  const { data, error } = await admin
    .from("tournaments")
    .insert({
      created_by: createdBy,
      name: tournamentName,
      description: "Automated closed-loop test for Dongkang office darts league rules.",
      location: "Office",
      registration_start_at: registrationStart,
      registration_end_at: registrationEnd,
      tournament_start_at: tournamentStart,
      max_participants: teamCount * 2,
      tournament_type: "doubles",
      team_size: 2,
      format: "round_robin",
      dart_mode: "mixed_alternating",
      dart_game: 501,
      soft_game: "soft_501",
      mixed_first_dart_mode: "soft",
      match_rule_mode: "custom_legs",
      match_leg_rules: { steel: HARD_RULES, soft: SOFT_RULES },
      match_finish_mode: "majority",
      soft_machine_provider: "manual",
      soft_machine_sync_enabled: false,
      best_of: 7,
      auto_grouping_enabled: true,
      balanced_grouping_enabled: true,
      manual_result_allowed: true,
      status: "in_progress"
    })
    .select("id, name")
    .single();

  if (error) throw new Error(`create tournament: ${error.message}`);
  return data;
}

async function createTeamsAndParticipants(tournamentId, users) {
  const aPlayers = users.filter((user) => user.tier === "A");
  const bPlayers = users.filter((user) => user.tier === "B");
  const teams = [];

  for (let index = 0; index < teamCount; index += 1) {
    const members = [aPlayers[index], bPlayers[index]];
    const totalRating = members.reduce((total, member) => total + member.rating, 0);
    const teamName = `DK Team ${index + 1} ${batchId}`;

    const { data: team, error: teamError } = await admin
      .from("teams")
      .insert({
        tournament_id: tournamentId,
        name: teamName,
        total_rating: totalRating,
        captain_user_id: members[0].id,
        status: "active"
      })
      .select("id, name")
      .single();
    if (teamError) throw new Error(`create team ${teamName}: ${teamError.message}`);

    await must(
      admin.from("team_members").insert(
        members.map((member, memberIndex) => ({
          team_id: team.id,
          user_id: member.id,
          rating_snapshot: member.rating,
          skill_level_snapshot: member.tier === "A" ? "Advanced" : "Intermediate",
          role: memberIndex === 0 ? "captain" : "member"
        }))
      ),
      `insert members ${teamName}`
    );

    await must(
      admin.from("tournament_registrations").insert(
        members.map((member) => ({
          tournament_id: tournamentId,
          user_id: member.id,
          status: "confirmed",
          rating_snapshot: member.rating,
          skill_level_snapshot: member.tier === "A" ? "Advanced" : "Intermediate"
        }))
      ),
      `insert registrations ${teamName}`
    );

    const { data: participant, error: participantError } = await admin
      .from("tournament_participants")
      .insert({
        tournament_id: tournamentId,
        team_id: team.id,
        participant_type: "team",
        display_name: teamName,
        rating_snapshot: totalRating,
        skill_level_snapshot: "Advanced",
        seed: index + 1,
        status: "active"
      })
      .select("id, display_name")
      .single();
    if (participantError) throw new Error(`create participant ${teamName}: ${participantError.message}`);

    teams.push({
      id: participant.id,
      name: participant.display_name,
      teamId: team.id,
      members,
      rating: totalRating
    });
  }

  return teams;
}

async function createRegularSeasonSchedule(tournamentId, teams) {
  const { data: group, error: groupError } = await admin
    .from("groups")
    .insert({
      tournament_id: tournamentId,
      name: `Closed Loop Group ${batchId}`,
      group_index: 1,
      status: "active"
    })
    .select("id")
    .single();
  if (groupError) throw new Error(`create group: ${groupError.message}`);

  await must(
    admin.from("group_members").insert(
      teams.map((team, index) => ({
        group_id: group.id,
        participant_id: team.id,
        position: index + 1
      }))
    ),
    "insert group members"
  );

  const baseMatches = generateRoundRobinPairs(teams);
  const matchRows = [];
  let matchNumber = 1;

  for (const base of baseMatches) {
    for (const dartMode of ["soft", "steel"]) {
      const legRules = dartMode === "soft" ? SOFT_RULES : HARD_RULES;
      matchRows.push({
        tournament_id: tournamentId,
        group_id: group.id,
        stage: "group",
        round_number: (base.roundNumber - 1) * 2 + (dartMode === "soft" ? 1 : 2),
        match_number: matchNumber,
        participant_a_id: base.participantAId,
        participant_b_id: base.participantBId,
        status: "not_started",
        dart_mode: dartMode,
        game_variant: legRules[0].gameVariant,
        leg_rules: legRules,
        match_finish_mode: "majority"
      });
      matchNumber += 1;
    }
  }

  const { data, error } = await admin
    .from("matches")
    .insert(matchRows)
    .select("id, participant_a_id, participant_b_id, dart_mode, game_variant, leg_rules, round_number, match_number")
    .order("match_number");
  if (error) throw new Error(`insert matches: ${error.message}`);
  return data || [];
}

function generateRoundRobinPairs(teams) {
  const entries = teams.length % 2 === 0 ? [...teams] : [...teams, null];
  const rounds = entries.length - 1;
  const matches = [];

  for (let round = 1; round <= rounds; round += 1) {
    for (let index = 0; index < entries.length / 2; index += 1) {
      const a = entries[index];
      const b = entries[entries.length - 1 - index];
      if (a && b) {
        matches.push({
          roundNumber: round,
          participantAId: a.id,
          participantBId: b.id
        });
      }
    }

    const fixed = entries[0];
    const rotated = [fixed, entries[entries.length - 1], ...entries.slice(1, -1)];
    entries.splice(0, entries.length, ...rotated);
  }

  return matches;
}

async function settleAllMatches(tournamentId, teams, matches) {
  const teamByParticipantId = new Map(teams.map((team) => [team.id, team]));

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const participantA = teamByParticipantId.get(match.participant_a_id);
    const participantB = teamByParticipantId.get(match.participant_b_id);
    if (!participantA || !participantB) throw new Error(`Missing teams for match ${match.id}`);

    const winnerIsA = (index + Math.floor(index / 7)) % 2 === 0;
    const winnerParticipantId = winnerIsA ? participantA.id : participantB.id;
    const scoreA = winnerIsA ? 4 : index % 3 === 0 ? 3 : 2;
    const scoreB = winnerIsA ? (index % 3 === 0 ? 3 : 2) : 4;
    const rules = match.dart_mode === "soft" ? SOFT_RULES : HARD_RULES;
    const legCount = Math.min(rules.length, scoreA + scoreB);
    const legLineups = buildLegLineups(rules.slice(0, legCount), participantA, participantB);
    const legResults = buildLegResults(rules.slice(0, legCount), legLineups, {
      participantAId: participantA.id,
      participantBId: participantB.id,
      winnerParticipantId,
      scoreA,
      scoreB
    });
    const turns = match.dart_mode === "steel" ? buildHardTurns(legResults, participantA, participantB) : [];
    const stats = buildStatsPayload(match.dart_mode, participantA, participantB, winnerParticipantId, scoreA, scoreB, index);
    const details = {
      source: "dongkang_closed_loop_smoke",
      submissionId: randomUUID(),
      batchId,
      dartMode: match.dart_mode,
      gameVariant: match.game_variant,
      legRules: rules,
      legLineups,
      legResults,
      participantStats: {},
      userStats: stats.userStats
    };

    const { error } = await admin.rpc("settle_tournament_match", {
      p_match_id: match.id,
      p_winner_participant_id: winnerParticipantId,
      p_score_a: scoreA,
      p_score_b: scoreB,
      p_details: details,
      p_leg_results: legResults,
      p_turns: turns,
      p_rating_logs: stats.ratingLogs,
      p_stat_events: stats.statEvents,
      p_confirmation_id: null,
      p_recalculate: false
    });
    if (error) throw new Error(`settle ${match.match_number} ${match.dart_mode}: ${error.message}`);
  }
}

function buildLegLineups(rules, participantA, participantB) {
  const singleIndexes = rules
    .map((rule, index) => ({ rule, index }))
    .filter((item) => item.rule.participantMode === "singles");
  const aSingleOrder = singleIndexes.map((_, index) => participantA.members[index % 2].id);
  const bSingleOrder = singleIndexes.map((_, index) => participantB.members[index % 2].id);
  let singleCursor = 0;

  return rules.map((rule) => {
    if (rule.participantMode === "singles") {
      const lineup = {
        legNumber: rule.legNumber,
        participantAUserIds: [aSingleOrder[singleCursor]],
        participantBUserIds: [bSingleOrder[singleCursor]]
      };
      singleCursor += 1;
      return lineup;
    }

    return {
      legNumber: rule.legNumber,
      participantAUserIds: participantA.members.map((member) => member.id),
      participantBUserIds: participantB.members.map((member) => member.id)
    };
  });
}

function buildLegResults(rules, legLineups, matchResult) {
  let winnerLegs = 0;
  let loserLegs = 0;
  const winnerIsA = matchResult.winnerParticipantId === matchResult.participantAId;

  return rules.map((rule, index) => {
    const giveWinnerLeg =
      winnerLegs < (winnerIsA ? matchResult.scoreA : matchResult.scoreB) &&
      (index % 2 === 0 || loserLegs >= (winnerIsA ? matchResult.scoreB : matchResult.scoreA));
    const winnerParticipantId = giveWinnerLeg
      ? matchResult.winnerParticipantId
      : winnerIsA
        ? matchResult.participantBId
        : matchResult.participantAId;

    if (winnerParticipantId === matchResult.winnerParticipantId) {
      winnerLegs += 1;
    } else {
      loserLegs += 1;
    }

    return {
      ...rule,
      ...legLineups.find((lineup) => lineup.legNumber === rule.legNumber),
      winnerParticipantId,
      checkoutScore: rule.dartMode === "steel" && rule.gameVariant !== "soft_high_score" ? startingScore(rule) === 301 ? 121 : 141 : null,
      startingScore: startingScore(rule)
    };
  });
}

function buildHardTurns(legResults, participantA, participantB) {
  const turns = [];
  for (const leg of legResults) {
    const winnerTeam = leg.winnerParticipantId === participantA.id ? participantA : participantB;
    const loserTeam = leg.winnerParticipantId === participantA.id ? participantB : participantA;
    const winnerLineup = leg.winnerParticipantId === participantA.id ? leg.participantAUserIds : leg.participantBUserIds;
    const loserLineup = leg.winnerParticipantId === participantA.id ? leg.participantBUserIds : leg.participantAUserIds;
    const score = startingScore(leg);
    const checkout = score === 301 ? 121 : 141;

    turns.push({
      participantId: winnerTeam.id,
      userId: winnerLineup[0],
      legNumber: leg.legNumber,
      score: 180,
      darts: 3,
      remainingBefore: score,
      remainingAfter: score - 180,
      isBust: false,
      isCheckout: false
    });
    turns.push({
      participantId: loserTeam.id,
      userId: loserLineup[0],
      legNumber: leg.legNumber,
      score: 60,
      darts: 3,
      remainingBefore: score,
      remainingAfter: score - 60,
      isBust: false,
      isCheckout: false
    });

    if (score === 501) {
      turns.push({
        participantId: winnerTeam.id,
        userId: winnerLineup[1 % winnerLineup.length],
        legNumber: leg.legNumber,
        score: 180,
        darts: 3,
        remainingBefore: 321,
        remainingAfter: 141,
        isBust: false,
        isCheckout: false
      });
      turns.push({
        participantId: loserTeam.id,
        userId: loserLineup[1 % loserLineup.length],
        legNumber: leg.legNumber,
        score: 60,
        darts: 3,
        remainingBefore: score - 60,
        remainingAfter: score - 120,
        isBust: false,
        isCheckout: false
      });
    }

    turns.push({
      participantId: winnerTeam.id,
      userId: winnerLineup[0],
      legNumber: leg.legNumber,
      score: checkout,
      darts: 3,
      remainingBefore: checkout,
      remainingAfter: 0,
      isBust: false,
      isCheckout: true
    });
  }

  return turns;
}

function buildStatsPayload(dartMode, participantA, participantB, winnerParticipantId, scoreA, scoreB, matchIndex) {
  const players = [...participantA.members, ...participantB.members];
  const ratingLogs = [];
  const statEvents = [];
  const userStats = {};

  for (const player of players) {
    const teamId = participantA.members.some((member) => member.id === player.id) ? participantA.id : participantB.id;
    const won = teamId === winnerParticipantId;
    const legsWon = teamId === participantA.id ? scoreA : scoreB;
    const legsLost = teamId === participantA.id ? scoreB : scoreA;
    const delta = won ? 10 : -8;

    if (dartMode === "soft") {
      ratingLogs.push({
        userId: player.id,
        ratingBefore: player.rating,
        ratingAfter: Math.max(100, player.rating + delta),
        delta,
        reason: won ? "match_win" : "match_loss",
        ratingScope: "soft",
        matchSource: "tournament_soft"
      });
      const softStats = {
        averageScore: 58 + (matchIndex % 8),
        averageMpr: 2.1 + (matchIndex % 5) * 0.15,
        highestCheckout: won ? 96 + (matchIndex % 20) : 40 + (matchIndex % 10),
        countHighCheckout: won ? 1 : 0,
        countTon80: matchIndex % 11 === 0 ? 1 : 0,
        countHatTrick: player.tier === "A" && matchIndex % 7 === 0 ? 1 : 0,
        countWhiteHorse: matchIndex % 13 === 0 ? 1 : 0,
        totalMarks: 22 + (matchIndex % 12),
        count5Marks: matchIndex % 4 === 0 ? 1 : 0,
        count6Marks: matchIndex % 6 === 0 ? 1 : 0,
        count7Marks: matchIndex % 9 === 0 ? 1 : 0
      };
      userStats[player.id] = softStats;
      statEvents.push({
        userId: player.id,
        statsScope: "soft",
        won,
        legsWon,
        legsLost,
        averageScore: softStats.averageScore,
        averageScoreSamples: 1,
        averageMpr: softStats.averageMpr,
        averageMprSamples: 1,
        highestCheckout: softStats.highestCheckout,
        countHighCheckout: softStats.countHighCheckout,
        countTon80: softStats.countTon80,
        countHatTrick: softStats.countHatTrick,
        countWhiteHorse: softStats.countWhiteHorse,
        totalMarks: softStats.totalMarks,
        count5Marks: softStats.count5Marks,
        count6Marks: softStats.count6Marks,
        count7Marks: softStats.count7Marks
      });
    } else {
      for (const statsScope of ["tournament", "general"]) {
        ratingLogs.push({
          userId: player.id,
          ratingBefore: player.rating,
          ratingAfter: Math.max(100, player.rating + delta),
          delta,
          reason: won ? "match_win" : "match_loss",
          ratingScope: statsScope,
          matchSource: "tournament"
        });
        statEvents.push({
          userId: player.id,
          statsScope,
          won,
          legsWon,
          legsLost,
          totalScoredPoints: won ? 1500 + matchIndex * 3 : 940 + matchIndex * 2,
          totalDarts: won ? 54 : 63,
          highestTurnScore: won ? 180 : 140,
          bustCount: matchIndex % 5 === 0 ? 1 : 0,
          checkoutCount: won ? 1 : 0,
          highestCheckout: won ? 141 : 0,
          countHighCheckout: won ? 1 : 0,
          count60Plus: 4,
          count80Plus: 3,
          count180: won ? 2 : 0,
          count100Plus: won ? 5 : 2,
          count140Plus: won ? 2 : 1,
          count170Plus: won ? 2 : 0
        });
      }
    }
  }

  return { ratingLogs, statEvents, userStats };
}

async function verifyDatabaseState(tournamentId, userIds) {
  const checks = [];
  const { data: matches, error: matchesError } = await admin
    .from("matches")
    .select("id, status, dart_mode, participant_a_id, participant_b_id, details")
    .eq("tournament_id", tournamentId);
  if (matchesError) throw new Error(`verify matches: ${matchesError.message}`);

  const matchIds = (matches || []).map((match) => match.id);
  const hardMatchIds = (matches || []).filter((match) => match.dart_mode === "steel").map((match) => match.id);
  const softMatchIds = (matches || []).filter((match) => match.dart_mode === "soft").map((match) => match.id);
  const settledMatchCount = (matches || []).filter((match) => match.status === "completed").length;

  checks.push({
    name: "all regular-season matches settled",
    ok: settledMatchCount === report.expectedMatchCount,
    detail: `${settledMatchCount}/${report.expectedMatchCount}`
  });

  const settlementCount = await countRows("match_settlements", "match_id", matchIds);
  checks.push({
    name: "settlement ledger rows written",
    ok: settlementCount === report.expectedMatchCount,
    detail: `${settlementCount}/${report.expectedMatchCount}`
  });

  const hardTurns = await countRows("match_turns", "match_id", hardMatchIds);
  const hardTurnsWithUsers = await countRows("match_turns", "match_id", hardMatchIds, "user_id.not.is.null");
  checks.push({
    name: "hard dart turns record individual throwers",
    ok: hardTurns > 0 && hardTurns === hardTurnsWithUsers,
    detail: `${hardTurnsWithUsers}/${hardTurns} turns with user_id`
  });

  const hardLegs = await countRows("match_legs", "match_id", hardMatchIds);
  const softLegs = await countRows("match_legs", "match_id", softMatchIds);
  checks.push({
    name: "leg rows written for hard and soft matches",
    ok: hardLegs > 0 && softLegs > 0,
    detail: `${hardLegs} hard legs, ${softLegs} soft legs`
  });

  const statEvents = await countRows("match_user_stat_events", "match_id", matchIds);
  const softStatEvents = await countRowsByFilters("match_user_stat_events", {
    match_id: matchIds,
    user_id: userIds,
    stats_scope: ["soft"]
  });
  const hardTournamentStatEvents = await countRowsByFilters("match_user_stat_events", {
    match_id: matchIds,
    user_id: userIds,
    stats_scope: ["tournament"]
  });
  checks.push({
    name: "personal stat events written",
    ok:
      statEvents >= report.expectedMatchCount * 4 &&
      softStatEvents > 0 &&
      hardTournamentStatEvents > 0,
    detail: `${statEvents} total, ${softStatEvents} soft, ${hardTournamentStatEvents} steel tournament`
  });

  const manualSoftMatches = (matches || []).filter(
    (match) => match.dart_mode === "soft" && match.details?.source === "dongkang_closed_loop_smoke"
  );
  checks.push({
    name: "soft matches settled through manual-entry payloads",
    ok: manualSoftMatches.length === softMatchIds.length,
    detail: `${manualSoftMatches.length}/${softMatchIds.length} soft matches`
  });

  const { data: softStats, error: softStatsError } = await admin
    .from("soft_user_stats")
    .select("user_id,matches_played,count_hat_trick,total_marks,count_7_marks")
    .in("user_id", userIds);
  if (softStatsError) throw new Error(`verify soft stats: ${softStatsError.message}`);
  const softRows = softStats || [];
  const softUsersWithMatches = softRows.filter((row) => (row.matches_played || 0) > 0).length;
  const softHatTricks = sumRows(softRows, "count_hat_trick");
  const softMarks = sumRows(softRows, "total_marks");
  checks.push({
    name: "soft personal awards data available",
    ok: softRows.length === userIds.length && softUsersWithMatches === userIds.length && softHatTricks > 0 && softMarks > 0,
    detail: `${softUsersWithMatches}/${userIds.length} users, ${softHatTricks} hat tricks, ${softMarks} marks`
  });

  const { data: hardStats, error: hardStatsError } = await admin
    .from("user_stats")
    .select("user_id,matches_played,highest_checkout,count_high_checkout")
    .in("user_id", userIds);
  if (hardStatsError) throw new Error(`verify hard stats: ${hardStatsError.message}`);
  const hardRows = hardStats || [];
  const hardUsersWithMatches = hardRows.filter((row) => (row.matches_played || 0) > 0).length;
  const hardCheckoutRows = hardRows.filter((row) => (row.highest_checkout || 0) > 0).length;
  const hardHighCheckouts = sumRows(hardRows, "count_high_checkout");
  checks.push({
    name: "hard highest checkout award data available",
    ok: hardRows.length === userIds.length && hardUsersWithMatches === userIds.length && hardCheckoutRows > 0,
    detail: `${hardUsersWithMatches}/${userIds.length} users, ${hardCheckoutRows} checkout rows, ${hardHighCheckouts} high checkout events`
  });

  return { settledMatchCount, checks };
}

async function countRows(table, column, values, extraFilter = "") {
  if (!values.length) return 0;
  let query = admin.from(table).select("*", { count: "exact", head: true }).in(column, values);
  if (extraFilter === "user_id.not.is.null") query = query.not("user_id", "is", null);
  const { count, error } = await query;
  if (error) throw new Error(`count ${table}: ${error.message}`);
  return count || 0;
}

async function countRowsByFilters(table, filters) {
  let query = admin.from(table).select("*", { count: "exact", head: true });
  for (const [column, value] of Object.entries(filters)) {
    if (Array.isArray(value)) {
      query = query.in(column, value);
    } else {
      query = query.eq(column, value);
    }
  }
  const { count, error } = await query;
  if (error) throw new Error(`count ${table}: ${error.message}`);
  return count || 0;
}

function sumRows(rows, column) {
  return rows.reduce((total, row) => total + Number(row[column] || 0), 0);
}

function verifyPairModes(matches) {
  const pairModes = new Map();
  for (const match of matches) {
    const key = [match.participant_a_id, match.participant_b_id].sort().join(":");
    pairModes.set(key, pairModes.get(key) || new Set());
    pairModes.get(key).add(match.dart_mode);
  }
  return [...pairModes.values()].every((modes) => modes.has("soft") && modes.has("steel"));
}

function startingScore(rule) {
  const value = String(rule.gameVariant || "501");
  if (value.endsWith("301")) return 301;
  if (value.endsWith("701")) return 701;
  return 501;
}

async function must(promise, label) {
  const { error } = await promise;
  if (error) throw new Error(`${label}: ${error.message}`);
}

function addCheck(name, ok, detail) {
  report.checks.push({ name, ok, detail });
}

function persistReport() {
  const outputPath = resolve(process.cwd(), `tmp/dongkang-league-test-report-${batchId}.json`);
  writeFileSync(outputPath, JSON.stringify(report, null, 2));
  console.log(`Report: ${outputPath}`);
}

function printSummary() {
  console.log(`Tournament: ${report.tournamentName}`);
  console.log(`Tournament ID: ${report.tournamentId}`);
  console.log(`Batch: ${report.batchId}`);
  for (const check of report.checks) {
    console.log(`${check.ok ? "PASS" : "FAIL"} ${check.name} - ${check.detail}`);
  }
  if (report.warnings.length) {
    console.log("Warnings:");
    for (const warning of report.warnings) console.log(`- ${warning}`);
  }
}

function loadEnvFile(fileName) {
  const filePath = resolve(process.cwd(), fileName);
  if (!existsSync(filePath)) return;

  const content = readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1).trim();
    if (!key || process.env[key] !== undefined) continue;
    process.env[key] = stripQuotes(rawValue);
  }
}

function stripQuotes(value) {
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function normalizeSupabaseUrl(value) {
  return value ? value.replace(/\/+$/, "") : "";
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}
