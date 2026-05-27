import type { GeneratedGroup, ParticipantSeed, PlayerSeed, TeamSeed } from "@/types/domain";

type GroupingOptions = {
  groupCount: number;
  balanced?: boolean;
  shuffle?: boolean;
  seed?: number;
};

type TeamOptions = {
  teamSize: number;
  teamCount?: number;
  preferredPartnerByPlayerId?: Record<string, string | null | undefined>;
};

function averageRating(members: ParticipantSeed[]) {
  if (members.length === 0) return 0;
  return Math.round(
    members.reduce((total, member) => total + member.rating, 0) / members.length
  );
}

function seededRandom(seed: number) {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function shuffleParticipants(participants: ParticipantSeed[], seed = Date.now()) {
  const random = seededRandom(seed);
  const copy = [...participants];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function buildGroups(groupCount: number): GeneratedGroup[] {
  return Array.from({ length: groupCount }, (_, index) => ({
    name: String.fromCharCode(65 + index),
    index,
    members: [],
    averageRating: 0
  }));
}

export function generateGroups(
  participants: ParticipantSeed[],
  options: GroupingOptions
) {
  const groupCount = Math.max(1, Math.min(options.groupCount, participants.length));
  const groups = buildGroups(groupCount);

  const ordered = options.balanced
    ? [...participants].sort((a, b) => b.rating - a.rating)
    : options.shuffle
      ? shuffleParticipants(participants, options.seed)
      : [...participants];

  ordered.forEach((participant, index) => {
    const lane = Math.floor(index / groupCount);
    const slot =
      options.balanced && lane % 2 === 1
        ? groupCount - 1 - (index % groupCount)
        : index % groupCount;
    groups[slot].members.push(participant);
  });

  return groups.map((group) => ({
    ...group,
    averageRating: averageRating(group.members)
  }));
}

export function generateBalancedTeams(players: PlayerSeed[], options: TeamOptions) {
  const teamSize = Math.max(1, options.teamSize);
  const teamCount = options.teamCount || Math.ceil(players.length / teamSize);
  const ordered = [...players].sort((a, b) => b.rating - a.rating);
  const teams: TeamSeed[] = Array.from({ length: teamCount }, (_, index) => ({
    id: `team-${index + 1}`,
    name: `Team ${index + 1}`,
    members: [],
    totalRating: 0
  }));

  const firstWave = ordered.splice(0, teamCount);
  firstWave.forEach((player, index) => {
    teams[index].members.push(player);
    teams[index].totalRating += player.rating;
  });

  const remaining = ordered.sort((a, b) => a.rating - b.rating);
  while (remaining.length > 0) {
    const fillOrder = [...teams]
      .filter((team) => team.members.length < teamSize)
      .sort((a, b) => b.totalRating - a.totalRating || a.members.length - b.members.length);

    if (fillOrder.length === 0) break;

    for (const team of fillOrder) {
      const player = remaining.shift();
      if (!player) break;
      team.members.push(player);
      team.totalRating += player.rating;
    }
  }

  return teams
    .filter((team) => team.members.length > 0)
    .map((team, index) => ({
      ...team,
      id: `team-${index + 1}`,
      name: `Team ${index + 1}`
    }));
}

export function generatePreferredBalancedTeams(
  players: PlayerSeed[],
  options: TeamOptions
) {
  const teamSize = Math.max(1, options.teamSize);
  if (teamSize === 1) return generateBalancedTeams(players, options);

  const preferredPartnerByPlayerId =
    options.preferredPartnerByPlayerId ||
    Object.fromEntries(players.map((player) => [player.id, player.preferredPartnerId]));
  const remaining = new Map(players.map((player) => [player.id, player]));
  const teams: TeamSeed[] = [];

  const ordered = [...players].sort((a, b) => b.rating - a.rating);
  for (const player of ordered) {
    if (!remaining.has(player.id)) continue;
    const preferredPartnerId = preferredPartnerByPlayerId[player.id];
    if (!preferredPartnerId || preferredPartnerId === player.id) continue;

    const partner = remaining.get(preferredPartnerId);
    if (!partner) continue;

    teams.push({
      id: `team-${teams.length + 1}`,
      name: `Team ${teams.length + 1}`,
      members: [player, partner],
      totalRating: player.rating + partner.rating
    });
    remaining.delete(player.id);
    remaining.delete(partner.id);
  }

  const desiredTeamCount = options.teamCount || Math.ceil(players.length / teamSize);
  while (teams.length < desiredTeamCount) {
    teams.push({
      id: `team-${teams.length + 1}`,
      name: `Team ${teams.length + 1}`,
      members: [],
      totalRating: 0
    });
  }

  const remainingPlayers = [...remaining.values()].sort((a, b) => b.rating - a.rating);
  for (const player of remainingPlayers) {
    const target = [...teams]
      .filter((team) => team.members.length < teamSize)
      .sort((a, b) => {
        if (a.members.length === 0 && b.members.length > 0) return -1;
        if (a.members.length > 0 && b.members.length === 0) return 1;
        return a.totalRating - b.totalRating || a.members.length - b.members.length;
      })[0];

    if (!target) break;
    target.members.push(player);
    target.totalRating += player.rating;
  }

  return teams
    .filter((team) => team.members.length > 0)
    .map((team, index) => ({
      ...team,
      id: `team-${index + 1}`,
      name: `Team ${index + 1}`
    }));
}
