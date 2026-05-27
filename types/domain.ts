export type UserRole = "user" | "admin";
export type SkillLevel = "Beginner" | "Intermediate" | "Advanced" | "Pro";

export type TournamentType = "individual" | "doubles" | "team";
export type TournamentFormat =
  | "round_robin"
  | "single_elimination"
  | "double_elimination";
export type DartMode = "steel" | "soft" | "mixed_alternating";
export type MatchDartMode = "steel" | "soft";
export type MatchFinishMode = "majority" | "play_all";
export type SoftGameVariant =
  | "soft_301"
  | "soft_501"
  | "soft_cricket"
  | "snow_501"
  | "snow_701";
export type MixedFirstDartMode = "soft" | "steel";
export type MatchRuleMode = "standard" | "custom_legs";
export type LegParticipantMode = "singles" | "doubles" | "team";
export type LegGameVariant =
  | "301"
  | "501"
  | "701"
  | SoftGameVariant;

export type MatchLegRule = {
  legNumber: number;
  participantMode: LegParticipantMode;
  dartMode: MatchDartMode;
  gameVariant: LegGameVariant;
};

export type MatchLegLineup = {
  legNumber: number;
  participantAUserIds: string[];
  participantBUserIds: string[];
};

export type MatchLegResult = MatchLegLineup & {
  winnerParticipantId: string;
  participantMode: LegParticipantMode;
  dartMode: MatchDartMode;
  gameVariant: LegGameVariant;
  checkoutScore?: number | null;
};
export type TournamentStatus =
  | "draft"
  | "registration_open"
  | "registration_closed"
  | "in_progress"
  | "completed";

export type RegistrationStatus =
  | "registered"
  | "confirmed"
  | "cancelled"
  | "removed";

export type ParticipantType = "user" | "team";
export type MatchStage = "group" | "knockout";
export type MatchStatus =
  | "not_started"
  | "in_progress"
  | "pending_confirmation"
  | "disputed"
  | "completed"
  | "bye";

export type ResultConfirmationStatus =
  | "pending"
  | "confirmed"
  | "rejected"
  | "disputed"
  | "admin_resolved";

export type Profile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  role: UserRole;
  rating: number;
  skill_level: SkillLevel;
  tournament_rating?: number | null;
  casual_rating?: number | null;
  soft_rating?: number | null;
  tournament_skill_level?: SkillLevel | null;
  casual_skill_level?: SkillLevel | null;
  soft_skill_level?: SkillLevel | null;
};

export type Tournament = {
  id: string;
  created_by: string | null;
  name: string;
  description: string | null;
  location: string | null;
  registration_start_at: string;
  registration_end_at: string;
  tournament_start_at: string;
  max_participants: number;
  tournament_type: TournamentType;
  team_size: number;
  format: TournamentFormat;
  dart_mode: DartMode;
  dart_game: 301 | 501 | 701;
  soft_game: SoftGameVariant;
  mixed_first_dart_mode: MixedFirstDartMode;
  soft_machine_provider: string;
  soft_machine_event_ref: string | null;
  soft_machine_sync_enabled: boolean;
  match_rule_mode: MatchRuleMode;
  match_leg_rules: MatchLegRule[];
  match_finish_mode: MatchFinishMode;
  best_of: 3 | 5 | 7;
  auto_grouping_enabled: boolean;
  balanced_grouping_enabled: boolean;
  manual_result_allowed: boolean;
  status: TournamentStatus;
};

export type ParticipantSeed = {
  id: string;
  name: string;
  rating: number;
  userIds?: string[];
};

export type PlayerSeed = {
  id: string;
  name: string;
  rating: number;
  skillLevel?: SkillLevel;
  preferredPartnerId?: string | null;
};

export type TeamSeed = {
  id: string;
  name: string;
  members: PlayerSeed[];
  totalRating: number;
};

export type GeneratedGroup = {
  name: string;
  index: number;
  members: ParticipantSeed[];
  averageRating: number;
};

export type GeneratedMatch = {
  tempId: string;
  tournamentId?: string;
  groupName?: string;
  stage: MatchStage;
  roundNumber: number;
  matchNumber: number;
  participantAId: string | null;
  participantBId: string | null;
  status: MatchStatus;
  nextMatchTempId?: string;
  nextMatchSlot?: "A" | "B";
  legRules?: MatchLegRule[];
  matchFinishMode?: MatchFinishMode;
};

export type MatchSummary = {
  id: string;
  participant_a_id: string | null;
  participant_b_id: string | null;
  winner_participant_id: string | null;
  score_a: number;
  score_b: number;
  status: MatchStatus;
  dart_mode?: MatchDartMode | null;
  game_variant?: string | null;
  leg_rules?: MatchLegRule[] | null;
  match_finish_mode?: MatchFinishMode | null;
  details?: Record<string, unknown> | null;
};
