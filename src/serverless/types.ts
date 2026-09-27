import type {RatingChange} from '../ladder-core';

export type MatchStatus =
  | 'pending'
  | 'accepted'
  | 'active'
  | 'awaiting_confirmation'
  | 'disputed'
  | 'finished'
  | 'declined'
  | 'expired'
  | 'cancelled';

export interface SeasonPlayer {
  userId: string;
  userName?: string;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
}

export interface SeasonHistory {
  id: string; // randomUUID
  guildId: string;
  seasonName: string;
  endedAt: number;
  topPlayers: SeasonPlayer[];
}

export interface LadderSettings {
  guildId: string;
  modRoleIds: string[];
  resultTimeoutMinutes: number;
  logChannelId?: string;
  matchCategoryId?: string;
  leaderboardChannelId?: string;
  leaderboardMessageId?: string;
  leaderboardScope?: 'server' | 'global';
  scheduledSeasonName?: string;
  scheduledSeasonEnd?: number;
  scheduledSeasonResetMode?: string;
  hallOfFameChannelId?: string;
  hallOfFameRoleId?: string;
  topRoleIds?: string[];
  currentTopUsers?: string[];
  defaultDailyRoleId?: string;
}

export interface RatingRow {
  userId: string;
  userName?: string;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  peakRating: number;
  matches: number;
  ryucoin: number;
  wallpaperId: string;
  unlockedWallpapers: string[];
  dailyStreak?: number;
  lastDailyClaim?: number;
  updatedAt?: number;
  thumbnailUrl?: string;
  selected_achievements?: string;
}

export interface LadderMatch {
  id: string;
  guildId: string;
  channelId: string;
  matchChannelId?: string;
  challengerId: string;
  challengerName: string;
  opponentId: string;
  opponentName: string;
  status: MatchStatus;
  proposedWinnerId?: string;
  proposedById?: string;
  confirmationDeadline?: number;
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
  winnerUserId?: string;
  resolutionNote?: string;
  controlMessageId?: string;
  proofImageUrl?: string;
}

export interface FinalResult {
  match: LadderMatch;
  change: RatingChange;
}

export interface DiscordUser {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
  bot?: boolean;
}

export interface DiscordMember {
  user?: DiscordUser;
  roles?: string[];
  permissions?: string;
  nick?: string | null;
}

export interface DiscordOption {
  name: string;
  type: number;
  value?: string | number | boolean;
  options?: DiscordOption[];
}

export interface DiscordInteraction {
  id: string;
  application_id: string;
  type: number;
  token: string;
  guild_id?: string;
  channel_id?: string;
  guild?: {id: string; name?: string};
  member?: DiscordMember;
  user?: DiscordUser;
  message?: {id: string; channel_id?: string; flags?: number; content?: string; embeds?: any[]; components?: any[]};
  data?: {
    name?: string;
    custom_id?: string;
    options?: DiscordOption[];
    components?: any[];
    resolved?: {
      users?: Record<string, DiscordUser>;
      members?: Record<string, DiscordMember>;
      roles?: Record<string, {id: string; name: string}>;
      attachments?: Record<string, {id: string; url: string; proxy_url?: string; filename?: string}>;
    };
  };
}

export type DiscordPayload = Record<string, unknown>;
