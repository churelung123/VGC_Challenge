import type { RatingRow } from './types';
import { GET as renderOgProfile } from '@/app/api/og/profile/route';
import { NextRequest } from 'next/server';
import { Dex } from '@pkmn/dex';
import { fetchChampionsBattleData, fetchChampionsMetadata } from './champions-api';
import { randomUUID } from 'node:crypto';
import { signed, shortId } from '../ladder-core';
import { getUserAchievements, setSelectedAchievements, getCustomThumbnail } from './database';
import { getAchievementsList, checkMatchAchievements, checkEconomyAchievements } from './achievements';
import { commandsJson } from '../commands';
import {
  checkIfUserClaimedToday,
  getUserWeeklyPass,
  buyWeeklyPass,
  setUserThumbnail,
  saveCustomThumbnail,
  updateMatchControlMessageId,
  updateMatchProofImage,
  acceptChallenge,
  adjustRating,
  cancelAcceptedMatch,
  createChallenge,
  declineChallenge,
  addWarningAndBlacklist,
  isUserBlacklisted,
  getUserWarnings,
  clearUserWarnings,
  getActiveBlacklist,
  disputeResult,
  expirePendingChallenges,
  getMatch,
  clearMatchProofImage,
  getMatchByChannelId,
  getMatchHistory,
  getMatchHistoryCount,
  getOpenMatchForUser,
  getRating,
  getSettings,
  leaderboard,
  globalLeaderboard,
  leaderboardCount,
  globalLeaderboardCount,
  coinLeaderboard,
  globalCoinLeaderboard,
  coinLeaderboardCount,
  globalCoinLeaderboardCount,
  coinRankPosition,
  markOverdueConfirmations,
  proposeResult,
  cancelProposedResult,
  rankPosition,
  resolveResult,
  cancelMatch,
  setScheduledSeason,
  clearScheduledSeasonIfMatching,
  getOverdueSeasons,
  saveSeasonSnapshot,
  getSeasonsHistory,
  getActiveMatchChannels,
  setLeaderboardMessage,
  setMatchCategory,
  getAllLiveBoardSettings,
  setRatingManual,
  setSettings,
  startAcceptedMatch,
  confirmResult,
  resetGuildData,
  softResetGuildRatings,
  hardResetGuildRatings,
  setHallOfFameConfig,
  deleteSeason,
  updateSeasonName,
  joinQueue,
  leaveQueue,
  expireQueuePlayers,
  setTopRoles,
  updateCurrentTopUsers,
  addRyucoin,
  setWallpaper,
  setUserBackground,
  saveCustomBackground,
  updateUserName,
  createBet,
  getBet,
  getActiveBetInGuild,
  getBetEntries,
  updateBetMessageId,
  updateBetChannelAndMessageId,
  placeBetEntry,
  closeBet,
  stopBet,
  claimDaily,
  setDailyRoleReward,
  removeDailyRoleReward,
  getDailyRoleRewards,
  setDefaultDailyRole,
  transferRyucoin,
  getBank,
  depositToBank,
  setBankManagers,
  withdrawFromBank,
  createGiveaway,
  claimGiveaway,
  createQuestionGiveaway,
  updateGiveawayMessageId,
  getGiveaway,
  createSellShinyListing,
  updateSellShinyMessageId,
  updateSellShinyAnnounceMessageId,
  getSellShinyListing,
  getSellShinyListingByTicketChannelId,
  buySellShinyListing,
  buySellShinyStock,
  updateSellShinyStock,
  buySellShinyTicket,
  getSellShinyTickets,
  getExpiredCompletedSellShinyListings,
  deleteSellShinyListings,
  type SellShinyRow,
  type SellShinyTicketRow,
  SUPER_ADMIN_ID,
  MAIN_GUILD_ID,
  createBill,
  getBill,
  cancelBill,
  expireBill,
  getOverduePendingBills,
  updateBillMessageId,
  type BetRow,
  type BetEntry,
} from './database';

const MOD_ALERT_CHANNEL_ID = '1534804977657188412';

const WALLPAPERS: Record<string, { name: string, url: string, cost: number }> = {
  'default': { name: 'Mặc định (Red-Cyan Gradient)', url: '', cost: 0 },
  'img1': { name: 'Wallpaper 1', url: '/wallpapers/img1.png', cost: 200 },
  'img2': { name: 'Wallpaper 2', url: '/wallpapers/img2.png', cost: 200 },
  'img3': { name: 'Wallpaper 3', url: '/wallpapers/img3.jpg', cost: 200 },
  'img4': { name: 'Wallpaper 4', url: '/wallpapers/img4.jpg', cost: 200 },
  'img5': { name: 'Wallpaper 5', url: '/wallpapers/img5.jpg', cost: 200 },
};

import {
  createMatchChannel,
  createMessage,
  createDMChannel,
  createFollowupMessage,
  deferredMessage,
  deferredUpdate,
  deleteChannel,
  editChannelMessage,
  deleteChannelMessage,
  editInteractionReply,
  deleteInteractionReply,
  ensureMatchChannelOpen,
  addGuildMemberRole,
  removeGuildMemberRole,
  modifyGuildMemberNickname,
  discordRequest,
  type DiscordFile,
} from './discord';
import type {
  DiscordInteraction,
  DiscordOption,
  DiscordPayload,
  DiscordUser,
  FinalResult,
  LadderMatch,
} from './types';

const CHALLENGE_TTL_MS = 2 * 60_000;
const MANAGE_GUILD = 32n;
const BET_ADMIN_IDS = new Set(['983625547076739102', '873563860991365141', '1260534002637471805', '1261422959919366268', '964130916547067904']);

const PUBLIC_COMMANDS = new Set(['set-thumbnail', 'thanh-tuu', 'blacklist', 'xoa-canh-cao', 'check-canh-cao', 'list-blacklist', 'challenge', 'gui-anh', 'leaderboard', 'bxh-coin', 'top-coin', 'coin-leaderboard', 'history', 'qr', 'profile', 'add-ryucoin', 'remove-ryucoin', 'admin', 'show-bet', 'tao-bet', 'stop-bet', 'give', 'bank', 'bank_give', 'set_bank_managers', 'bank_add', 'free-coins', 'free-shiny', 'set-background', 'sync', 'form', 'tao-bill']);

/* ── RYUSEI BROADCAST — bảng màu embed thống nhất ─────────────────────────
 * Gom mọi màu embed về 5 token: gold (danh vọng), ember (thương hiệu/đang
 * diễn ra), crimson (nguy hiểm/tranh chấp), steel (trung tính), win (thành công).
 */
const THEME = {
  gold: 0xFFC24D,
  ember: 0xFF7A2F,
  crimson: 0xFF4D5E,
  steel: 0x3A4256,
  win: 0x4ADE80,
} as const;
const RULE = '━━━━━━━━━━━━━━━━━━━━━━━━━';
// Thụt lề bằng ký tự Braille blank (U+2800) — Discord không gộp/cắt như dấu cách thường.
const INDENT = '\u2800\u2800\u2800';
const GUIDE_URL = 'https://discord.com/channels/1520999265466450090/1528466095365816350/1528494365469708398';

function rankChip(rank: number): string {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return `\`#${rank}\``;
}

/** Embed trạng thái chuẩn RYUSEI — dùng để đồng bộ các message text trần sang embed. */
function statusEmbed(input: {
  title: string;
  description?: string;
  color?: number;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
}): Record<string, unknown> {
  const embed: Record<string, unknown> = {
    color: input.color ?? THEME.ember,
    title: input.title,
    footer: { text: '🌠 Ryusei Bot' },
    timestamp: new Date().toISOString(),
  };
  if (input.description) embed.description = input.description;
  if (input.fields && input.fields.length) embed.fields = input.fields;
  return embed;
}


export function initialResponse(interaction: DiscordInteraction) {
  if (interaction.type === 5) return deferredMessage(true);
  if (interaction.type === 3) {
    if (interaction.data?.custom_id?.startsWith('form_open')) {
      return buildFormModalData(interaction);
    }
    if (interaction.data?.custom_id?.startsWith('shop_btn_nickname_')) {
      return buildNicknameModalData(interaction);
    }
    // Shop select menu chọn "Đổi Nickname" → mở modal ngay
    if (interaction.data?.custom_id?.startsWith('shop_menu_')) {
      const picked = (interaction.data as any)?.values?.[0];
      if (typeof picked === 'string' && picked.startsWith('shop_btn_nickname_')) {
        return buildNicknameModalData(interaction);
      }
      return deferredUpdate();
    }
    // Bet vote: trả modal để nhập số coin ngay lập tức
    if (interaction.data?.custom_id?.startsWith('bet_vote_')) {
      return buildBetVoteModalData(interaction);
    }
    if (interaction.data?.custom_id?.startsWith('ga_question_btn_')) {
      return buildGaQuestionModalData(interaction);
    }
    if (interaction.data?.custom_id?.startsWith('sell_shiny_stock_btn_')) {
      return buildSellShinyStockModalData(interaction);
    }
    // Bấm "Tìm lại" từ thông báo hết hạn Queue → trả lời riêng tư (ephemeral), giữ nguyên tin ping công khai
    if (interaction.data?.custom_id?.startsWith('queue_rejoin')) {
      return deferredMessage(true);
    }
    return deferredUpdate();
  }
  if (interaction.type === 2) {
    const cmdName = interaction.data?.name;
    if (cmdName && PUBLIC_COMMANDS.has(cmdName)) {
      return deferredMessage(false);
    }
    return deferredMessage(true);
  }
  return deferredMessage(true);
}

export async function processInteraction(interaction: DiscordInteraction): Promise<void> {
  // Check and execute overdue tasks (overdue matches, scheduled season end) first
  await scanOverdueActions().catch(error => console.error('Overdue scan failed:', error));

  try {
    if (interaction.type === 2) await handleCommand(interaction);
    else if (interaction.type === 3) {
      await handleButton(interaction);
    }
    else if (interaction.type === 5) await handleModalSubmit(interaction);
    else throw new Error('Loại tương tác chưa được hỗ trợ.');
  } catch (error) {
    console.error('Interaction failed:', error);
    const message = error instanceof Error ? error.message : 'Đã xảy ra lỗi không xác định.';
    if (interaction.type === 3) {
      // Button interaction: dùng ephemeral followup để chỉ người bấm thấy lỗi, không public ra channel
      await createFollowupMessage(interaction.application_id, interaction.token, {
        content: `❌ ${message}`,
        flags: 64,
        allowed_mentions: { parse: [] },
      }).catch(console.error);
    } else {
      await editInteractionReply(interaction.application_id, interaction.token, {
        content: `❌ ${message}`,
        embeds: [],
        components: [],
        allowed_mentions: { parse: [] },
      }).catch(console.error);
    }
    return;
  }
}

async function handleCommand(interaction: DiscordInteraction): Promise<void> {
  switch (interaction.data?.name) {
    case 'set-thumbnail':
      await handleSetThumbnail(interaction);
      return;
    case 'thanh-tuu':
      await handleThanhTuuCommand(interaction);
      return;
    case 'challenge':
      await handleChallengeCommand(interaction);
      return;
    case 'gui-anh':
      await handleUploadProofCommand(interaction);
      return;
    case 'blacklist':
      await handleBlacklistCommand(interaction);
      return;
    case 'xoa-canh-cao':
      await handleXoaCanhCaoCommand(interaction);
      return;
    case 'check-canh-cao':
      await handleCheckCanhCaoCommand(interaction);
      return;
    case 'list-blacklist':
      await handleListBlacklistCommand(interaction);
      return;
    case 'queue':
      await handleQueue(interaction);
      return;
    case 'leaderboard':
      await handleLeaderboard(interaction);
      return;
    case 'bxh-coin':
    case 'top-coin':
    case 'coin-leaderboard':
      await handleCoinLeaderboard(interaction);
      return;
    case 'profile':
      await handleProfile(interaction);
      return;
    case 'match':
      await handleMatchCommand(interaction);
      return;
    case 'ladder':
      await handleLadderCommand(interaction);
      return;
    case 'ladder-help':
    case 'help':
      await reply(interaction, { embeds: helpEmbeds(await isModerator(interaction) || hasManageGuild(interaction)) });
      return;
    case 'history':
      await handleHistory(interaction);
      return;
    case 'admin':
      await handleAdmin(interaction);
      return;
    case 'form':
      await handleFormCommand(interaction);
      return;
    case 'tao-bill':
      await handleTaoBillCommand(interaction);
      return;
    case 'hall-of-fame':
      await handleHallOfFame(interaction);
      return;
    case 'pokedex':
      await handlePokedex(interaction);
      return;
    case 'move':
      await handleMoveCommand(interaction);
      return;
    case 'ability':
      await handleAbilityCommand(interaction);
      return;

    case 'say':
      await handleSay(interaction);
      return;
    case 'balance':
      await handleBalance(interaction);
      return;
    case 'shop':
      await handleShop(interaction);
      return;
    case 'qr':
      await handleQrCommand(interaction);
      return;
    case 'daily':
      await handleDaily(interaction);
      return;
    case 'add-ryucoin':
      await handleAddRyucoin(interaction);
      return;
    case 'remove-ryucoin':
      await handleRemoveRyucoin(interaction);
      return;
    case 'self-destruct':
      await handleSelfDestruct(interaction);
      return;
    case 'tao-bet':
      await handleCreateBet(interaction);
      return;
    case 'show-bet':
      await handleShowBet(interaction);
      return;
    case 'stop-bet':
      await handleStopBet(interaction);
      return;
    case 'end-bet':
      await handleEndBet(interaction);
      return;
    case 'give':
      await handleGive(interaction);
      return;
    case 'bank':
      await handleBank(interaction);
      return;
    case 'bank_give':
      await handleBankGive(interaction);
      return;
    case 'set_bank_managers':
      await handleSetBankManagers(interaction);
      return;
    case 'bank_add':
      await handleBankAdd(interaction);
      return;
    case 'free-coins':
      await handleFreeCoinsCommand(interaction);
      return;
    case 'free-shiny':
      await handleFreeShinyCommand(interaction);
      return;
    case 'ga-shiny':
      await handleGaShinyCommand(interaction);
      return;
    case 'question-ga':
      await handleQuestionGaCommand(interaction);
      return;
    case 'set-background':
      await handleSetBackground(interaction);
      return;
    case 'sell-shiny':
      await handleSellShinyCommand(interaction);
      return;
    case 'gacha-shiny':
      await handleGachaShinyCommand(interaction);
      return;
    case 'sync':
      await handleSyncCommand(interaction);
      return;
    default:
      throw new Error('Lệnh chưa được hỗ trợ.');
  }
}

async function handleBlacklistCommand(interaction: DiscordInteraction): Promise<void> {
  const guildId = requireGuild(interaction);
  const actor = actorUser(interaction);
  if (!await isModerator(interaction) && !hasManageGuild(interaction)) {
    throw new Error('Chỉ Mod hoặc Admin mới có quyền sử dụng lệnh này.');
  }

  const targetUser = stringOption(interaction, 'user', true);
  const reason = stringOption(interaction, 'reason', true);

  const result = await addWarningAndBlacklist(guildId, targetUser, reason);
  const timeText = result.days === -1 ? '🔴 **VĨNH VIỄN**' : `⏱️ **${result.days} ngày**`;

  await reply(interaction, {
    content: '',
    embeds: [statusEmbed({
      color: THEME.crimson,
      title: '⚠️ Đã cảnh cáo & xử phạt',
      description: `Đã cảnh cáo <@${targetUser}> thành công.`,
      fields: [
        { name: '🔢 Số lần vi phạm', value: `Lần thứ **${result.strikeCount}**`, inline: true },
        { name: '⛔ Hình thức phạt', value: `Blacklist ${timeText}`, inline: true },
        { name: '📝 Lý do', value: reason, inline: false },
      ],
    })],
    allowed_mentions: { parse: [] },
  });
}

async function handleXoaCanhCaoCommand(interaction: DiscordInteraction): Promise<void> {
  const guildId = requireGuild(interaction);
  const actor = actorUser(interaction);
  if (!await isModerator(interaction) && !hasManageGuild(interaction)) {
    throw new Error('Chỉ Mod hoặc Admin mới có quyền sử dụng lệnh này.');
  }

  const targetUser = stringOption(interaction, 'user', true);
  await clearUserWarnings(guildId, targetUser);

  await reply(interaction, {
    content: '',
    embeds: [statusEmbed({
      color: THEME.win,
      title: '✅ Đã xóa cảnh cáo',
      description: `Đã xóa toàn bộ lịch sử cảnh cáo và gỡ Blacklist cho <@${targetUser}>.`,
    })],
    allowed_mentions: { parse: [] },
  });
}

async function handleCheckCanhCaoCommand(interaction: DiscordInteraction): Promise<void> {
  const guildId = requireGuild(interaction);
  const actor = actorUser(interaction);
  const targetUser = stringOption(interaction, 'user') || actor.id;

  const warnings = await getUserWarnings(guildId, targetUser);
  if (!warnings || warnings.length === 0) {
    await reply(interaction, {
      content: '',
      embeds: [statusEmbed({
        color: THEME.win,
        title: '✅ Không có cảnh cáo',
        description: `<@${targetUser}> chưa có lịch sử cảnh cáo nào.`,
      })],
      allowed_mentions: { parse: [] },
    });
    return;
  }

  const listText = warnings.map((w: any, idx: number) =>
    `> **#${idx + 1}** - Ngày: <t:${Math.floor(w.created_at / 1000)}:R> - Lý do: *${w.reason}*`
  ).join('\n');

  await reply(interaction, {
    content: '',
    embeds: [statusEmbed({
      color: THEME.gold,
      title: `📋 Lịch sử cảnh cáo · ${warnings.length} lần`,
      description: `Người dùng: <@${targetUser}>\n${RULE}\n${listText}`,
    })],
    allowed_mentions: { parse: [] },
  });
}

async function handleListBlacklistCommand(interaction: DiscordInteraction): Promise<void> {
  const guildId = requireGuild(interaction);
  const blacklisted = await getActiveBlacklist(guildId);

  if (!blacklisted || blacklisted.length === 0) {
    await reply(interaction, {
      content: '',
      embeds: [statusEmbed({
        color: THEME.win,
        title: '🚫 Danh sách Blacklist',
        description: '🎉 Hiện tại không có người dùng nào nằm trong danh sách Blacklist.',
      })],
      allowed_mentions: { parse: [] },
    });
    return;
  }

  const listText = blacklisted.map((b: any) => {
    const expireStr = b.expires_at === '0' || b.expires_at === 0 || b.expires_at === 'vĩnh viễn'
      ? '🔴 Vĩnh viễn'
      : `⏳ Hết hạn: <t:${Math.floor(b.expires_at / 1000)}:f>`;
    return `• <@${b.user_id}> — ${expireStr}`;
  }).join('\n');

  await reply(interaction, {
    content: '',
    embeds: [statusEmbed({
      color: THEME.crimson,
      title: `🚫 Danh sách Blacklist · ${blacklisted.length} người`,
      description: listText,
    })],
    allowed_mentions: { parse: [] },
  });
}

async function handleUploadProofCommand(interaction: DiscordInteraction): Promise<void> {
  const guildId = requireGuild(interaction);
  const channelId = requireChannel(interaction);
  const actor = actorUser(interaction);

  const match = await getMatchByChannelId(channelId);
  if (!match) {
    throw new Error('❌ Lệnh này chỉ được dùng trong kênh thi đấu (Match Channel).');
  }

  // 👇 IN RA ĐỂ KIỂM TRA GIÁ TRỊ ĐÃ LƯU TRONG DATABASE
  console.log(`[DEBUG DB] controlMessageId hiện đang lưu trong DB là:`, match.controlMessageId);

  if (!match.controlMessageId) {
    // Nếu trong DB không có, in thẳng thông báo này ra chat để bạn thấy
    throw new Error(`❌ Database đang lưu control_message_id là: Rỗng (undefined/null). Trận ID: ${match.id}`);
  }

  if (match.proofImageUrl) {
    throw new Error('❌ Trận đấu này đã được nộp ảnh minh chứng trước đó rồi! Không thể nộp lại lần thứ hai.');
  }
  console.log(`[DEBUG DB] controlMessageId hiện đang lưu trong DB là:`, match.controlMessageId);

  const attachmentId = rawOption(interaction, 'anh')?.value as string | undefined;
  const attachment = attachmentId
    ? (interaction.data?.resolved?.attachments as any)?.[attachmentId]
    : undefined;

  if (!attachment || !attachment.url) {
    throw new Error('❌ Bạn chưa tải ảnh lên. Vui lòng chọn file ảnh ở phần tham số "anh" của lệnh.');
  }

  if (attachment.url) {
    await updateMatchProofImage(match.id, attachment.url);
  }

  await reply(interaction, {
    embeds: [{
      color: THEME.win,
      title: '📸 Ảnh Minh Chứng Kết Quả',
      description: `✅ <@${actor.id}> đã nộp ảnh minh chứng kết quả thành công!`,
      image: { url: attachment.url },
    }],
    allowed_mentions: { parse: [] }
  });

  // Tiến hành mở khóa dựa vào giá trị đã lưu trong DB
  try {
    const unlockedComponents = [resultClaimButtons(match, false)];
    await editChannelMessage(channelId, match.controlMessageId, {
      components: unlockedComponents
    });
  } catch (err) {
    console.error(`Lỗi khi mở khóa với ID từ DB (${match.controlMessageId}):`, err);
  }
}

async function handleChallengeCommand(interaction: DiscordInteraction): Promise<void> {
  const guildId = requireGuild(interaction);
  const channelId = requireChannel(interaction);
  const actor = actorUser(interaction);
  const opponent = resolvedUser(interaction, stringOption(interaction, 'user', true));
  if (opponent.bot) throw new Error('Không thể thách đấu bot.');
  if (opponent.id === actor.id) throw new Error('Bạn không thể tự thách đấu chính mình.');

  const match = await createChallenge({
    id: randomUUID(),
    guildId,
    channelId,
    challengerId: actor.id,
    challengerName: displayName(actor),
    opponentId: opponent.id,
    opponentName: displayName(opponent),
  });
  const expires = Math.floor((match.createdAt + CHALLENGE_TTL_MS) / 1000);
  await reply(interaction, {
    content: `<@${opponent.id}>, bạn nhận được lời thách đấu từ <@${actor.id}>!`,
    embeds: [{
      color: THEME.ember,
      title: '⚔️ Lời thách đấu xếp hạng',
      description: `Nếu đồng ý, bot sẽ tạo một private channel cho hai người.\nHết hạn <t:${expires}:R>.`,
      fields: [{ name: '🆔 Match ID (Ấn giữ / Chạm để copy)', value: `\`\`\`${match.id}\`\`\``, inline: false }],
    }],
    components: [challengeButtons(match.id)],
    allowed_mentions: { users: [opponent.id, actor.id] },
  });
}

async function handleLeaderboard(interaction: DiscordInteraction): Promise<void> {
  const type = stringOption(interaction, 'type');
  if (type === 'coin') {
    await handleCoinLeaderboard(interaction);
    return;
  }
  const scopeOpt = stringOption(interaction, 'scope');
  const scope: 'server' | 'global' = scopeOpt === 'global' ? 'global' : 'server';
  const guildId = requireGuild(interaction);
  const actor = actorUser(interaction);
  await getRating(guildId, actor.id, displayName(actor)).catch(() => null);

  const totalUsers = scope === 'global' ? await globalLeaderboardCount() : await leaderboardCount(guildId);
  const totalPages = Math.max(1, Math.ceil(totalUsers / 10));
  const rows = scope === 'global' ? await globalLeaderboard(10, 0) : await leaderboard(guildId, 10, 0);
  if (scope === 'server') await updateLiveLeaderboard(guildId).catch(console.error);
  const lbMsg = await buildLeaderboardMessage(guildId, rows, 1, totalPages, actor.id, scope);

  const serverName = interaction.guild?.name || 'server này';
  const title = scope === 'global'
    ? '🏆 Bảng Xếp Hạng Elo Tổng (Toàn Hệ Thống)'
    : `🏆 Bảng Xếp Hạng Elo — ${serverName}`;

  const embed = {
    ...lbMsg.embeds[0],
    title,
  };

  await reply(interaction, {
    embeds: [embed],
    components: lbMsg.components,
    allowed_mentions: { parse: [] },
  });
}

async function handleCoinLeaderboard(interaction: DiscordInteraction): Promise<void> {
  const scopeOpt = stringOption(interaction, 'scope');
  const scope: 'server' | 'global' = scopeOpt === 'global' ? 'global' : 'server';
  const guildId = requireGuild(interaction);
  const actor = actorUser(interaction);
  await getRating(guildId, actor.id, displayName(actor)).catch(() => null);

  const totalUsers = scope === 'global' ? await globalCoinLeaderboardCount() : await coinLeaderboardCount(guildId);
  const totalPages = Math.max(1, Math.ceil(totalUsers / 10));
  const rows = scope === 'global' ? await globalCoinLeaderboard(10, 0) : await coinLeaderboard(guildId, 10, 0);
  const lbMsg = await buildCoinLeaderboardMessage(guildId, rows, 1, totalPages, actor.id, scope);

  const serverName = interaction.guild?.name || 'server này';
  const title = scope === 'global'
    ? '🪙 Bảng Xếp Hạng Ryucoin Tổng (Toàn Hệ Thống)'
    : `🪙 Bảng Xếp Hạng Ryucoin — ${serverName}`;

  const embed = {
    ...lbMsg.embeds[0],
    title,
  };

  await reply(interaction, {
    embeds: [embed],
    components: lbMsg.components,
    allowed_mentions: { parse: [] },
  });
}

async function handleHallOfFame(interaction: DiscordInteraction): Promise<void> {
  const guildId = requireGuild(interaction);
  const actor = actorUser(interaction);
  const history = await getSeasonsHistory(guildId);
  if (!history.length) {
    await reply(interaction, {
      embeds: [statusEmbed({ color: THEME.steel, title: '🏛️ Hall of Fame trống', description: 'Server chưa có mùa giải nào được chốt.' })],
      allowed_mentions: { parse: [] },
    });
    return;
  }

  const totalPages = Math.max(1, Math.ceil(history.length / 5));
  const hofMsg = buildHallOfFameMessage(history, 1, totalPages, actor.id);

  await reply(interaction, {
    content: hofMsg.content,
    embeds: hofMsg.embeds,
    components: hofMsg.components,
    allowed_mentions: { parse: [] },
  });
}

function cleanDisplayName(str: string): string {
  if (!str) return '';
  let result = '';
  for (const char of str) {
    const cp = char.codePointAt(0);
    if (!cp) continue;
    if (cp >= 0x1D400 && cp <= 0x1D7FF) {
      if (cp >= 0x1D7CE) {
        result += String.fromCharCode(0x30 + ((cp - 0x1D7CE) % 10));
      } else {
        const blockBases = [0x1D400, 0x1D434, 0x1D468, 0x1D49C, 0x1D4D0, 0x1D504, 0x1D538, 0x1D56C, 0x1D5A0, 0x1D5D4, 0x1D608, 0x1D63C, 0x1D670];
        let converted = false;
        for (const base of blockBases) {
          if (cp >= base && cp < base + 52) {
            const offset = cp - base;
            if (offset < 26) {
              result += String.fromCharCode(0x41 + offset);
            } else {
              result += String.fromCharCode(0x61 + (offset - 26));
            }
            converted = true;
            break;
          }
        }
        if (!converted) result += char;
      }
    } else if (cp >= 0xFF01 && cp <= 0xFF5E) {
      result += String.fromCharCode(cp - 0xFEE0);
    } else if (cp >= 0x24B6 && cp <= 0x24CF) {
      result += String.fromCharCode(0x41 + (cp - 0x24B6));
    } else if (cp >= 0x24D0 && cp <= 0x24E9) {
      result += String.fromCharCode(0x61 + (cp - 0x24D0));
    } else {
      const supMap: Record<string, string> = {
        '\u02E0': 'y', '\u02E1': 'l', '\u02E2': 's', '\u02E3': 'x', '\u02E4': 'r',
        '\u1D43': 'a', '\u1D47': 'b', '\u1D48': 'd', '\u1D49': 'e', '\u1D4B': 'g', '\u1D4C': 'h', '\u1D4D': 'i', '\u1D4E': 'j', '\u1D4F': 'k', '\u1D50': 'm', '\u1D52': 'o', '\u1D56': 'p', '\u1D57': 't', '\u1D58': 'u', '\u1D5B': 'v', '\u1D5D': 'w', '\u1D62': 'i', '\u1D63': 'r', '\u1D64': 'u', '\u1D65': 'v',
        '\u1D74': 't', '\u1D88': 'u', '\u2070': '0', '\u2071': 'i', '\u2074': '4', '\u2075': '5', '\u2076': '6', '\u2077': '7', '\u2078': '8', '\u2079': '9',
        '\u207F': 'n', '\u2080': '0', '\u2081': '1', '\u2082': '2', '\u2083': '3', '\u2084': '4', '\u2085': '5', '\u2086': '6', '\u2087': '7', '\u2088': '8', '\u2089': '9',
        '\u2102': 'C', '\u2107': 'E', '\u2109': 'F', '\u210A': 'g', '\u210B': 'H', '\u210C': 'H', '\u210D': 'H', '\u210E': 'h', '\u210F': 'h', '\u2110': 'I', '\u2111': 'I', '\u2112': 'L', '\u2113': 'l', '\u2115': 'N', '\u2118': 'P', '\u2119': 'P', '\u211A': 'Q', '\u211B': 'R', '\u211C': 'R', '\u211D': 'R', '\u2124': 'Z', '\u2128': 'Z', '\u212C': 'B', '\u212D': 'C', '\u212F': 'e', '\u2130': 'E', '\u2131': 'F', '\u2133': 'M', '\u2134': 'o'
      };
      result += supMap[char] || char;
    }
  }
  return result.replace(/[\u200B-\u200D\uFEFF\u00AD\u2060]/g, '').trim();
}

async function handleProfile(interaction: DiscordInteraction): Promise<void> {
  const guildId = requireGuild(interaction);
  const actor = actorUser(interaction);
  const selectedId = stringOption(interaction, 'user');
  const user = selectedId ? resolvedUser(interaction, selectedId) : actor;

  // 1. KÉO DỮ LIỆU ĐỒNG THỜI (Elo, Rank, Warnings, Blacklist, Thẻ Tuần)
  const [rating, rank, warnings, isBlacklisted, weeklyPass] = await Promise.all([
    getRating(guildId, user.id, displayName(user)),
    rankPosition(guildId, user.id),
    getUserWarnings(guildId, user.id).catch(() => []),
    isUserBlacklisted(guildId, user.id).catch(() => false),
    getUserWeeklyPass(user.id).catch(() => null),
  ]);

  // Quét tự động thành tựu kinh tế (ví dụ: 10k Ryucoin)
  await checkEconomyAchievements(guildId, user.id).catch(console.error);

  // ── SVIP override ──────────────────────────────────────────────────────────
  const isSVIP = user.id === '983625547076739102';
  const displayRating = isSVIP ? 1101 : rating.rating;
  const displayWins = isSVIP ? 11 : rating.wins;
  const displayLosses = isSVIP ? 0 : rating.losses;
  const displayDraws = isSVIP ? 1 : rating.draws;
  // ──────────────────────────────────────────────────────────────────────────

  const validMatches = displayWins + displayLosses;
  const winRate = isSVIP ? 1101 : (validMatches > 0 ? Math.round((displayWins / validMatches) * 100) : 0);

  let color: number = THEME.ember;
  let rankText = isSVIP ? '#SVIP' : 'Chưa xếp hạng';
  let badge = isSVIP ? '👑' : '🏅';

  if (!isSVIP && rank) {
    if (rank === 1) { color = THEME.gold; badge = '🏆'; rankText = `Top 1`; }
    else if (rank === 2) { color = 0xC0C0C0; badge = '🥈'; rankText = `Top 2`; }
    else if (rank === 3) { color = 0xCD7F32; badge = '🥉'; rankText = `Top 3`; }
    else { rankText = `#${rank}`; }
  }
  if (isSVIP) color = THEME.gold;

  const avatarUrl = user.avatar
    ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=256`
    : 'https://cdn.discordapp.com/embed/avatars/0.png';

  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

  let rawName = user.global_name || user.username;
  if (selectedId && interaction.data?.resolved?.members?.[selectedId]?.nick) {
    rawName = interaction.data.resolved.members[selectedId].nick;
  } else if (!selectedId && interaction.member?.nick) {
    rawName = interaction.member.nick;
  }
  const cleanedName = cleanDisplayName(rawName) || rawName;

  const ogUrl = new URL(`${vercelUrl}/api/og/profile`);
  ogUrl.searchParams.set('userId', user.id);
  ogUrl.searchParams.set('name', cleanedName);
  ogUrl.searchParams.set('username', user.username);
  ogUrl.searchParams.set('avatar', avatarUrl);
  ogUrl.searchParams.set('rank', rankText);
  ogUrl.searchParams.set('badge', badge);
  ogUrl.searchParams.set('elo', displayRating.toString());
  ogUrl.searchParams.set('w', displayWins.toString());
  ogUrl.searchParams.set('l', displayLosses.toString());
  ogUrl.searchParams.set('d', displayDraws.toString());
  ogUrl.searchParams.set('wr', winRate.toString());
  ogUrl.searchParams.set('ryucoin', rating.ryucoin.toString());
  ogUrl.searchParams.set('wp', rating.wallpaperId);
  ogUrl.searchParams.set('t', Date.now().toString());

  // Xử lý dữ liệu thành tựu
  let selectedAchText = '> Dùng lệnh `/thanh-tuu` nhé!';
  let achParam = '';
  try {
    const rawSelected = (rating as any).selected_achievements;
    if (rawSelected && rawSelected !== '[]' && rawSelected !== '{}') {
      let ids: string[] = [];
      if (Array.isArray(rawSelected)) {
        ids = rawSelected;
      } else if (typeof rawSelected === 'string' && rawSelected.startsWith('[')) {
        ids = JSON.parse(rawSelected);
      } else if (typeof rawSelected === 'string' && rawSelected.startsWith('{')) {
        ids = rawSelected.replace(/^{|}$/g, '').split(',').map(s => s.replace(/(^"|"$)/g, '').trim()).filter(Boolean);
      } else if (typeof rawSelected === 'string') {
        ids = rawSelected.split(',').map(s => s.trim()).filter(Boolean);
      }

      if (ids.length > 0) {
        achParam = ids.join(',');
        const achList = await getAchievementsList();
        const lines = ids.map(id => {
          const ach = achList.find((a: any) => a.id === id);
          return ach ? `> ${ach.icon} **${ach.name}**` : '';
        }).filter(Boolean);

        if (lines.length > 0) {
          selectedAchText = lines.join('\n');
        }
      }
    }
  } catch (e) {
    console.error('[DEBUG Profile] Lỗi khi xử lý hiển thị thành tựu:', e);
  }

  if (achParam) {
    ogUrl.searchParams.set('achievements', achParam);
  }

  // ── XÂY DỰNG NỘI DUNG MỤC TRẠNG THÁI & THẺ TUẦN ──
  const blacklistStatus = isBlacklisted ? '🔴 **Đang bị Blacklist**' : '🟢 *Không*';
  const warningCount = warnings ? warnings.length : 0;
  const warningText = warningCount > 0 ? `⚠️ **${warningCount} lần cảnh cáo**` : '✨ *Sạch sẽ*';
  
  let passText = '❌ *Chưa sở hữu*';
  if (weeklyPass) {
    const expireTime = Math.floor(weeklyPass.expiresAt / 1000);
    passText = `🎫 Hết hạn: <t:${expireTime}:R>`;
  }

  const statusContent = `> **Blacklist** — ${blacklistStatus}\n> **Cảnh cáo** — ${warningText}\n> **Thẻ Tuần** — ${passText}`;
  // ────────────────────────────────────────────────

  let thumbUrl = "https://cdn.discordapp.com/attachments/1521070863862992906/1541859951587102820/discord-logo-icon-social-media-icon-free-png.png?ex=6a8fc93a&is=6a8e77ba&hm=738631cebe2ee6875370ef799739006c385e94d0e6eb8ac99b7abe50ff2da323&";
  let profileFiles: DiscordFile[] = [];

  try {
    const customThumb = await getCustomThumbnail(user.id);
    if (customThumb && customThumb.imageData) {
      const ext = customThumb.mimeType?.includes('jpeg') || customThumb.mimeType?.includes('jpg') ? 'jpg' : 'png';
      profileFiles.push({
        name: `custom_thumb.${ext}`,
        data: Buffer.from(customThumb.imageData, 'base64'),
        contentType: customThumb.mimeType || 'image/png',
      });
      thumbUrl = `attachment://custom_thumb.${ext}`;
    }
  } catch (e) {
    console.error('[DEBUG Profile] Lỗi khi đọc custom thumbnail từ DB:', e);
  }

  const profileEmbed: any = {
    color,
    thumbnail: { url: thumbUrl },
    fields: [
      { name: '<:thanhtuu:1540503779021951046> **Thành tựu nổi bật**', value: selectedAchText, inline: true },
      { name: '<:tim:1540503843526283354> **Số lượt tim**', value: '> `0` lượt', inline: true },
      { name: '🛡️ **Trạng thái & Đặc quyền**', value: statusContent, inline: false }, // 👈 Mục trạng thái hoàn chỉnh
    ],
    image: { url: ogUrl.toString() },
  };

  try {
    const ogReq = new NextRequest(ogUrl.toString());
    const ogRes = await renderOgProfile(ogReq);
    if (ogRes.ok) {
      const arrayBuf = await ogRes.arrayBuffer();
      if (arrayBuf && arrayBuf.byteLength > 0) {
        profileFiles.push({
          name: 'profile.png',
          data: Buffer.from(arrayBuf),
          contentType: 'image/png',
        });
        profileEmbed.image = { url: 'attachment://profile.png' };
      }
    }
  } catch (e) {
    console.error('[DEBUG Profile] Lỗi khi render ảnh OG in-process:', e);
  }

  await reply(interaction, {
    embeds: [profileEmbed],
    allowed_mentions: { parse: [] },
  }, profileFiles.length > 0 ? profileFiles : undefined);
}

export async function syncTopRoles(guildId: string): Promise<void> {
  const settings = await getSettings(guildId);
  const topRoleIds = settings.topRoleIds || [];
  if (!topRoleIds.some(id => id)) return; // Không có cấu hình nào

  const lb = await leaderboard(guildId, 3, 0);
  const newTopUsers = [
    lb[0]?.userId || '',
    lb[1]?.userId || '',
    lb[2]?.userId || '',
  ];
  const oldTopUsers = settings.currentTopUsers || ['', '', ''];

  for (let i = 0; i < 3; i++) {
    const roleId = topRoleIds[i];
    if (!roleId) continue;
    const oldUser = oldTopUsers[i];
    const newUser = newTopUsers[i];

    if (oldUser !== newUser) {
      if (oldUser) await removeGuildMemberRole(guildId, oldUser, roleId).catch(() => { });
      if (newUser) await addGuildMemberRole(guildId, newUser, roleId).catch(() => { });
    }
  }

  await updateCurrentTopUsers(guildId, newTopUsers);
}

async function handleLadderCommand(interaction: DiscordInteraction): Promise<void> {
  const guildId = requireGuild(interaction);
  const sub = subcommand(interaction);
  const actor = actorUser(interaction);
  if (actor.id !== SUPER_ADMIN_ID && !hasManageGuild(interaction)) {
    throw new Error('🚫 Chỉ Super Admin (chủ sở hữu bot: 983625547076739102) mới có quyền cài đặt cấu hình admin/mod cho server.');
  }

  if (sub === 'setup') {
    const roleIds = ['mod_role', 'mod_role_2', 'mod_role_3', 'mod_role_4', 'mod_role_5']
      .map(name => stringOption(interaction, name))
      .filter((roleId): roleId is string => Boolean(roleId));
    if (roleIds.includes(guildId)) throw new Error('Không thể dùng role @everyone làm Mod ladder.');
    const timeout = numberOption(interaction, 'timeout_minutes') || 10;
    const existing = await getSettings(guildId);
    const settings = await setSettings(guildId, roleIds, timeout, existing.logChannelId);
    const roleMentions = settings.modRoleIds.map(roleId => `<@&${roleId}>`).join(' ');
    await reply(interaction, {
      content: `✅ Đã cấu hình ${roleMentions} làm Mod ladder. Nếu quá hạn **${timeout} phút**, bot sẽ chuyển trận sang chờ Mod ở lần quét kế tiếp.`,
      allowed_mentions: { parse: [] },
    });
  } else if (sub === 'top-roles') {
    const rank1 = stringOption(interaction, 'rank1_role');
    const rank2 = stringOption(interaction, 'rank2_role');
    const rank3 = stringOption(interaction, 'rank3_role');
    const roles = [rank1 || '', rank2 || '', rank3 || ''];
    await setTopRoles(guildId, roles);
    await reply(interaction, {
      content: `✅ Đã cấu hình role tự động cho bảng xếp hạng.\nTop 1: ${rank1 ? `<@&${rank1}>` : 'Không có'}\nTop 2: ${rank2 ? `<@&${rank2}>` : 'Không có'}\nTop 3: ${rank3 ? `<@&${rank3}>` : 'Không có'}`,
      allowed_mentions: { parse: [] },
    });
    await syncTopRoles(guildId).catch(console.error);
  } else {
    throw new Error('Subcommand không hợp lệ.');
  }
}


async function buildHistoryMessage(
  guildId: string,
  user: { id: string; global_name?: string | null; username: string },
  page = 1,
  actorId?: string
) {
  const pageSize = 10;
  const totalCount = await getMatchHistoryCount(guildId, user.id);

  if (totalCount === 0) {
    return {
      embeds: [{
        color: THEME.ember,
        title: `📜 Lịch sử đấu — ${user.global_name || user.username}`,
        description: `<@${user.id}> chưa có trận nào kết thúc.`,
      }],
      components: [],
      allowed_mentions: { parse: [] },
    };
  }

  const maxPages = 10;
  const totalPages = Math.min(maxPages, Math.max(1, Math.ceil(totalCount / pageSize)));
  const currentPage = Math.max(1, Math.min(page, totalPages));
  const offset = (currentPage - 1) * pageSize;

  const matches = await getMatchHistory(guildId, user.id, pageSize, offset);

  const lines = matches.map((m) => {
    const isChallenger = m.challengerId === user.id;
    const opponent = isChallenger ? m.opponentName : m.challengerName;
    const opponentId = isChallenger ? m.opponentId : m.challengerId;
    const won = m.winnerUserId === user.id;
    const draw = !m.winnerUserId;
    const result = draw ? '🤝 Hòa' : won ? '🏆 Thắng' : '🟥 Thua';
    const time = m.endedAt ? `<t:${Math.floor(m.endedAt / 1000)}:f>` : '';
    const duration = m.startedAt && m.endedAt ? ` (${Math.ceil((m.endedAt - m.startedAt) / 60000)}p)` : '';
    return `${result} vs **${opponent}** (<@${opponentId}>) — ${time}${duration}\n└ 🆔 **ID:** \`${m.id}\``;
  });

  const name = user.global_name || user.username;
  const embed = {
    color: THEME.ember,
    title: `📜 Lịch sử đấu — ${name}`,
    description: lines.join('\n'),
    footer: { text: `Tổng cộng ${totalCount} trận · Trang ${currentPage}/${totalPages}` },
    timestamp: new Date().toISOString(),
  };

  const components = [];
  if (totalPages > 1) {
    components.push({
      type: 1,
      components: [
        {
          type: 2,
          custom_id: `hist_page_${currentPage - 1}_${user.id}_${actorId || ''}`,
          label: '◀ Trước',
          style: 2,
          disabled: currentPage <= 1
        },
        {
          type: 2,
          custom_id: `hist_page_current`,
          label: `Trang ${currentPage}/${totalPages}`,
          style: 2,
          disabled: true
        },
        {
          type: 2,
          custom_id: `hist_page_${currentPage + 1}_${user.id}_${actorId || ''}`,
          label: 'Sau ▶',
          style: 2,
          disabled: currentPage >= totalPages
        }
      ]
    });
  }

  return {
    embeds: [embed],
    components,
    allowed_mentions: { parse: [] },
  };
}

async function handleHistoryPage(interaction: DiscordInteraction, customId: string): Promise<void> {
  const parts = customId.split('_');
  const page = parseInt(parts[2] || '1', 10);
  const targetUserId = parts[3];
  const actorId = parts[4];
  if (!targetUserId) return;

  const actor = actorUser(interaction);
  if (actorId && actor.id !== actorId) {
    await createFollowupMessage(interaction.application_id, interaction.token, {
      content: '🚫 Bạn không thể điều khiển trang lịch sử của người khác! Hãy gõ lệnh /history của riêng mình.',
      flags: 64,
    });
    return;
  }

  const guildId = requireGuild(interaction);
  const ratingRow = await getRating(guildId, targetUserId);
  const targetUser = {
    id: targetUserId,
    global_name: ratingRow.userName || null,
    username: ratingRow.userName || 'User',
  };

  const message = await buildHistoryMessage(guildId, targetUser, page, actor.id);
  await editSource(interaction, message);
}

async function handleHistory(interaction: DiscordInteraction): Promise<void> {
  const guildId = requireGuild(interaction);
  const actor = actorUser(interaction);
  const selectedId = stringOption(interaction, 'user');
  const user = (selectedId ? resolvedUser(interaction, selectedId) : actor) || actor;

  const message = await buildHistoryMessage(guildId, user, 1, actor.id);
  await reply(interaction, message);
}

async function handleAdmin(interaction: DiscordInteraction): Promise<void> {
  const guildId = requireGuild(interaction);
  const actor = actorUser(interaction);
  if (!await isModerator(interaction) && !hasManageGuild(interaction)) {
    throw new Error('Chỉ Mod ladder hoặc người có quyền Manage Server mới dùng được lệnh này.');
  }
  const action = subcommand(interaction);

  if (action === 'sync') {
    await handleSyncCommand(interaction);
    return;
  }

  if (action === 'daily-role-set' || action === 'daily-role-remove' || action === 'daily-role-list' || action === 'daily-default-role') {
    if (!BET_ADMIN_IDS.has(actor.id) && !hasManageGuild(interaction) && actor.id !== '983625547076739102') {
      await reply(interaction, {
        content: '🚫 Bạn không có quyền cấu hình thưởng Daily. Chỉ Admin mới dùng được lệnh này.',
        flags: 64,
      });
      return;
    }

    if (action === 'daily-role-set') {
      const roleId = stringOption(interaction, 'role', true);
      const amount = numberOption(interaction, 'amount');
      if (amount === undefined || amount < 0) {
        await reply(interaction, { content: '❌ Số Ryucoin không hợp lệ.', flags: 64 });
        return;
      }
      await setDailyRoleReward(guildId, roleId, amount);
      await reply(interaction, {
        content: `✅ Đã thiết lập số Ryucoin nhận được khi điểm danh daily cho role <@&${roleId}> là **${amount} 🪙**!`,
        flags: 64,
        allowed_mentions: { roles: [roleId] },
      });
      return;
    }

    if (action === 'daily-role-remove') {
      const roleId = stringOption(interaction, 'role', true);
      const removed = await removeDailyRoleReward(guildId, roleId);
      if (!removed) {
        await reply(interaction, {
          content: `❌ Role <@&${roleId}> chưa từng được cấu hình thưởng daily!`,
          flags: 64,
          allowed_mentions: { roles: [roleId] },
        });
      } else {
        await reply(interaction, {
          content: `✅ Đã xóa cấu hình thưởng daily cho role <@&${roleId}>. Members sở hữu role này sẽ nhận lại số xu mặc định.`,
          flags: 64,
          allowed_mentions: { roles: [roleId] },
        });
      }
      return;
    }

    if (action === 'daily-default-role') {
      const roleId = stringOption(interaction, 'role', true);
      await setDefaultDailyRole(guildId, roleId);
      await reply(interaction, {
        content: `⭐ Đã chỉ định role <@&${roleId}> làm **Role Daily Mặc Định (Role Trainer gốc)** của Server!\nLượng coin daily của role này sẽ được chọn làm mức Bonus điểm danh chuỗi 7 ngày cho mọi người.`,
        flags: 64,
        allowed_mentions: { roles: [roleId] },
      });
      return;
    }

    if (action === 'daily-role-list') {
      const settings = await getSettings(guildId);
      const list = await getDailyRoleRewards(guildId);
      if (list.length === 0) {
        await reply(interaction, {
          content: '📋 Server hiện chưa cấu hình thưởng daily riêng cho Role nào. Mọi người đều nhận theo mốc mặc định.',
          flags: 64,
        });
        return;
      }
      const lines = list.map((item, idx) => {
        const isDefault = settings.defaultDailyRoleId === item.roleId;
        const defaultBadge = isDefault ? ' ⭐ **[Role Trainer Mặc Định]**' : '';
        return `${idx + 1}. <@&${item.roleId}> ➔ **${item.amount} 🪙** Ryucoin / ngày${defaultBadge}`;
      });
      await reply(interaction, {
        embeds: [{
          color: THEME.ember,
          title: '📋 Cấu hình Ryucoin Daily Theo Role',
          description: `Nếu người chơi sở hữu nhiều Role được cấu hình, hệ thống sẽ tự động **tổng cộng** phần thưởng của tất cả các Role đó.\nThưởng chuỗi 7 ngày (Streak) sẽ cộng thêm đúng lượng xu của **Role Trainer Mặc Định (ký hiệu ⭐)** cho tất cả thành viên.\n\n${lines.join('\n')}`,
          footer: { text: 'Ryusei VGC Daily Config' },
        }],
        flags: 64,
        allowed_mentions: { parse: [] },
      });
      return;
    }
  }

  if (action === 'log-channel') {
    const channelId = stringOption(interaction, 'channel');
    const existing = await getSettings(guildId);
    await setSettings(guildId, existing.modRoleIds, existing.resultTimeoutMinutes, channelId || undefined, existing.matchCategoryId);
    if (channelId) {
      await reply(interaction, { content: `✅ Bot sẽ đăng log kết quả vào <#${channelId}>.`, flags: 64, allowed_mentions: { parse: [] } });
    } else {
      await reply(interaction, { content: '✅ Đã tắt log channel.', flags: 64, allowed_mentions: { parse: [] } });
    }
    return;
  }

  if (action === 'match-category') {
    const categoryId = stringOption(interaction, 'category');
    await setMatchCategory(guildId, categoryId || undefined);
    if (categoryId) {
      await reply(interaction, { content: `✅ Tất cả các phòng đấu ẩn (Match Channels) tiếp theo sẽ được tạo trong Danh mục <#${categoryId}>.`, flags: 64, allowed_mentions: { parse: [] } });
    } else {
      await reply(interaction, { content: '✅ Đã khôi phục Danh mục tạo phòng đấu về mặc định.', flags: 64, allowed_mentions: { parse: [] } });
    }
    return;
  }

  if (action === 'live-board') {
    const channelId = stringOption(interaction, 'channel');
    const scopeOption = (stringOption(interaction, 'scope') as 'server' | 'global') || 'global';

    if (!channelId) {
      await setLeaderboardMessage(guildId, undefined, undefined, scopeOption);
      await reply(interaction, { content: '✅ Đã tắt live leaderboard.', flags: 64, allowed_mentions: { parse: [] } });
      return;
    }
    const existing = await getSettings(guildId).catch(() => null);
    const rows = scopeOption === 'global' ? await globalLeaderboard(10, 0) : await leaderboard(guildId, 10, 0);
    const lbMsg = await buildLeaderboardMessage(guildId, rows, 1, 1, undefined, scopeOption);

    if (existing?.leaderboardChannelId === channelId && existing?.leaderboardMessageId) {
      try {
        await editChannelMessage(channelId, existing.leaderboardMessageId, {
          embeds: lbMsg.embeds,
          components: lbMsg.components,
          allowed_mentions: { parse: [] }
        });
        await setLeaderboardMessage(guildId, channelId, existing.leaderboardMessageId, scopeOption);
        await reply(interaction, { content: `✅ Live leaderboard (${scopeOption === 'global' ? '🌐 Global - Liên server' : '🏠 Server này'}) tại <#${channelId}> đã được cập nhật thông tin mới nhất!`, flags: 64, allowed_mentions: { parse: [] } });
        return;
      } catch (err) {
        console.error('Không sửa được tin nhắn cũ, tạo tin nhắn mới:', err);
      }
    }

    const msg = await createMessage(channelId, {
      embeds: lbMsg.embeds,
      components: lbMsg.components,
      allowed_mentions: { parse: [] }
    });
    const messageId = String(msg.id);
    await setLeaderboardMessage(guildId, channelId, messageId, scopeOption);
    await reply(interaction, { content: `✅ Live leaderboard (${scopeOption === 'global' ? '🌐 Global - Liên server' : '🏠 Server này'}) đã được đăng vào <#${channelId}>. Bot sẽ tự cập nhật sau mỗi trận.`, flags: 64, allowed_mentions: { parse: [] } });
    return;
  }

  if (action === 'hall-of-fame-setup') {
    const channelId = stringOption(interaction, 'channel');
    const roleId = stringOption(interaction, 'ping_role');
    await setHallOfFameConfig(guildId, channelId, roleId);
    if (!channelId && !roleId) {
      await reply(interaction, { content: '✅ Đã tắt thông báo Bảng Vàng tuỳ chỉnh.', flags: 64, allowed_mentions: { parse: [] } });
    } else {
      await reply(interaction, { content: `✅ Đã thiết lập! Bảng Vàng sẽ được thông báo ở <#${channelId || 'kênh chung'}>${roleId ? ` và ping <@&${roleId}>` : ''}.`, flags: 64, allowed_mentions: { parse: [] } });
    }
    return;
  }

  if (action === 'reset-server') {
    if (actor.id !== '983625547076739102') {
      await reply(interaction, { content: '❌ Chỉ Super Admin (chủ sở hữu bot) mới được quyền dùng lệnh này.', flags: 64, allowed_mentions: { parse: [] } });
      return;
    }
    const confirm = stringOption(interaction, 'confirm');
    if (confirm !== 'RESET') {
      await reply(interaction, { content: '❌ Bạn phải nhập đúng chữ `RESET` (viết hoa) để xác nhận xóa toàn bộ dữ liệu.', flags: 64, allowed_mentions: { parse: [] } });
      return;
    }
    const { matches, ratings } = await resetGuildData(guildId);
    await updateLiveLeaderboard(guildId);
    await reply(interaction, { content: `✅ Đã xóa toàn bộ dữ liệu của server: ${matches} trận đấu và ${ratings} hồ sơ xếp hạng.`, flags: 64, allowed_mentions: { parse: [] } });
    return;
  }

  if (action === 'season-schedule') {
    const seasonName = stringOption(interaction, 'name', true);
    const dateStr = stringOption(interaction, 'date', true);
    const timeStr = stringOption(interaction, 'time') || '23:59';
    const resetMode = stringOption(interaction, 'reset_mode') || 'soft';
    const [dd = '', mm = '', yyyy = ''] = dateStr.split('/');
    const dPad = dd.padStart(2, '0');
    const mPad = mm.padStart(2, '0');

    // Parse time
    let endTime: number;
    if (timeStr) {
      const [hh = '00', mins = '00'] = timeStr.split(':');
      const hPad = hh.padStart(2, '0');
      const minPad = mins.padStart(2, '0');
      endTime = new Date(`${yyyy}-${mPad}-${dPad}T${hPad}:${minPad}:00.000+07:00`).getTime();
    } else {
      endTime = new Date(`${yyyy}-${mPad}-${dPad}T23:59:59.999+07:00`).getTime();
    }
    if (isNaN(endTime)) {
      await reply(interaction, { content: '❌ Ngày giờ không hợp lệ. Hãy kiểm tra lại (Ngày: DD/MM/YYYY, Giờ: HH:MM).', flags: 64, allowed_mentions: { parse: [] } });
      return;
    }
    await setScheduledSeason(guildId, seasonName, endTime, resetMode);
    const resetLabel = resetMode === 'soft' ? 'Soft Reset' : resetMode === 'hard' ? 'Hard Reset' : 'Không Reset Elo';
    await reply(interaction, { content: `✅ Đã đặt lịch chốt mùa giải **${seasonName}** vào cuối ngày **${dateStr}** (Chế độ: **${resetLabel}**). Bot sẽ tự động tổng kết lúc đó.`, flags: 64, allowed_mentions: { parse: [] } });
    return;
  }

  if (action === 'season-end') {
    const seasonName = stringOption(interaction, 'name', true);
    const resetMode = stringOption(interaction, 'reset_mode') || 'soft';
    const season = await saveSeasonSnapshot(guildId, seasonName);

    let resetNotice = '';
    if (resetMode === 'soft') {
      const count = await softResetGuildRatings(guildId, 0.2);
      await updateLiveLeaderboard(guildId);
      resetNotice = `\n\n🔄 **Soft Reset Elo**: Đã cân bằng Elo của **${count}** người chơi về mốc 1000 (ví dụ: 1100 ➔ 1020, 900 ➔ 980).`;
    } else if (resetMode === 'hard') {
      const count = await hardResetGuildRatings(guildId);
      await updateLiveLeaderboard(guildId);
      resetNotice = `\n\n🔄 **Hard Reset Elo**: Đã đưa Elo của **${count}** người chơi về mốc 1000.`;
    }

    // Tạo embed thông báo
    const embed = {
      color: THEME.gold,
      title: `🏆 Tổng kết ${season.seasonName}`,
      description: 'Xin chúc mừng những người chơi xuất sắc nhất mùa giải đã được vinh danh vào Bảng Vàng!\n\n' +
        season.topPlayers.map((p, i) => {
          const medal = ['🥇', '🥈', '🥉'][i] || `**#${i + 1}**`;
          const nameTag = p.userName ? ` **(${p.userName})**` : '';
          return `${medal} <@${p.userId}>${nameTag} — **${p.rating}** Elo · ${p.wins}W ${p.losses}L ${p.draws}D`;
        }).join('\n\n') + resetNotice,
      footer: { text: `Chốt lúc ${new Date(season.endedAt).toLocaleString('vi-VN')}` },
    };
    const s = await getSettings(guildId);
    const targetChannelId = s.hallOfFameChannelId || s.leaderboardChannelId || s.logChannelId;
    if (targetChannelId) {
      // Tạm thời tắt ping role khi test để tránh làm phiền mọi người
      const pingText = ''; // s.hallOfFameRoleId ? `<@&${s.hallOfFameRoleId}> ` : '';
      await createMessage(targetChannelId, {
        content: `${pingText}Đã có bảng vinh danh mùa **${season.seasonName}**!`,
        embeds: [embed],
        allowed_mentions: { parse: ['users', 'roles'] },
      }).catch(err => console.error('Không gửi được thông báo mùa giải:', err));
    }

    await reply(interaction, {
      content: targetChannelId ? `✅ Chốt mùa thành công! Bảng vàng đã được đăng vào <#${targetChannelId}>.` : '✅ Chốt mùa thành công! (Chưa cài đặt kênh đăng Bảng Vàng)',
      embeds: [embed],
      flags: 64,
      allowed_mentions: { parse: [] },
    });
    return;
  }

  if (action === 'soft-reset') {
    const percent = numberOption(interaction, 'percent') ?? 20;
    const ratio = percent / 100;
    const count = await softResetGuildRatings(guildId, ratio);
    await updateLiveLeaderboard(guildId);
    const exampleUp = 1000 + Math.round(100 * ratio);
    const exampleDown = 1000 + Math.round(-100 * ratio);
    await reply(interaction, {
      content: `✅ Đã thực hiện **Soft Reset Elo** cho **${count}** người chơi trong server! Elo của mọi người đã được cân bằng về mốc 1000 với tỷ lệ ${percent}%. (Ví dụ: 1100 ➔ ${exampleUp}, 900 ➔ ${exampleDown}).`,
      flags: 64,
      allowed_mentions: { parse: [] },
    });
    return;
  }

  if (action === 'debug-seasons') {
    const seasons = await getSeasonsHistory(guildId);
    const s = await getSettings(guildId);
    let activeScheduleText = '';
    if (s.scheduledSeasonName && s.scheduledSeasonEnd) {
      const resetLabel = s.scheduledSeasonResetMode === 'hard' ? 'Hard Reset' : s.scheduledSeasonResetMode === 'none' ? 'Không Reset' : 'Soft Reset';
      activeScheduleText = `⏰ **Mùa giải đang hoạt động (Sắp tự động chốt):**\n- **${s.scheduledSeasonName}** — Thời gian chốt: <t:${Math.floor(s.scheduledSeasonEnd / 1000)}:f> (<t:${Math.floor(s.scheduledSeasonEnd / 1000)}:R>) [Reset: ${resetLabel}]\n\n`;
    }

    if (seasons.length === 0) {
      await reply(interaction, {
        content: `${activeScheduleText}📭 Không có mùa giải nào **đã kết thúc** được lưu trong lịch sử của máy chủ này.`,
        allowed_mentions: { parse: [] },
      });
    } else {
      const list = seasons.map(s => `• **${s.seasonName}** (ID: \`${s.id}\`) — Chốt lúc: <t:${Math.floor(s.endedAt / 1000)}:f>`).join('\n');
      await reply(interaction, {
        content: `${activeScheduleText}📂 **Danh sách các mùa giải ĐÃ KẾT THÚC & ĐÃ LƯU:**\n\n${list}`,
        allowed_mentions: { parse: [] },
      });
    }
    return;
  }

  if (action === 'season-delete') {
    const id = stringOption(interaction, 'id', true);
    const success = await deleteSeason(guildId, id);
    if (success) {
      await reply(interaction, { content: `✅ Đã xóa thành công mùa giải có ID: \`${id}\`.`, allowed_mentions: { parse: [] } });
    } else {
      await reply(interaction, { content: `❌ Không tìm thấy mùa giải nào với ID: \`${id}\`. Bạn hãy dùng lệnh /admin debug-seasons để kiểm tra lại ID.`, allowed_mentions: { parse: [] } });
    }
    return;
  }

  if (action === 'season-rename') {
    const oldName = stringOption(interaction, 'old_name', true);
    const newName = stringOption(interaction, 'new_name', true);
    const count = await updateSeasonName(guildId, oldName, newName);

    let editedMessageCount = 0;
    const s = await getSettings(guildId);
    const targetChannelId = s.hallOfFameChannelId || s.leaderboardChannelId || s.logChannelId;
    if (targetChannelId) {
      try {
        const messages = await discordRequest(`/channels/${targetChannelId}/messages?limit=20`) as unknown as Array<any>;
        if (Array.isArray(messages)) {
          for (const msg of messages) {
            const hasOldInContent = typeof msg.content === 'string' && msg.content.includes(oldName);
            const hasOldInEmbed = Array.isArray(msg.embeds) && msg.embeds.some((e: any) => e.title?.includes(oldName) || e.description?.includes(oldName));
            if (hasOldInContent || hasOldInEmbed) {
              const newContent = msg.content ? msg.content.replaceAll(oldName, newName) : undefined;
              const newEmbeds = msg.embeds ? msg.embeds.map((emb: any) => ({
                ...emb,
                title: emb.title ? emb.title.replaceAll(oldName, newName) : emb.title,
                description: emb.description ? emb.description.replaceAll(oldName, newName) : emb.description,
              })) : undefined;
              await editChannelMessage(targetChannelId, msg.id, {
                content: newContent,
                embeds: newEmbeds,
                allowed_mentions: { parse: ['users', 'roles'] },
              });
              editedMessageCount++;
            }
          }
        }
      } catch (err) {
        console.error('Lỗi khi sửa tin nhắn Discord:', err);
      }
    }

    await reply(interaction, {
      content: `✅ Đã đổi tên mùa giải từ **${oldName}** thành **${newName}**!\n- Database: ${count} bản ghi đã cập nhật.\n- Discord: ${editedMessageCount} tin nhắn Bảng Vàng đã sửa.`,
      allowed_mentions: { parse: [] },
    });
    return;
  }

  if (action === 'debug-schedule') {
    const s = await getSettings(guildId);
    if (!s.scheduledSeasonName || !s.scheduledSeasonEnd) {
      await reply(interaction, { content: '📭 Hiện tại máy chủ này **không có** lịch hẹn chốt mùa giải nào.', allowed_mentions: { parse: [] } });
    } else {
      const resetLabel = s.scheduledSeasonResetMode === 'hard' ? 'Hard Reset' : s.scheduledSeasonResetMode === 'none' ? 'Không Reset Elo' : 'Soft Reset';
      await reply(interaction, { content: `⏰ **Lịch chốt mùa giải đang hoạt động:**\n- **Tên:** ${s.scheduledSeasonName}\n- **Thời gian chốt:** <t:${Math.floor(s.scheduledSeasonEnd / 1000)}:f> (<t:${Math.floor(s.scheduledSeasonEnd / 1000)}:R>)\n- **Chế độ Reset:** ${resetLabel}`, allowed_mentions: { parse: [] } });
    }
    return;
  }


  if (action === 'points-add' || action === 'points-remove' || action === 'points-set') {
    const targetUser = resolvedUser(interaction, stringOption(interaction, 'user', true));
    const amount = numberOption(interaction, 'amount');
    const reason = stringOption(interaction, 'reason') || `Mod ${displayName(actor)} điều chỉnh thủ công.`;

    if (action === 'points-add') {
      const updated = await adjustRating(guildId, targetUser.id, amount!, reason);
      await syncTopRoles(guildId).catch(console.error);
      const msg = `✅ Đã cộng **+${amount}** Elo cho <@${targetUser.id}>. Mới: **${updated.rating}** Elo.`;
      await reply(interaction, { content: msg, allowed_mentions: { parse: [] } });
      await postToLogChannel(guildId, {
        embeds: [{
          color: THEME.win,
          title: '➕ Điều chỉnh Elo (cộng điểm)',
          fields: [
            { name: 'Người chơi', value: `<@${targetUser.id}>`, inline: true },
            { name: 'Thay đổi', value: `+${amount} Elo → **${updated.rating}**`, inline: true },
            { name: 'Mod', value: `<@${actor.id}>`, inline: true },
            { name: 'Lý do', value: reason },
          ],
        }],
        allowed_mentions: { parse: [] },
      });
      await updateLiveLeaderboard(guildId);
      return;
    }

    if (action === 'points-remove') {
      const updated = await adjustRating(guildId, targetUser.id, -amount!, reason);
      await syncTopRoles(guildId).catch(console.error);
      const msg = `✅ Đã trừ **-${amount}** Elo của <@${targetUser.id}>. Mới: **${updated.rating}** Elo.`;
      await reply(interaction, { content: msg, allowed_mentions: { parse: [] } });
      await postToLogChannel(guildId, {
        embeds: [{
          color: THEME.crimson,
          title: '➖ Điều chỉnh Elo (trừ điểm)',
          fields: [
            { name: 'Người chơi', value: `<@${targetUser.id}>`, inline: true },
            { name: 'Thay đổi', value: `-${amount} Elo → **${updated.rating}**`, inline: true },
            { name: 'Mod', value: `<@${actor.id}>`, inline: true },
            { name: 'Lý do', value: reason },
          ],
        }],
        allowed_mentions: { parse: [] },
      });
      await updateLiveLeaderboard(guildId);
      return;
    }

    if (action === 'points-set') {
      const updated = await setRatingManual(guildId, targetUser.id, amount!);
      await syncTopRoles(guildId).catch(console.error);
      const msg = `✅ Đã đặt Elo của <@${targetUser.id}> thành **${updated.rating}**.`;
      await reply(interaction, { content: msg, flags: 64, allowed_mentions: { parse: [] } });
      await postToLogChannel(guildId, {
        embeds: [{
          color: THEME.gold,
          title: '✏️ Điều chỉnh Elo (set điểm)',
          fields: [
            { name: 'Người chơi', value: `<@${targetUser.id}>`, inline: true },
            { name: 'Giá trị mới', value: `**${updated.rating}** Elo`, inline: true },
            { name: 'Mod', value: `<@${actor.id}>`, inline: true },
            { name: 'Lý do', value: reason },
          ],
        }],
        allowed_mentions: { parse: [] },
      });
      await updateLiveLeaderboard(guildId);
      return;
    }
  }

  throw new Error('Subcommand không hợp lệ.');
}

async function handleSyncCommand(interaction: DiscordInteraction): Promise<void> {
  const actor = actorUser(interaction);
  if (!await isModerator(interaction) && !hasManageGuild(interaction) && actor.id !== SUPER_ADMIN_ID) {
    throw new Error('Chỉ Mod hoặc Admin mới có quyền đồng bộ lệnh.');
  }

  const appId = interaction.application_id;
  await discordRequest(`/applications/${appId}/commands`, {
    method: 'PUT',
    body: JSON.stringify(commandsJson),
  });

  const guildId = interaction.guild_id || process.env.DISCORD_GUILD_ID;
  if (guildId) {
    await discordRequest(`/applications/${appId}/guilds/${guildId}/commands`, {
      method: 'PUT',
      body: JSON.stringify([]),
    }).catch(() => { });
  }

  await reply(interaction, {
    embeds: [statusEmbed({ color: THEME.win, title: '✅ Đã đồng bộ lệnh', description: `Đã đồng bộ **${commandsJson.length}** Slash command!` })],
    allowed_mentions: { parse: [] },
  });
}

async function handleMatchCommand(interaction: DiscordInteraction): Promise<void> {
  const guildId = requireGuild(interaction);
  const actor = actorUser(interaction);
  const action = subcommand(interaction);
  if (action === 'status') {
    const id = stringOption(interaction, 'id');
    const channelId = interaction.channel_id;
    let match: import('./types').LadderMatch | undefined;
    if (id) {
      match = await getMatch(id);
    } else {
      if (channelId) match = await getMatchByChannelId(channelId);
      if (!match) match = await getOpenMatchForUser(guildId, actor.id);
    }

    if (!match || match.guildId !== guildId) throw new Error('Không tìm thấy trận đấu.');
    const participant = [match.challengerId, match.opponentId].includes(actor.id);
    if (!participant && !await isModerator(interaction)) throw new Error('Bạn không có quyền xem trận này.');

    let components: any[] = [];
    if (['accepted', 'active'].includes(match.status)) {
      const [rank1, rank2, isBlacklisted1, isBlacklisted2] = await Promise.all([
        rankPosition(guildId, match.challengerId),
        rankPosition(guildId, match.opponentId),
        isUserBlacklisted(guildId, match.challengerId),
        isUserBlacklisted(guildId, match.opponentId)
      ]);
      const isRestrictedMatch = (rank1 && rank1 <= 10) || (rank2 && rank2 <= 10) || isBlacklisted1 || isBlacklisted2;
      components = [resultClaimButtons(match, isRestrictedMatch)];
    } else if (match.status === 'awaiting_confirmation') {
      components = [confirmationButtons(match.id)];
    } else if (match.status === 'disputed' && await isModerator(interaction)) {
      components = [modResolveButtons(match)];
    }

    await reply(interaction, {
      embeds: [matchEmbed(match)],
      components,
      flags: 64,
      allowed_mentions: { parse: [] }
    });
    return;
  }

  if (action === 'cleanup') {
    if (!await isModerator(interaction)) throw new Error('Chỉ Mod ladder mới dùng được lệnh này.');
    const activeChannels = await getActiveMatchChannels(guildId);
    const channels = await discordRequest(`/guilds/${guildId}/channels`) as unknown as any[];
    const trash = channels
      .filter(c => c.name && c.name.startsWith('rank-') && !activeChannels.includes(c.id))
      .slice(0, 10);

    if (trash.length === 0) {
      await acknowledge(interaction, '✅ Không có kênh rác nào cần dọn dẹp.');
      return;
    }

    let count = 0;
    for (const c of trash) {
      await deleteChannel(c.id, 'Dọn dẹp bằng lệnh cleanup').catch(() => { });
      count++;
    }

    await acknowledge(interaction, `✅ Đã dọn dẹp **${count}** kênh rác.${trash.length === 10 ? ' Vẫn còn kênh rác, hãy gõ lại lệnh.' : ''}`);
    return;
  }

  if (!await isModerator(interaction)) {
    throw new Error('Chỉ Mod ladder hoặc người có quyền Manage Server mới dùng được lệnh này.');
  }
  const id = stringOption(interaction, 'id', true);
  const match = await getMatch(id);
  if (!match || match.guildId !== guildId) throw new Error('Không tìm thấy trận đấu trong server này.');

  if (action === 'cancel') {
    if (!await isModerator(interaction) && !hasManageGuild(interaction)) {
      throw new Error('Chỉ Mod ladder mới dùng được lệnh hủy trận.');
    }
    const id = stringOption(interaction, 'id', true);
    const reason = stringOption(interaction, 'reason') || `Mod ${displayName(actor)} hủy trận.`;
    const match = await cancelMatch(id, reason);
    await updateLiveLeaderboard(guildId);
    await reply(interaction, {
      content: `🚫 Đã **HỦY TRẬN ĐẤU** (Match ID: \`${match.id}\`) thành công! Điểm Elo và Ryucoin (nếu có) của 2 người chơi đã được hoàn trả.\n\n⏳ *Kênh đấu này sẽ tự động xóa sau 5 giây.*`,
      flags: 64,
      allowed_mentions: { parse: [] },
    });
    await deleteMatchChannel(match, 'Trận đấu đã bị hủy bởi Mod.');
    return;
  }

  if (action === 'resolve') {
    if (!await isModerator(interaction) && !hasManageGuild(interaction)) {
      throw new Error('Chỉ Mod ladder mới dùng được lệnh này.');
    }
    const id = stringOption(interaction, 'id', true);
    const isCancel = booleanOption(interaction, 'cancel');
    if (isCancel) {
      const reason = `Mod ${displayName(actor)} hủy trận qua /match resolve.`;
      const match = await cancelMatch(id, reason);
      await updateLiveLeaderboard(guildId);
      await reply(interaction, {
        content: `🚫 Đã **HỦY TRẬN ĐẤU** (Match ID: \`${match.id}\`) thành công! Điểm Elo và Ryucoin (nếu có) của 2 người chơi đã được hoàn trả.\n\n⏳ *Kênh đấu này sẽ tự động xóa sau 5 giây.*`,
        flags: 64,
        allowed_mentions: { parse: [] },
      });
      await deleteMatchChannel(match, 'Trận đấu đã bị hủy bởi Mod.');
      return;
    }
    const winnerId = stringOption(interaction, 'winner');
    const draw = booleanOption(interaction, 'draw') || false;
    if (draw && winnerId) throw new Error('Chỉ chọn người thắng hoặc chọn hòa, không chọn cả hai.');
    if (!draw && !winnerId) throw new Error('Hãy chọn người thắng, hoặc đặt draw thành true.');
    const result = await resolveResult(id, draw ? undefined : winnerId, `Mod ${displayName(actor)} xử lý.`);
    await syncTopRoles(guildId).catch(console.error);
    await reply(interaction, { content: `✅ Đã xử lý trận (Match ID: \`${id}\`).`, flags: 64, allowed_mentions: { parse: [] } });
    await announceFinalResult(result, `Kết quả do Mod <@${actor.id}> xác nhận.`);
    await deleteMatchChannel(result.match, 'Trận ranked đã được Mod xử lý.');
    return;
  }

  throw new Error('Subcommand không hợp lệ.');
}

async function handleButton(interaction: DiscordInteraction): Promise<void> {
  let customId = interaction.data?.custom_id || '';

  // Shop select menu → re-dispatch tới đúng handler theo giá trị được chọn
  if (customId.startsWith('shop_menu_')) {
    const picked = (interaction.data as any)?.values?.[0];
    if (typeof picked === 'string' && picked.length > 0) customId = picked;
  }

  // Mua Thẻ Tuần (Weekly Pass) - Không cộng dồn
  if (customId.startsWith('shop_buy_weekly_pass_')) {
    const userId = customId.split('_')[4];
    const actor = actorUser(interaction);
    if (actor.id !== userId) {
      await createFollowupMessage(interaction.application_id, interaction.token, { content: '🚫 Đây không phải là cửa hàng của bạn!', flags: 64 });
      return;
    }
    const guildId = requireGuild(interaction);
    
    // Kiểm tra nhanh trước khi trừ tiền
    const existingPass = await getUserWeeklyPass(actor.id);
    if (existingPass) {
      const expireDateStr = new Date(existingPass.expiresAt).toLocaleDateString('vi-VN');
      await createFollowupMessage(interaction.application_id, interaction.token, {
        content: `❌ Bạn đang sở hữu một **Thẻ Tuần** còn hạn đến **${expireDateStr}**! Hệ thống không cho phép cộng dồn hoặc mua chồng thẻ mới khi thẻ cũ chưa hết hạn.`,
        flags: 64
      });
      return;
    }

    const rating = await getRating(guildId, actor.id);
    const cost = 150; // Giá Thẻ Tuần

    if (rating.ryucoin < cost) {
      await createFollowupMessage(interaction.application_id, interaction.token, {
        content: `❌ Bạn không đủ Ryucoin! Hiện có **${rating.ryucoin} 🪙**, cần **${cost} 🪙** để mua Thẻ Tuần.`,
        flags: 64
      });
      return;
    }

    try {
      // 1. Trừ tiền và mua thẻ mới
      await addRyucoin(guildId, actor.id, -cost);
      await depositToBank(guildId, cost).catch(err => console.error('Lỗi nạp doanh thu thẻ tuần vào bank:', err));
      
      const passInfo = await buyWeeklyPass(guildId, actor.id, 7); 
      const expireDateStr = new Date(passInfo.expiresAt).toLocaleDateString('vi-VN');

      // 2. ── KIỂM TRA BÙ ĐẮP DAILY TỰ ĐỘNG BẰNG RATING HIỆN TẠI ──
      const ratingAfterBuy = await getRating(guildId, actor.id);
      let bonusMessage = '';
      let hasClaimedToday = false;

      if (ratingAfterBuy.lastDailyClaim) {
        const now = Date.now();
        const OFFSET_MS = 7 * 60 * 60 * 1000;
        const currentDayIndex = Math.floor((now + OFFSET_MS) / (24 * 60 * 60 * 1000));
        const lastClaimMs = rating.lastDailyClaim || 0;
        const lastClaimDayIndex = lastClaimMs > 0 ? Math.floor((lastClaimMs + OFFSET_MS) / (24 * 60 * 60 * 1000)) : -1;

        if (lastClaimDayIndex === currentDayIndex) {
          hasClaimedToday = true;
          const passBonusCoins = 35;
          await addRyucoin(guildId, actor.id, passBonusCoins);
          bonusMessage = `\n🎁 *Vì hôm nay bạn đã điểm danh trước khi mua thẻ, hệ thống đã tự động **cộng bù +${passBonusCoins} 🪙 Ryucoin** bonus vào ví cho bạn!*`;
        }
      }

      const subText = hasClaimedToday 
        ? `✨ Thẻ có hiệu lực đến **${expireDateStr}**.${bonusMessage}`
        : `✨ Thẻ có hiệu lực đến **${expireDateStr}**. Từ ngày mai, bạn sẽ nhận thêm xu bonus khi điểm danh!`;

      await createFollowupMessage(interaction.application_id, interaction.token, {
        content: `🎉 **Đã mua thành công Thẻ Tuần (7 ngày)!**\n${subText}`,
        flags: 64
      });

      const updatedRating = await getRating(guildId, actor.id);
      await editSource(interaction, buildMainShopMessage(updatedRating, actor.id));
    } catch (e: any) {
      console.error('Lỗi khi mua Thẻ Tuần:', e);
      await createFollowupMessage(interaction.application_id, interaction.token, { content: `❌ Lỗi: ${e.message}`, flags: 64 });
    }
    return;
  }

  // Xử lý Menu chọn danh mục thành tựu
  if (customId.startsWith('view_ach_category_')) {
    const userId = customId.split('_')[3];
    const actor = actorUser(interaction);
    
    // Ngăn chặn người khác bấm vào menu của người gọi lệnh
    if (actor.id !== userId) {
      await createFollowupMessage(interaction.application_id, interaction.token, { 
        content: '🚫 Menu này không phải của bạn! Hãy tự gõ `/thanh-tuu all` nhé.', 
        flags: 64 
      });
      return;
    }

    // Lấy giá trị danh mục mà người dùng vừa chọn (match, economy, hoặc special)
    const selectedCategory = (interaction.data as any)?.values?.[0];
    if (!selectedCategory) return;

    // Kéo toàn bộ dữ liệu từ Database và lọc theo danh mục
    const achList = await getAchievementsList();
    const filteredAchs = achList.filter((a: any) => a.category === selectedCategory);

    // Chuẩn bị tiêu đề cho từng loại danh mục
    const categoryNames: Record<string, string> = {
      match: '⚔️ THÀNH TỰU TRẬN ĐẤU',
      economy: '💰 THÀNH TỰU KINH TẾ',
      special: '✨ THÀNH TỰU ĐẶC BIỆT'
    };

    if (filteredAchs.length === 0) {
      await editSource(interaction, {
        embeds: [{
          color: THEME.steel,
          title: categoryNames[selectedCategory] || '📚 DANH SÁCH THÀNH TỰU',
          description: '📭 *Hiện tại chưa có thành tựu nào thuộc danh mục này được công bố.*'
        }],
        components: interaction.message?.components // Giữ lại menu để họ chọn cái khác
      });
      return;
    }

    // Vẽ danh sách thành tựu
    const lines = filteredAchs.map((ach: any) => {
    const rewardText = ach.rewardCoins > 0 ? ` (+${ach.rewardCoins} 🪙)` : '';
      // Trình bày theo dạng: [Icon] Tên Thành Tựu
      // └ Mô tả chi tiết (+ thưởng)
      return `${ach.icon} **${ach.name}**\n└ *${ach.description}*${rewardText}`;
    });

    // Cập nhật lại tin nhắn bằng danh sách vừa tạo
    await editSource(interaction, {
      embeds: [{
        color: THEME.gold,
        title: categoryNames[selectedCategory] || '📚 DANH SÁCH THÀNH TỰU',
        description: lines.join('\n\n'),
        footer: { text: `Tổng cộng: ${filteredAchs.length} thành tựu` }
      }],
      components: interaction.message?.components // Quan trọng: Giữ lại menu để họ có thể chuyển tab liên tục!
    });
    return;
  }

  if (customId.startsWith('select_achievements_')) {
    console.log('[DEBUG] Đã nhận sự kiện chọn thành tựu từ:', customId);

    const userId = customId.split('_')[2];
    const actor = actorUser(interaction);
    if (actor.id !== userId) return;

    const selectedValues = (interaction.data as any)?.values || [];

    try {
      // 1. Cố gắng lưu vào Database
      await setSelectedAchievements(actor.id, selectedValues);
      console.log(`[DEBUG] Đã lưu ${selectedValues.length} thành tựu cho user ${actor.id}`);

      // 2. Phản hồi thành công (Xóa menu đi)
      await editSource(interaction, {
        content: `✅ Đã lưu thành công **${selectedValues.length}** thành tựu lên thẻ Profile của bạn!\n*(Hãy dùng lại lệnh /profile để xem kết quả nhé)*`,
        components: [],
      });
    } catch (error) {
      console.error('[ERROR] Lỗi khi lưu thành tựu:', error);
      await editSource(interaction, {
        content: '❌ Có lỗi xảy ra khi lưu thành tựu vào cơ sở dữ liệu.',
        components: [],
      });
    }
    return;
  }

  if (customId === 'free_coins_claim') {
    const guildId = requireGuild(interaction);
    const user = actorUser(interaction);
    const ROLE_ID = '1527240113036202054';

    try {
      await addGuildMemberRole(guildId, user.id, ROLE_ID);
    } catch (err) {
      console.error('Lỗi tự gán role free-coins:', err);
    }

    await createFollowupMessage(interaction.application_id, interaction.token, {
      content: 'Già đầu rồi còn để bị lừa lêu lêu',
      flags: 64,
    });
    return;
  }
  if (customId === 'free_shiny_claim') {
    await createFollowupMessage(interaction.application_id, interaction.token, {
      embeds: [{
        color: THEME.gold,
        image: { url: 'https://media.tenor.com/bgBQwUxX8VkAAAAM/cat-meme-laughing-gif.gif' },
      }],
      flags: 64,
    });
    return;
  }
  if (customId.startsWith('ga_shiny_claim_')) {
    const giveawayId = customId.slice('ga_shiny_claim_'.length);
    const guildId = requireGuild(interaction);
    const user = actorUser(interaction);
    const result = await claimGiveaway(giveawayId, user.id, displayName(user));
    if (result.claimed) {
      // 1. Khóa nút bấm ở tin nhắn gốc, giữ nguyên nội dung & ảnh giveaway ban đầu
      await editSource(interaction, {
        content: interaction.message?.content,
        embeds: interaction.message?.embeds,
        components: [
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 2,
                custom_id: 'ga_shiny_done',
                label: '✅ Đã có người nhận',
                disabled: true,
              },
            ],
          },
        ],
      });

      // 2. Gửi tin nhắn MỚI vào kênh thông báo người chiến thắng
      if (interaction.channel_id) {
        await createMessage(interaction.channel_id, {
          content: `🎉 **<@${user.id}> đã giành được Pokémon Shiny!** Xin chúc mừng! ✨`,
          embeds: [
            {
              color: THEME.gold,
              title: '✨ Giveaway Shiny — Đã có người thắng!',
              description: `🏆 **${displayName(user)}** (<@${user.id}>) là người nhanh tay nhất và đã nhận được **1 Pokémon Shiny**!\n\nHãy gửi ảnh chụp GTS qua kênh <#1527217614441549905> để nhận thưởng.`,
              footer: { text: 'Cảm ơn mọi người đã tham gia!' },
            },
          ],
          allowed_mentions: { users: [user.id] },
        });
      }
    } else {
      await createFollowupMessage(interaction.application_id, interaction.token, {
        content: `😢 Trễ rồi! **${result.claimedByName || 'Người khác'}** đã nhanh tay hơn bạn rồi!`,
        flags: 64,
      });
    }
    return;
  }
  if (customId.startsWith('sell_shiny_buy_')) {
    const listingId = customId.slice('sell_shiny_buy_'.length);
    const guildId = requireGuild(interaction);
    const actor = actorUser(interaction);

    const listing = await getSellShinyListing(listingId);
    if (!listing || listing.status !== 'open') {
      await createFollowupMessage(interaction.application_id, interaction.token, {
        content: '❌ Sản phẩm này không tồn tại hoặc đã mở bán xong!',
        flags: 64,
      });
      return;
    }

    const rating = await getRating(guildId, actor.id);
    if (rating.ryucoin < listing.price) {
      await createFollowupMessage(interaction.application_id, interaction.token, {
        content: `❌ Số dư không đủ để thực hiện giao dịch! Hiện có **${rating.ryucoin.toLocaleString()} 🪙**, cần **${listing.price.toLocaleString()} 🪙** Ryucoin.`,
        flags: 64,
      });
      return;
    }


    // ── GACHA LOTTERY MODE ──────────────────────────────────────────────────
    if (listing.mode === 'lottery') {
      try {
        await addRyucoin(guildId, actor.id, -listing.price);
        await depositToBank(MAIN_GUILD_ID, listing.price).catch(err => console.error('Lỗi nạp doanh thu vé số vào bank admin:', err));

        const ticketId = randomUUID();
        const ticketResult = await buySellShinyTicket({
          ticketId,
          listingId: listing.id,
          userId: actor.id,
          userName: displayName(actor),
        });

        if (!ticketResult.success) {
          await addRyucoin(guildId, actor.id, listing.price);
          await createFollowupMessage(interaction.application_id, interaction.token, {
            content: '❌ Tất cả vé số của đợt này đã được mua hết rồi!',
            flags: 64,
          });
          return;
        }

        const allTickets = await getSellShinyTickets(listing.id);
        const ticketCounts: Record<string, number> = {};
        for (const t of allTickets) {
          ticketCounts[t.userId] = (ticketCounts[t.userId] || 0) + 1;
        }

        const listStr = Object.entries(ticketCounts)
          .map(([uId, count]) => `<@${uId}>: **${count} vé**`)
          .join('\n');

        const messageId = listing.messageId || interaction.message?.id;
        const channelId = listing.channelId || interaction.channel_id;
        const userTicketCount = ticketCounts[actor.id] || 1;

        if (ticketResult.soldSlots < ticketResult.totalSlots) {
          const pct = Math.round((ticketResult.soldSlots / ticketResult.totalSlots) * 100);
          const updatedEmbed: Record<string, unknown> = {
            color: THEME.ember,
            title: `🎟️ VÉ SỐ POKÉMON SHINY — ${listing.itemName}`,
            description: `🏷️ **Tên Pokémon:** **${listing.itemName}**\n🪙 **Giá 1 vé:** **${listing.price.toLocaleString()} 🪙 Ryucoin**\n📊 **Tiến độ gom vé:** 🟢 **${ticketResult.soldSlots} / ${ticketResult.totalSlots} vé** (${pct}%)\n\n👇 Bấm nút **[🎟️ Mua 1 vé]** bên dưới để tham gia mua vé số! 1 người có thể mua nhiều vé để tăng cơ hội trúng. Đủ **${ticketResult.totalSlots} vé** bot sẽ tự động **Gacha quay số**!`,
            fields: [
              { name: `👥 Danh sách người mua vé (${allTickets.length} vé)`, value: listStr || 'Chưa có ai', inline: false },
            ],
            footer: { text: `Vé số Gacha • Đủ ${ticketResult.totalSlots} vé sẽ tự động quay số chọn người thắng` },
            timestamp: new Date().toISOString(),
          };
          if (listing.imageUrl) updatedEmbed.image = { url: listing.imageUrl };

          if (channelId && messageId) {
            await editChannelMessage(channelId, messageId, {
              embeds: [updatedEmbed],
              components: interaction.message?.components || [
                {
                  type: 1,
                  components: [
                    {
                      type: 2,
                      style: 1,
                      custom_id: `sell_shiny_buy_${listing.id}`,
                      label: `🎟️ Mua 1 vé (${listing.price.toLocaleString()} 🪙)`,
                    },
                  ],
                },
              ],
            }).catch(console.error);
          }

          await createFollowupMessage(interaction.application_id, interaction.token, {
            content: `🎉 **Đã mua thành công 1 vé số cho ${listing.itemName}!** Bạn hiện đang sở hữu **${userTicketCount} vé** (${ticketResult.soldSlots}/${ticketResult.totalSlots} vé đã bán).`,
            flags: 64,
          });

        } else {
          const winningTicket = allTickets[Math.floor(Math.random() * allTickets.length)] || { userId: actor.id, userName: displayName(actor) };
          const winnerId = winningTicket.userId;
          const winnerName = winningTicket.userName;

          const totalCost = listing.price * listing.totalSlots;
          const ticketChannelId = await createShopTicketChannel({
            interaction,
            ticketType: 'SellShiny',
            itemName: `${listing.itemName} (Vé số Gacha)`,
            cost: totalCost,
            imageUrl: listing.imageUrl || undefined,
            targetUser: { id: winnerId, username: winnerName },
          });

          await buySellShinyListing({
            id: listing.id,
            buyerId: winnerId,
            ticketChannelId,
          });

          const completedEmbed: Record<string, unknown> = {
            color: THEME.win,
            title: `🎉 VÉ SỐ POKÉMON SHINY — ĐÃ CÓ KẾT QUẢ GACHA!`,
            description: `🏆 **NGƯỜI TRÚNG GIẢI:** <@${winnerId}>\n\n🏷️ **Tên Pokémon:** **${listing.itemName}**\n📊 **Tổng số vé đã gom:** **${ticketResult.totalSlots}/${ticketResult.totalSlots} vé** (100%)\n🎫 **Ticket nhận quà:** <#${ticketChannelId}>`,
            fields: [
              { name: `👥 Thống kê tất cả vé (${allTickets.length} vé)`, value: listStr, inline: false },
            ],
            footer: { text: `Ryusei VGC • Gacha Lottery` },
            timestamp: new Date().toISOString(),
          };
          if (listing.imageUrl) completedEmbed.image = { url: listing.imageUrl };

          if (channelId && messageId) {
            await editChannelMessage(channelId, messageId, {
              embeds: [completedEmbed],
              components: [
                {
                  type: 1,
                  components: [
                    {
                      type: 2,
                      style: 2,
                      custom_id: `sell_shiny_sold_${listing.id}`,
                      label: `🎉 Đã Gacha xong! Người thắng: ${winningTicket.userName}`,
                      disabled: true,
                    },
                  ],
                },
              ],
              allowed_mentions: { users: [winnerId] },
            }).catch(console.error);

            const announceMsg = await createMessage(channelId, {
              content: `🎉 🎡 **KẾT QUẢ GACHA POKÉMON SHINY!** <@${winnerId}>`,
              embeds: [{
                color: THEME.ember,
                title: '👑 CHÚC MỪNG TRAINER MAY MẮN TRÚNG GIẢI!',
                description: `🎉 Đợt Vé Số Gacha **${listing.itemName}** (${ticketResult.totalSlots} vé) đã bán hết!\n\n👑 **Người trúng thưởng:** <@${winnerId}>\n🎫 **Kênh ticket nhận quà:** <#${ticketChannelId}>`,
                fields: [
                  { name: `👥 Thống kê tất cả vé (${allTickets.length} vé)`, value: listStr, inline: false }
                ],
                ...(listing.imageUrl ? { image: { url: listing.imageUrl } } : {}),
                footer: { text: 'Ryusei VGC • Gacha Lottery' },
                timestamp: new Date().toISOString(),
              }],
              allowed_mentions: { users: [winnerId] },
            }).catch(console.error) as { id?: string } | undefined;

            if (announceMsg?.id) {
              await updateSellShinyAnnounceMessageId(listing.id, String(announceMsg.id));
            }
          }

          await createFollowupMessage(interaction.application_id, interaction.token, {
            content: `🎉 **Đã mua thành công vé số cuối cùng!** Hệ thống đã thực hiện Gacha và người chiến thắng là <@${winnerId}>! 🎫 Ticket: <#${ticketChannelId}>.`,
            flags: 64,
          });
        }

      } catch (e: any) {
        console.error('Lỗi khi xử lý mua vé số gacha:', e);
        await createFollowupMessage(interaction.application_id, interaction.token, {
          content: `❌ Lỗi xử lý giao dịch: ${e.message}`,
          flags: 64,
        });
      }
      return;
    }

    // ── DIRECT BUY MODE ──────────────────────────────────────────────────────
    try {
      await addRyucoin(guildId, actor.id, -listing.price);
      await depositToBank(MAIN_GUILD_ID, listing.price).catch(err => console.error('Lỗi nạp doanh thu sell-shiny vào bank admin:', err));
      await checkEconomyAchievements(guildId, actor.id).catch(console.error);

      const ticketChannelId = await createShopTicketChannel({
        interaction,
        ticketType: 'SellShiny',
        itemName: listing.itemName,
        cost: listing.price,
        imageUrl: listing.imageUrl || undefined,
      });

      const boughtResult = await buySellShinyStock({
        id: listing.id,
        buyerId: actor.id,
        ticketChannelId,
      });

      if (!boughtResult.success || !boughtResult.listing) {
        await addRyucoin(guildId, actor.id, listing.price);
        await createFollowupMessage(interaction.application_id, interaction.token, {
          content: '❌ Sản phẩm này đã hết hàng hoặc có người mua trước!',
          flags: 64,
        });
        return;
      }

      const updatedListing = boughtResult.listing;
      const remainingStock = updatedListing.totalSlots - updatedListing.soldSlots;
      const messageId = updatedListing.messageId || interaction.message?.id;
      const channelId = updatedListing.channelId || interaction.channel_id;

      if (remainingStock > 0) {
        // Vẫn còn stock -> giữ status open, update embed stock còn lại
        const editedEmbed: Record<string, unknown> = {
          color: THEME.ember,
          title: `✨ POKÉMON SHINY ĐANG BÁN!`,
          description: `🏷️ **Tên Pokémon:** **${updatedListing.itemName}**\n💰 **Giá:** **${updatedListing.price.toLocaleString()} 🪙 Ryucoin**\n📦 **Stock:** **${remainingStock} / ${updatedListing.totalSlots}**\n\n🟢 **Trạng thái:** Còn lại **${remainingStock}** sản phẩm.\n\n👇 Bấm nút **[🛒 Mua Ngay]** bên dưới để sở hữu Pokémon Shiny này!`,
          fields: [
            { name: '👤 Người bán', value: `<@${updatedListing.sellerId}>`, inline: true },
            { name: '🪙 Giá bán', value: `**${updatedListing.price.toLocaleString()} 🪙**`, inline: true },
          ],
          footer: { text: `Sử dụng Ryucoin để mua • Người bấm nhanh nhất & đủ tiền sẽ sở hữu` },
          timestamp: new Date(updatedListing.createdAt).toISOString(),
        };
        if (updatedListing.imageUrl) editedEmbed.image = { url: updatedListing.imageUrl };

        if (channelId && messageId) {
          await editChannelMessage(channelId, messageId, {
            embeds: [editedEmbed],
            components: [
              {
                type: 1,
                components: [
                  {
                    type: 2,
                    style: 3,
                    custom_id: `sell_shiny_buy_${updatedListing.id}`,
                    label: `🛒 Mua Ngay (${updatedListing.price.toLocaleString()} 🪙)`,
                  },
                ],
              },
            ],
          }).catch(err => console.error('Lỗi khi edit tin nhắn sell-shiny:', err));
        }

        await createFollowupMessage(interaction.application_id, interaction.token, {
          content: `🎉 **Đã thanh toán thành công ${updatedListing.price.toLocaleString()} 🪙 Ryucoin cho ${updatedListing.itemName}!**\n📦 Tồn kho còn lại: **${remainingStock}** sản phẩm.\n🎫 Ticket nhận quà của bạn đã được tạo tại <#${ticketChannelId}>.`,
          flags: 64,
        });

      } else {
        // Hết stock -> đổi status completed, disable nút Mua Ngay, giữ nút Cập nhật Stock
        const editedEmbed: Record<string, unknown> = {
          color: THEME.win,
          title: `✨ POKÉMON SHINY ĐÃ HẾT HÀNG!`,
          description: `🎉 **${updatedListing.itemName}** đã được bán hết!\n💰 **Giá thanh toán:** **${updatedListing.price.toLocaleString()} 🪙 Ryucoin**\n📦 **Stock:** **0 / ${updatedListing.totalSlots} (Đã hết hàng)**\n\n🔴 **Trạng thái:** Đã bán hết toàn bộ stock.`,
          fields: [
            { name: '👤 Người mua gần nhất', value: `<@${actor.id}>`, inline: true },
            { name: '🪙 Giá bán', value: `**${updatedListing.price.toLocaleString()} 🪙**`, inline: true },
          ],
          footer: { text: `Giao dịch hoàn tất` },
          timestamp: new Date().toISOString(),
        };
        if (updatedListing.imageUrl) editedEmbed.image = { url: updatedListing.imageUrl };

        if (channelId && messageId) {
          await editChannelMessage(channelId, messageId, {
            embeds: [editedEmbed],
            components: [
              {
                type: 1,
                components: [
                  {
                    type: 2,
                    style: 2,
                    custom_id: `sell_shiny_sold_${updatedListing.id}`,
                    label: `🛒 Mua Ngay (Hết hàng)`,
                    disabled: true,
                  },
                ],
              },
            ],
            allowed_mentions: { users: [actor.id] },
          }).catch(err => console.error('Lỗi khi edit tin nhắn sell-shiny:', err));
        }

        await createFollowupMessage(interaction.application_id, interaction.token, {
          content: `🎉 **Đã thanh toán thành công ${updatedListing.price.toLocaleString()} 🪙 Ryucoin cho ${updatedListing.itemName}!** (Bạn đã mua sản phẩm cuối cùng!)\n🎫 Ticket nhận quà của bạn đã được tạo tại <#${ticketChannelId}>.`,
          flags: 64,
        });

        setTimeout(async () => {
          try {
            const current = await getSellShinyListing(updatedListing.id);
            if (current && current.status === 'completed') {
              if (channelId && messageId) {
                await deleteChannelMessage(channelId, messageId).catch(() => null);
              }
              await deleteSellShinyListings([updatedListing.id]).catch(() => null);
            }
          } catch (err) {
            console.error('Lỗi khi tự động xóa tin nhắn sell-shiny:', err);
          }
        }, 5 * 60_000);
      }

    } catch (e: any) {
      console.error('Lỗi khi xử lý mua sell-shiny:', e);
      await createFollowupMessage(interaction.application_id, interaction.token, {
        content: `❌ Lỗi xử lý giao dịch: ${e.message}`,
        flags: 64,
      });
    }
    return;
  }
  if (customId.startsWith('ga_question_btn_')) {
    return;
  }
  if (customId.startsWith('pkdx_')) {
    await handlePokedexTabButton(interaction, customId);
    return;
  }
  if (customId.startsWith('self_destruct_confirm_')) {
    const clicker = actorUser(interaction);
    await editSource(interaction, {
      embeds: [{
        color: THEME.crimson,
        title: '💥 ĐANG THỰC HIỆN TỰ HỦY... 0%',
        description: `🔥 **[1/3]** Đang xóa dữ liệu Elo và Bảng Xếp Hạng...\n🔥 **[2/3]** Đang thiêu rụi ví Ryucoin của Server...\n⚡ **[3/3]** Đang đánh sập máy chủ Vercel...`,
      }],
      components: [],
    });

    await new Promise(r => setTimeout(r, 3000));

    await editSource(interaction, {
      embeds: [{
        color: THEME.win,
        title: '🤡 QUÁ NHỌ CHO BẠN! BỊ LỪA RỒI NHA 🤡',
        description: `🤣 **Làm gì có chuyện tự hủy thật hả <@${clicker.id}>!**\n\nBot Ryusei vẫn sống nhăn răng, điểm Elo và Ryucoin của mọi người vẫn còn nguyên 100% nhé! 🤪💥🎉\n\n*Bị ăn quả lừa đắng mề chưa nè!* ❤️`,
        image: { url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExNWdsaWhubms3bWc0Z3J4bWlndmpkcHg0cnU1bWV3cm93cm5iZXNjdSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/gd09Y2Ptu7gsiPVuP1/giphy.gif' },
        footer: { text: 'Cú lừa đỉnh cao đến từ Ryusei Bot 🤖✨' },
      }],
      components: [],
    });
    return;
  }
  if (customId.startsWith('self_destruct_abort_')) {
    const clicker = actorUser(interaction);
    await editSource(interaction, {
      embeds: [{
        color: THEME.ember,
        title: '🛡️ GIAO THỨC TỰ HỦY ĐÃ BỊ NGĂN CHẶN! 🛡️',
        description: `😮‍💨 <@${clicker.id}> vừa kịp thời nhấn nút **HỦY LỆNH**, giải cứu toàn bộ dữ liệu Elo và Ryucoin của Server khỏi thảm họa (fake)! 🦸‍♂️✨`,
      }],
      components: [],
    });
    return;
  }
  if (customId.startsWith('lb_page_') || customId.startsWith('lb_scope_')) {
    await handleLeaderboardPage(interaction, customId);
    return;
  }
  if (customId.startsWith('coin_lb_page_') || customId.startsWith('coin_lb_scope_')) {
    await handleCoinLeaderboardPage(interaction, customId);
    return;
  }
  if (customId.startsWith('hist_page_')) {
    await handleHistoryPage(interaction, customId);
    return;
  }
  if (customId.startsWith('hof_page_')) {
    await handleHallOfFamePage(interaction, customId);
    return;
  }
  if (customId.startsWith('ticket_close_')) {
    const channelId = interaction.channel_id;
    if (!channelId) return;

    await reply(interaction, {
      content: '🔒 **Kênh Ticket sẽ tự động xóa trong 3 giây...**',
    });

    // Nếu đây là ticket của /sell-shiny hoặc /gacha-shiny, xóa luôn tin nhắn rao bán / chúc mừng công khai
    const shinyListing = await getSellShinyListingByTicketChannelId(channelId).catch(() => null);
    if (shinyListing) {
      if (shinyListing.channelId && shinyListing.messageId) {
        await deleteChannelMessage(shinyListing.channelId, shinyListing.messageId).catch(() => null);
      }
      if (shinyListing.channelId && shinyListing.announceMessageId) {
        await deleteChannelMessage(shinyListing.channelId, shinyListing.announceMessageId).catch(() => null);
      }
      await deleteSellShinyListings([shinyListing.id]).catch(() => null);
    }

    await new Promise(resolve => setTimeout(resolve, 3000));
    await deleteChannel(channelId, 'Đóng ticket theo yêu cầu').catch(err => console.error('Lỗi khi xóa ticket channel:', err));
    return;
  }
  if (customId.startsWith('shop_main_menu_')) {
    const userId = customId.split('_')[3];
    const actor = actorUser(interaction);
    if (actor.id !== userId) {
      await createFollowupMessage(interaction.application_id, interaction.token, { content: '🚫 Bạn không thể điều khiển cửa hàng của người khác!', flags: 64 });
      return;
    }
    const guildId = requireGuild(interaction);
    const rating = await getRating(guildId, actor.id);
    await editSource(interaction, buildMainShopMessage(rating, actor.id));
    return;
  }
  if (customId.startsWith('shop_btn_nickname_')) {
    return;
  }

  // Custom Background Profile
  if (customId.startsWith('shop_select_bg_')) {
    const userId = customId.split('_')[3];
    const actor = actorUser(interaction);
    if (actor.id !== userId) {
      await createFollowupMessage(interaction.application_id, interaction.token, { content: '🚫 Bạn không thể điều khiển cửa hàng của người khác!', flags: 64 });
      return;
    }
    const guildId = requireGuild(interaction);
    const rating = await getRating(guildId, actor.id);
    const cost = 400;

    if (rating.ryucoin < cost) {
      await createFollowupMessage(interaction.application_id, interaction.token, {
        content: `❌ Bạn không đủ Ryucoin! Hiện có **${rating.ryucoin} 🪙**, cần **${cost} 🪙** để tạo Ticket Custom Background.`,
        flags: 64
      });
      return;
    }

    try {
      await addRyucoin(guildId, actor.id, -cost);
      await depositToBank(guildId, cost).catch(err => console.error('Lỗi nạp doanh thu background vào bank:', err));
      await checkEconomyAchievements(guildId, actor.id).catch(console.error);

      const ticketChannelId = await createShopTicketChannel({
        interaction,
        ticketType: 'Profile',
        itemName: 'Custom Background Profile (Tuỳ Chỉnh)',
        cost,
      });

      await createFollowupMessage(interaction.application_id, interaction.token, {
        content: `🎉 **Đã thanh toán thành công 400 🪙 Ryucoin cho Custom Background Profile!**\n🎫 Ticket của bạn đã được tạo tại <#${ticketChannelId}>. Vui lòng vào kênh ticket và gửi link ảnh hoặc file ảnh bạn muốn cài làm Background để Admin duyệt và cài bằng lệnh \`/set-background\`!`,
        flags: 64
      });

      const updatedRating = await getRating(guildId, actor.id);
      await editSource(interaction, buildMainShopMessage(updatedRating, actor.id));
    } catch (e: any) {
      console.error('Lỗi khi mua Custom Background:', e);
      await createFollowupMessage(interaction.application_id, interaction.token, { content: `❌ Lỗi xử lý giao dịch: ${e.message}`, flags: 64 });
    }
    return;
  }

  // Custom Thumbnail Profile
  if (customId.startsWith('shop_select_logo_')) {
    const userId = customId.split('_')[3];
    const actor = actorUser(interaction);
    if (actor.id !== userId) {
      await createFollowupMessage(interaction.application_id, interaction.token, { content: '🚫 Bạn không thể điều khiển cửa hàng của người khác!', flags: 64 });
      return;
    }
    const guildId = requireGuild(interaction);
    const rating = await getRating(guildId, actor.id);
    const cost = 350; // Giá mua ticket Thumbnail

    if (rating.ryucoin < cost) {
      await createFollowupMessage(interaction.application_id, interaction.token, {
        content: `❌ Bạn không đủ Ryucoin! Hiện có **${rating.ryucoin} 🪙**, cần **${cost} 🪙** để tạo Ticket Custom Thumbnail.`,
        flags: 64
      });
      return;
    }

    try {
      await addRyucoin(guildId, actor.id, -cost);
      await depositToBank(guildId, cost).catch(err => console.error('Lỗi nạp doanh thu thumbnail vào bank:', err));
      await checkEconomyAchievements(guildId, actor.id).catch(console.error);

      const ticketChannelId = await createShopTicketChannel({
        interaction,
        ticketType: 'Profile', // 👈 Loại ticket mới
        itemName: 'Custom Thumbnail Profile (Tuỳ Chỉnh)',
        cost,
      });

      await createFollowupMessage(interaction.application_id, interaction.token, {
        content: `🎉 **Đã thanh toán thành công 350 🪙 Ryucoin cho Custom Thumbnail Profile!**\n🎫 Ticket của bạn đã được tạo tại <#${ticketChannelId}>. Vui lòng vào kênh ticket và gửi ảnh bạn muốn cài làm Thumbnail để Admin duyệt và cài bằng lệnh \`/set-thumbnail\`!`,
        flags: 64
      });

      const updatedRating = await getRating(guildId, actor.id);
      await editSource(interaction, buildMainShopMessage(updatedRating, actor.id));
    } catch (e: any) {
      console.error('Lỗi khi mua Custom Thumbnail:', e);
      await createFollowupMessage(interaction.application_id, interaction.token, { content: `❌ Lỗi xử lý giao dịch: ${e.message}`, flags: 64 });
    }
    return;
  }

  // Custom Role Shop
  if (customId.startsWith('shop_buy_role_')) {
    const parts = customId.split('_');
    const userId = parts[3];
    if (!userId) return;
    const actor = actorUser(interaction);
    if (actor.id !== userId) {
      await createFollowupMessage(interaction.application_id, interaction.token, { content: '🚫 Đây không phải là cửa hàng của bạn!', flags: 64 });
      return;
    }

    const guildId = requireGuild(interaction);
    const rating = await getRating(guildId, actor.id);
    const cost = 125;

    if (rating.ryucoin < cost) {
      await createFollowupMessage(interaction.application_id, interaction.token, {
        content: `❌ Bạn không đủ Ryucoin! Hiện có **${rating.ryucoin} 🪙**, cần **${cost} 🪙** để mua Role (15 ngày).`,
        flags: 64
      });
      return;
    }

    try {
      await addRyucoin(guildId, actor.id, -cost);
      await depositToBank(guildId, cost).catch(err => console.error('Lỗi nạp doanh thu role vào bank:', err));
      await checkEconomyAchievements(guildId, actor.id).catch(console.error);

      const ticketChannelId = await createShopTicketChannel({
        interaction,
        ticketType: 'Role',
        itemName: 'Role Đặc Biệt (15 Ngày)',
        cost,
      });

      await createFollowupMessage(interaction.application_id, interaction.token, {
        content: `🎉 **Đã thanh toán thành công 125 🪙 Ryucoin cho Role (15 ngày)!**\n🎫 Ticket nhận Role của bạn đã được tạo tại <#${ticketChannelId}>. Vui lòng vào kênh ticket để Mod cấp Role cho bạn!`,
        flags: 64
      });

      const updatedRating = await getRating(guildId, actor.id);
      await editSource(interaction, buildMainShopMessage(updatedRating, actor.id));
    } catch (e: any) {
      console.error('Lỗi khi mua Role:', e);
      await createFollowupMessage(interaction.application_id, interaction.token, { content: `❌ Lỗi xử lý giao dịch: ${e.message}`, flags: 64 });
    }
    return;
  }
  if (customId.startsWith('shop_buy_shiny_')) {
    const parts = customId.split('_');
    const shinyType = parts[3]; // 'common' | 'rare' | 'legendary'
    const userId = parts[4] || parts[3];
    if (!userId) return;
    const actor = actorUser(interaction);
    if (actor.id !== userId) {
      await createFollowupMessage(interaction.application_id, interaction.token, { content: '🚫 Đây không phải là cửa hàng của bạn!', flags: 64 });
      return;
    }

    if (shinyType === 'legendary') {
      await createFollowupMessage(interaction.application_id, interaction.token, {
        content: '⚠️ Chức năng mua Pokémon Shiny Huyền Thoại hiện đang tạm thời tắt. Vui lòng quay lại sau!',
        flags: 64
      });
      return;
    }

    const guildId = requireGuild(interaction);
    const rating = await getRating(guildId, actor.id);

    let cost = 500;
    let label = 'Pokémon Shiny Thường (Common)';
    if (shinyType === 'rare') {
      cost = 750;
      label = 'Pokémon Shiny Hiếm (Rare)';
    } else if (shinyType === 'legendary') {
      cost = 2000;
      label = 'Pokémon Shiny Huyền Thoại (Legendary)';
    }

    if (rating.ryucoin < cost) {
      await createFollowupMessage(interaction.application_id, interaction.token, {
        content: `❌ Bạn không đủ Ryucoin! Hiện có **${rating.ryucoin} 🪙**, cần **${cost} 🪙** để mua **${label}**.`,
        flags: 64
      });
      return;
    }

    try {
      await addRyucoin(guildId, actor.id, -cost);
      await depositToBank(guildId, cost).catch(err => console.error('Lỗi nạp doanh thu shiny vào bank:', err));
      await checkEconomyAchievements(guildId, actor.id).catch(console.error);

      const ticketChannelId = await createShopTicketChannel({
        interaction,
        ticketType: 'Shiny',
        itemName: label,
        cost,
      });

      await createFollowupMessage(interaction.application_id, interaction.token, {
        content: `🎉 **Đã thanh toán thành công ${cost} 🪙 Ryucoin cho 1x ${label}!**\n🎫 Ticket nhận quà của bạn đã được tạo tại <#${ticketChannelId}>. Vui lòng vào kênh ticket để trao đổi chọn Pokémon Shiny!`,
        flags: 64
      });

      const updatedRating = await getRating(guildId, actor.id);
      await editSource(interaction, buildMainShopMessage(updatedRating, actor.id));
    } catch (e: any) {
      console.error('Lỗi khi mua Shiny:', e);
      await createFollowupMessage(interaction.application_id, interaction.token, { content: `❌ Lỗi xử lý giao dịch: ${e.message}`, flags: 64 });
    }
    return;
  }
  if (customId.startsWith('shop_page_')) {
    const parts = customId.split('_');
    const newIndex = parseInt(parts[2] || '0', 10);
    const userId = parts[3];
    if (!userId) return;
    const actor = actorUser(interaction);
    if (actor.id !== userId) {
      await createFollowupMessage(interaction.application_id, interaction.token, { content: '🚫 Bạn không thể lướt xem cửa hàng của người khác! Hãy gõ lệnh /shop của riêng mình.', flags: 64 });
      return;
    }
    const guildId = requireGuild(interaction);
    const rating = await getRating(guildId, actor.id);
    if (!isNaN(newIndex)) {
      await editSource(interaction, buildShopMessage(newIndex, rating, actor.id));
    }
    return;
  }
  if (customId.startsWith('shop_buy_bg_')) {
    const parts = customId.split('_');
    const selected = parts[3];
    const userId = parts[4];
    if (!selected || !userId) return;
    const actor = actorUser(interaction);
    if (actor.id !== userId) {
      await createFollowupMessage(interaction.application_id, interaction.token, { content: '🚫 Đây không phải là cửa hàng của bạn!', flags: 64 });
      return;
    }
    const guildId = requireGuild(interaction);
    const wp = WALLPAPERS[selected];
    if (!wp) return;
    try {
      const msg = await setWallpaper(guildId, actor.id, selected, wp.cost);

      await createFollowupMessage(interaction.application_id, interaction.token, {
        content: `🎉 ${msg} hình nền **${wp.name}**${wp.cost > 0 ? ` (-${wp.cost} 🪙)` : ''}!`,
        flags: 64
      });

      const updatedRating = await getRating(guildId, actor.id);
      const index = Object.keys(WALLPAPERS).indexOf(selected);
      await editSource(interaction, buildShopMessage(index, updatedRating, actor.id));
    } catch (e: any) {
      await createFollowupMessage(interaction.application_id, interaction.token, { content: '❌ Lỗi: ' + e.message, flags: 64 });
    }
    return;
  }
  if (customId === 'queue_leave') {
    const guildId = requireGuild(interaction);
    const actor = actorUser(interaction);
    await leaveQueue(guildId, actor.id);
    await editSource(interaction, {
      content: '',
      embeds: [statusEmbed({
        color: THEME.crimson,
        title: '❌ Đã hủy tìm trận',
        description: 'Bạn đã rời khỏi Hàng đợi.',
      })],
      components: [],
      allowed_mentions: { parse: [] },
    });
    return;
  }
  if (customId.startsWith('queue_rejoin')) {
    const ownerId = customId.split('|')[1];
    const actor = actorUser(interaction);
    if (ownerId && actor.id !== ownerId) {
      await createFollowupMessage(interaction.application_id, interaction.token, {
        content: '❌ Đây không phải nút của bạn.',
        flags: 64,
        allowed_mentions: { parse: [] },
      }).catch(console.error);
      return;
    }
    const guildId = requireGuild(interaction);
    await performQueueJoin(interaction, guildId, actor);
    return;
  }
  if (customId.startsWith('form_open')) {
    // Modal đã được trả từ initialResponse — không cần xử lý gì thêm ở đây
    return;
  }
  if (customId.startsWith('bill_check_')) {
    const billCode = customId.slice('bill_check_'.length);
    await handleBillCheckButton(interaction, billCode);
    return;
  }
  if (customId.startsWith('bill_cancel_')) {
    const billCode = customId.slice('bill_cancel_'.length);
    await handleBillCancelButton(interaction, billCode);
    return;
  }
  if (customId.startsWith('bet_vote_')) {
    // Modal đã được trả từ initialResponse — không cần xử lý gì thêm ở đây
    return;
  }
  const parts = customId.split('|');
  if (parts[0] === 'challenge') {
    await handleChallengeButton(interaction, parts[1], parts[2]);
    return;
  }
  if (parts[0] === 'result') {
    await handleResultButton(interaction, parts[1], parts[2], parts[3]);
    return;
  }
  if (parts[0] === 'modresolve') {
    await handleModResolveButton(interaction, parts[1], parts[2]);
    return;
  }
  throw new Error('Nút không hợp lệ hoặc đã quá cũ.');
}

async function handleLeaderboardPage(interaction: DiscordInteraction, customId: string): Promise<void> {
  const guildId = requireGuild(interaction);
  let scope: 'server' | 'global' = 'server';
  let page = 1;
  let requesterId: string | undefined;

  if (customId.startsWith('lb_scope_')) {
    const raw = customId.replace('lb_scope_', '');
    const parts = raw.split('_');
    scope = parts[0] === 'global' ? 'global' : 'server';
    page = parseInt(parts[1] || '1', 10) || 1;
    requesterId = parts[2];
  } else {
    const raw = customId.replace('lb_page_', '');
    const parts = raw.split('_');
    if (parts[0] === 'global' || parts[0] === 'server') {
      scope = parts[0];
      page = parseInt(parts[1] || '1', 10) || 1;
      requesterId = parts[2];
    } else {
      page = parseInt(parts[0] || '1', 10) || 1;
      requesterId = parts[1];
    }
  }

  if (requesterId) {
    const actor = actorUser(interaction);
    if (actor.id !== requesterId) {
      throw new Error('Chỉ người yêu cầu bảng xếp hạng này mới có thể điều khiển.');
    }
  }

  const totalUsers = scope === 'global' ? await globalLeaderboardCount() : await leaderboardCount(guildId);
  const totalPages = Math.max(1, Math.ceil(totalUsers / 10));
  const validPage = Math.max(1, Math.min(page, totalPages));
  const offset = (validPage - 1) * 10;
  const rows = scope === 'global' ? await globalLeaderboard(10, offset) : await leaderboard(guildId, 10, offset);
  const lbMsg = await buildLeaderboardMessage(guildId, rows, validPage, totalPages, requesterId, scope);

  await reply(interaction, {
    embeds: lbMsg.embeds,
    components: lbMsg.components,
    allowed_mentions: { parse: [] },
  });
}

async function handleCoinLeaderboardPage(interaction: DiscordInteraction, customId: string): Promise<void> {
  const guildId = requireGuild(interaction);
  let scope: 'server' | 'global' = 'server';
  let page = 1;
  let requesterId: string | undefined;

  if (customId.startsWith('coin_lb_scope_')) {
    const raw = customId.replace('coin_lb_scope_', '');
    const parts = raw.split('_');
    scope = parts[0] === 'global' ? 'global' : 'server';
    page = parseInt(parts[1] || '1', 10) || 1;
    requesterId = parts[2];
  } else {
    const raw = customId.replace('coin_lb_page_', '');
    const parts = raw.split('_');
    if (parts[0] === 'global' || parts[0] === 'server') {
      scope = parts[0];
      page = parseInt(parts[1] || '1', 10) || 1;
      requesterId = parts[2];
    } else {
      page = parseInt(parts[0] || '1', 10) || 1;
      requesterId = parts[1];
    }
  }

  if (requesterId) {
    const actor = actorUser(interaction);
    if (actor.id !== requesterId) {
      throw new Error('Chỉ người yêu cầu bảng xếp hạng này mới có thể điều khiển.');
    }
  }

  const totalUsers = scope === 'global' ? await globalCoinLeaderboardCount() : await coinLeaderboardCount(guildId);
  const totalPages = Math.max(1, Math.ceil(totalUsers / 10));
  const validPage = Math.max(1, Math.min(page, totalPages));
  const offset = (validPage - 1) * 10;
  const rows = scope === 'global' ? await globalCoinLeaderboard(10, offset) : await coinLeaderboard(guildId, 10, offset);
  const lbMsg = await buildCoinLeaderboardMessage(guildId, rows, validPage, totalPages, requesterId, scope);

  await reply(interaction, {
    embeds: lbMsg.embeds,
    components: lbMsg.components,
    allowed_mentions: { parse: [] },
  });
}

async function handleChallengeButton(
  interaction: DiscordInteraction,
  action: string | undefined,
  matchId: string | undefined,
): Promise<void> {
  if (!matchId) throw new Error('Nút thách đấu không hợp lệ.');
  const guildId = requireGuild(interaction);
  const channelId = requireChannel(interaction);
  const actor = actorUser(interaction);
  const match = await getMatch(matchId);
  if (!match || match.guildId !== guildId) throw new Error('Lời thách đấu không tồn tại.');
  if (actor.id !== match.opponentId && actor.id !== match.challengerId) {
    throw new Error('Bạn không có quyền tham gia vào lời thách đấu này.');
  }

  const isExpired = match.status === 'expired' || (match.status === 'pending' && Date.now() - match.createdAt > CHALLENGE_TTL_MS);
  if (isExpired) {
    await expirePendingChallenges().catch(() => undefined);
    await editSource(interaction, {
      content: `⏰ Lời thách đấu giữa <@${match.challengerId}> và <@${match.opponentId}> đã hết hạn.`,
      embeds: [{
        color: THEME.crimson,
        title: '⏰ Lời thách đấu đã hết hạn',
        description: `Lời thách đấu giữa <@${match.challengerId}> và <@${match.opponentId}> đã hết hạn do không được phản hồi trong vòng 10 phút.`,
        fields: [{ name: '🆔 Match ID (Ấn giữ / Chạm để copy)', value: `\`\`\`${match.id}\`\`\``, inline: false }],
      }],
      components: [],
      allowed_mentions: { parse: [] },
    });
    return;
  }

  if (action === 'decline') {
    if (!await declineChallenge(matchId, actor.id)) {
      await editSource(interaction, {
        content: `⏰ Lời thách đấu giữa <@${match.challengerId}> và <@${match.opponentId}> đã hết hạn hoặc đã được xử lý.`,
        embeds: [{
          color: THEME.crimson,
          title: '⏰ Lời thách đấu đã hết hạn / Đã xử lý',
          description: `Lời thách đấu giữa <@${match.challengerId}> và <@${match.opponentId}> không còn hiệu lực.`,
          fields: [{ name: '🆔 Match ID', value: `\`\`\`${match.id}\`\`\``, inline: false }],
        }],
        components: [],
        allowed_mentions: { parse: [] },
      });
      return;
    }
    const isWithdraw = actor.id === match.challengerId;
    await editSource(interaction, {
      content: '',
      embeds: [{
        color: THEME.crimson,
        title: isWithdraw ? '🚫 Đã rút lời thách đấu' : '❌ Đã từ chối thách đấu',
        description: isWithdraw
          ? `<@${match.challengerId}> đã **rút lại** lời thách đấu đối với <@${match.opponentId}>.`
          : `<@${match.opponentId}> đã **từ chối** lời thách đấu của <@${match.challengerId}>.`,
        footer: { text: '🌠 Ryusei Bot' },
        timestamp: new Date().toISOString(),
      }],
      components: [], allowed_mentions: { parse: [] },
    });
    return;
  }

  if (actor.id !== match.opponentId) throw new Error('Chỉ người được thách đấu mới được quyền nhận kèo.');
  if (action !== 'accept') throw new Error('Nút thách đấu không hợp lệ.');

  const accepted = await acceptChallenge(matchId, actor.id);
  if (!accepted) {
    await editSource(interaction, {
      content: `⏰ Lời thách đấu giữa <@${match.challengerId}> và <@${match.opponentId}> đã hết hạn hoặc đã được xử lý.`,
      embeds: [{
        color: THEME.crimson,
        title: '⏰ Lời thách đấu đã hết hạn / Đã xử lý',
        description: `Lời thách đấu giữa <@${match.challengerId}> và <@${match.opponentId}> không còn hiệu lực.`,
        fields: [{ name: '🆔 Match ID', value: `\`\`\`${match.id}\`\`\``, inline: false }],
      }],
      components: [],
      allowed_mentions: { parse: [] },
    });
    return;
  }
  let matchChannelId: string | undefined;
  try {
    const settings = await getSettings(guildId);
    const p1 = slugifyName(accepted.challengerName);
    const p2 = slugifyName(accepted.opponentName);
    matchChannelId = await createMatchChannel({
      guildId,
      sourceChannelId: channelId,
      name: `rank-${p1}-vs-${p2}`,
      participantIds: [accepted.challengerId, accepted.opponentId],
      moderatorRoleIds: settings.modRoleIds,
      botUserId: interaction.application_id,
      categoryId: settings.matchCategoryId,
    });

    // code mới
    const [rank1, rank2, isBlacklisted1, isBlacklisted2] = await Promise.all([
      rankPosition(guildId, match.challengerId),
      rankPosition(guildId, match.opponentId),
      isUserBlacklisted(guildId, match.challengerId),
      isUserBlacklisted(guildId, match.opponentId)
    ]);

    const isRestrictedMatch = (rank1 && rank1 <= 10) || (rank2 && rank2 <= 10) || isBlacklisted1 || isBlacklisted2;
    let noticeText = 'Hai người tự tổ chức trận đấu. Khi xong, một người bấm kết quả; người còn lại phải xác nhận trước khi Elo được cập nhật.';

    if (isRestrictedMatch) {
      noticeText += '\n\n🚨 **QUY ĐỊNH ĐẶC BIỆT:** Trận đấu này bị giám sát (Do có Top 10 hoặc tài khoản thuộc diện cần chú ý).\n🔒 **Các nút báo cáo kết quả hiện đang bị KHÓA.**\n📸 Hãy dùng lệnh `/gui-anh [chọn file]` nộp ảnh kết quả game lên đây, bot sẽ tự động mở khóa các nút bấm!';
    }

    const controlMsg = await createMessage(matchChannelId, {
      content: `<@${accepted.challengerId}> <@${accepted.opponentId}> — private match channel của hai bạn đã sẵn sàng.`,
      embeds: [{
        color: isRestrictedMatch ? THEME.gold : THEME.ember,
        title: '⚔️ Trận xếp hạng đã bắt đầu',
        description: noticeText,
        fields: [{ name: '🆔 Match ID (Ấn giữ / Chạm để copy)', value: `\`\`\`${accepted.id}\`\`\``, inline: false }],
      }],
      components: [resultClaimButtons(accepted, isRestrictedMatch)],
      allowed_mentions: { users: [accepted.challengerId, accepted.opponentId] },
    }) as { id?: string };

    // GỌI HÀM LƯU ID VÀO DATABASE
    if (controlMsg?.id) {
      await updateMatchControlMessageId(accepted.id, String(controlMsg.id));
    } else {
      console.error("Lỗi: Không lấy được ID của bảng điều khiển!");
    }

    if (isRestrictedMatch) {
      await createMessage(matchChannelId, {
        content: `📸 **HƯỚNG DẪN XÁC NHẬN KẾT QUẢ TRẬN ĐẤU**\nDo trận đấu này thuộc diện giám sát, sau khi hoàn thành, vui lòng sử dụng lệnh \`/gui-anh [chọn file]\` để tải ảnh chụp màn hình kết quả lên kênh này (Tham khảo hình mẫu kết quả hợp lệ bên dưới).\nBot sẽ tự động mở khóa các nút báo cáo kết quả sau khi bạn nộp ảnh!`,
        embeds: [{
          color: THEME.gold,
          title: '🖼️ Hình Mẫu Kết Quả Hợp Lệ (Battle Log)',
          image: { url: `https://media.discordapp.net/attachments/1521444534980972604/1539285942639263844/IMG_5788.png?ex=6a85c33f&is=6a8471bf&hm=250e3e86a3af90ce1f160b316698a8df42ae32dc76f010dfddd862ffb4bf19b6&=&format=webp&quality=lossless&width=1280&height=592` }
        }],
        allowed_mentions: { parse: [] }
      });
    }

    await startAcceptedMatch(matchId, matchChannelId);
    // code mới 

  } catch (error) {
    await cancelAcceptedMatch(matchId, 'Không thể tạo private match channel.');
    if (matchChannelId) await deleteChannel(matchChannelId, 'Không thể thiết lập ranked match channel.').catch(() => undefined);
    throw error;
  }

  await editSource(interaction, {
    content: '',
    embeds: [statusEmbed({
      color: THEME.win,
      title: '✅ Đã nhận kèo!',
      description: `Trận đấu tiếp tục tại <#${matchChannelId}>.`,
    })],
    components: [], allowed_mentions: { parse: [] },
  });
}

async function handleResultButton(
  interaction: DiscordInteraction,
  action: string | undefined,
  matchId: string | undefined,
  outcome: string | undefined,
): Promise<void> {
  if (!matchId) throw new Error('Nút kết quả không hợp lệ.');
  const guildId = requireGuild(interaction);
  const actor = actorUser(interaction);
  const match = await getMatch(matchId);
  if (!match || match.guildId !== guildId) throw new Error('Không tìm thấy trận đấu.');
  if (![match.challengerId, match.opponentId].includes(actor.id)) throw new Error('Bạn không phải người chơi trong trận này.');

  if (action === 'claim') {
    if (!outcome) throw new Error('Kết quả không hợp lệ.');
    const winnerId = outcome === 'draw' ? undefined : outcome;
    const settings = await getSettings(match.guildId);
    const pending = await proposeResult(matchId, actor.id, winnerId, settings.resultTimeoutMinutes);
    const confirmerId = actor.id === match.challengerId ? match.opponentId : match.challengerId;
    const deadline = Math.floor(pending.confirmationDeadline! / 1000);
    await editSource(interaction, {
      content: `<@${confirmerId}>, hãy xác nhận kết quả hoặc phản đối trước <t:${deadline}:R>.`,
      embeds: [{
        color: THEME.gold,
        title: '⏳ Kết quả đang chờ xác nhận',
        description: resultText(pending.proposedWinnerId, match),
        fields: [
          { name: 'Người báo kết quả', value: `<@${actor.id}>`, inline: true },
          { name: '🆔 Match ID (Ấn giữ / Chạm để copy)', value: `\`\`\`${pending.id}\`\`\``, inline: false },
        ],
      }],
      components: [confirmationButtons(pending.id)],
      allowed_mentions: { users: [confirmerId] },
    });
    return;
  }

  if (action === 'cancel_claim') {
    const cancelled = await cancelProposedResult(matchId, actor.id);
    await editSource(interaction, {
      content: `<@${cancelled.challengerId}> <@${cancelled.opponentId}> — private match channel của hai bạn đã sẵn sàng.\nHãy chốt kết quả sau khi đấu xong.`,
      embeds: [matchEmbed(cancelled)],
      components: [resultClaimButtons(cancelled)],
      allowed_mentions: { users: [cancelled.challengerId, cancelled.opponentId] },
    });
    return;
  }

  if (action === 'confirm') {
    const result = await confirmResult(matchId, actor.id);
    await syncTopRoles(guildId).catch(console.error);
    await editSource(interaction, {
      content: '',
      embeds: [statusEmbed({
        color: THEME.win,
        title: '✅ Kết quả đã xác nhận',
        description: 'Kết quả đã được **cả hai người chơi** xác nhận. Elo đang được cập nhật.',
      })],
      components: [], allowed_mentions: { parse: [] },
    });
    await announceFinalResult(result);
    await deleteMatchChannel(result.match, 'Hai người chơi đã xác nhận kết quả ranked.');
    return;
  }

  if (action === 'dispute') {
    const disputed = await disputeResult(matchId, actor.id);
    await editSource(interaction, {
      content: '',
      embeds: [statusEmbed({
        color: THEME.crimson,
        title: '⚠️ Đã gọi Mod xử lý',
        description: `<@${actor.id}> đã bấm **Phản đối / gọi Mod** để yêu cầu xử lý trận này.`,
      })],
      components: [], allowed_mentions: { parse: [] },
    });
    await pingModerators(disputed, `<@${actor.id}> đã yêu cầu Mod hỗ trợ xử lý.`);
    return;
  }
  throw new Error('Nút kết quả không hợp lệ.');
}

async function handleModResolveButton(
  interaction: DiscordInteraction,
  matchId: string | undefined,
  outcome: string | undefined,
): Promise<void> {
  if (!matchId || !outcome) throw new Error('Nút mod resolve không hợp lệ.');
  const guildId = requireGuild(interaction);
  const actor = actorUser(interaction);
  if (!await isModerator(interaction)) throw new Error('Chỉ Mod mới có thể dùng nút này.');
  const match = await getMatch(matchId);
  if (!match || match.guildId !== guildId) throw new Error('Không tìm thấy trận đấu trong server này.');
  const winnerId = outcome === 'draw' ? undefined : outcome;
  const result = await resolveResult(matchId, winnerId, `Mod ${displayName(actor)} xử lý.`);
  await syncTopRoles(guildId).catch(console.error);
  await editSource(interaction, {
    content: '',
    embeds: [statusEmbed({
      color: THEME.win,
      title: '✅ Mod đã xử lý trận',
      description: `Mod **${displayName(actor)}** đã xử lý trận.\n${resultText(result.match.winnerUserId, result.match)}.`,
    })],
    components: [],
    allowed_mentions: { parse: [] },
  });
  await announceFinalResult(result, `Kết quả do Mod <@${actor.id}> xác nhận.`);
  await deleteMatchChannel(result.match, 'Trận ranked đã được Mod xử lý.');
}

export async function scanOverdueActions(): Promise<number> {
  await expirePendingChallenges();
  const overdue = await markOverdueConfirmations();
  for (const match of overdue) {
    await pingModerators(match, 'Đối thủ đã không xác nhận kết quả đúng hạn.');
  }

  // Auto season end
  const overdueSeasons = await getOverdueSeasons(Date.now());
  for (const s of overdueSeasons) {
    if (s.scheduledSeasonName) {
      const seasonName = s.scheduledSeasonName;
      const cleared = await clearScheduledSeasonIfMatching(s.guildId, seasonName);
      if (!cleared) continue;

      const season = await saveSeasonSnapshot(s.guildId, seasonName);

      const resetMode = s.scheduledSeasonResetMode || 'soft';
      let resetNotice = '';
      if (resetMode === 'soft') {
        const resetCount = await softResetGuildRatings(s.guildId, 0.2);
        await updateLiveLeaderboard(s.guildId);
        resetNotice = `\n\n🔄 **Soft Reset Elo**: Đã cân bằng Elo của **${resetCount}** người chơi về mốc 1000 (ví dụ: 1100 ➔ 1020, 900 ➔ 980).`;
      } else if (resetMode === 'hard') {
        const resetCount = await hardResetGuildRatings(s.guildId);
        await updateLiveLeaderboard(s.guildId);
        resetNotice = `\n\n🔄 **Hard Reset Elo**: Đã đưa Elo của **${resetCount}** người chơi về mốc 1000.`;
      }

      const embed = {
        color: THEME.gold,
        title: `🏆 Tổng kết ${season.seasonName}`,
        description: 'Xin chúc mừng những người chơi xuất sắc nhất mùa giải đã được vinh danh vào Bảng Vàng!\n\n' +
          season.topPlayers.map((p, i) => {
            const medal = ['🥇', '🥈', '🥉'][i] || `**#${i + 1}**`;
            const nameTag = p.userName ? ` **(${p.userName})**` : '';
            return `${medal} <@${p.userId}>${nameTag} — **${p.rating}** Elo · ${p.wins}W ${p.losses}L ${p.draws}D`;
          }).join('\n\n') + resetNotice,
        footer: { text: `Chốt tự động lúc ${new Date(season.endedAt).toLocaleString('vi-VN')}` },
      };

      const targetChannelId = s.hallOfFameChannelId || s.leaderboardChannelId || s.logChannelId;
      if (targetChannelId) {
        // Tạm thời tắt ping role khi test để tránh làm phiền mọi người
        const pingText = ''; // s.hallOfFameRoleId ? `<@&${s.hallOfFameRoleId}> ` : '';
        await createMessage(targetChannelId, {
          content: `${pingText}Đã có bảng vinh danh mùa **${season.seasonName}**!`,
          embeds: [embed],
          allowed_mentions: { parse: ['users', 'roles'] },
        }).catch(err => console.error('Không gửi được thông báo mùa giải:', err));
      }
    }
  }

  // Quét dọn tin nhắn sell-shiny đã hoàn thành quá 5 phút
  try {
    const expiredSellShiny = await getExpiredCompletedSellShinyListings(5 * 60_000);
    if (expiredSellShiny.length > 0) {
      for (const item of expiredSellShiny) {
        if (item.channelId && item.messageId) {
          await deleteChannelMessage(item.channelId, item.messageId).catch(() => null);
        }
        if (item.channelId && item.announceMessageId) {
          await deleteChannelMessage(item.channelId, item.announceMessageId).catch(() => null);
        }
      }
      await deleteSellShinyListings(expiredSellShiny.map(i => i.id)).catch(() => null);
    }
  } catch (err) {
    console.error('Lỗi khi quét dọn tin nhắn sell-shiny hết hạn:', err);
  }

  // Quét dọn các bill quá hạn thanh toán
  try {
    const overdueBills = await getOverduePendingBills();
    for (const bill of overdueBills) {
      await expireBill(bill.id);
      if (bill.channelId && bill.messageId && bill.channelId !== 'DM') {
        const expiredEmbed = {
          color: 0x95A5A6,
          author: { name: 'RYUSEI BILLING · HẾT HẠN THANH TOÁN' },
          title: `⏰ HÓA ĐƠN ĐÃ HẾT HẠN`,
          description: `Hóa đơn mã \`${bill.id}\` cho **${bill.title}** đã hết hạn thanh toán (quá thời gian chờ).`,
          footer: { text: `Ryusei Bot Billing • Mã bill: ${bill.id}` },
          timestamp: new Date().toISOString(),
        };
        await editChannelMessage(bill.channelId, bill.messageId, {
          embeds: [expiredEmbed],
          components: [],
          attachments: [],
        }).catch(console.error);
      }
    }
  } catch (err) {
    console.error('Lỗi khi quét bill hết hạn:', err);
  }

  // Dừng tìm trận cho những người chờ Hàng đợi quá 10 phút & ping để tìm lại
  try {
    const expiredQueue = await expireQueuePlayers(10 * 60_000);
    for (const p of expiredQueue) {
      if (!p.channelId) continue;
      await createMessage(p.channelId, {
        content: `<@${p.userId}>`,
        embeds: [statusEmbed({
          color: THEME.ember,
          title: '⏱️ Đã dừng tìm trận',
          description: `<@${p.userId}> ơi, bạn đã chờ trong Hàng đợi hơn **10 phút** nhưng chưa tìm được đối thủ nên hệ thống tạm dừng tìm trận.\n\nNếu vẫn muốn thi đấu, hãy bấm **🔍 Tìm lại** bên dưới để vào lại Hàng đợi nhé!`,
        })],
        components: [{
          type: 1,
          components: [{
            type: 2,
            custom_id: `queue_rejoin|${p.userId}`,
            label: 'Tìm lại',
            emoji: { name: '🔍' },
            style: 1,
          }],
        }],
        allowed_mentions: { users: [p.userId] },
      }).catch(err => console.error('Không gửi được thông báo hết hạn Hàng đợi:', err));
    }
  } catch (err) {
    console.error('Lỗi khi quét dọn Hàng đợi hết hạn:', err);
  }

  return overdue.length;
}

async function pingModerators(match: LadderMatch, reason: string): Promise<void> {
  const settings = await getSettings(match.guildId);
  const mention = settings.modRoleIds.length
    ? settings.modRoleIds.map(roleId => `<@&${roleId}>`).join(' ')
    : '**Mod/Admin**';
  await sendToMatchChannel(match, {
    content: mention,
    embeds: [statusEmbed({
      color: THEME.crimson,
      title: '🛎️ Cần Mod xử lý trận',
      description: `${reason}\nChọn người thắng bên dưới hoặc dùng \`/match resolve id:${match.id}\`.`,
      fields: [{ name: '🆔 Match ID (Ấn giữ / Chạm để copy)', value: `\`\`\`${match.id}\`\`\``, inline: false }],
    })],
    components: [modResolveButtons(match)],
    allowed_mentions: settings.modRoleIds.length ? { roles: settings.modRoleIds } : { parse: [] },
  });
}

async function announceFinalResult(result: FinalResult, prefix?: string): Promise<void> {
  const { match, change } = result;

  if (match.startedAt && match.endedAt) {
    const durationMs = match.endedAt - match.startedAt;
    const durationMinutes = Math.round(durationMs / 60000 * 10) / 10; // Lấy 1 chữ số thập phân

    // Nếu thời gian dưới 4 phút (4 * 60 * 1000 ms)
    if (durationMs < 4 * 60 * 1000) {
      await notifyQuickMatch(match.guildId, match, durationMinutes);
    }
  }

  const embed = {
    color: !match.winnerUserId ? THEME.gold : THEME.win,
    title: '🏁 Kết quả đã chốt',
    description: `${prefix ? `${prefix}\n\n` : ''}${resultText(match.winnerUserId, match)}`,
    fields: [
      { name: 'Bắt đầu', value: match.startedAt ? `<t:${Math.floor(match.startedAt / 1000)}:f>` : 'Không rõ' },
      { name: 'Kẻ thách đấu', value: `<@${match.challengerId}>: ${change.p1.old} → **${change.p1.next}** (${signed(change.p1.delta)})` },
      { name: 'Đối thủ', value: `<@${match.opponentId}>: ${change.p2.old} → **${change.p2.next}** (${signed(change.p2.delta)})` },
      { name: 'Chênh lệch', value: `**${Math.abs(change.p1.old - change.p2.old)}** Elo` },
      { name: '🆔 Match ID (Ấn giữ / Chạm để copy)', value: `\`\`\`${match.id}\`\`\``, inline: false },
    ],

    ...(match.proofImageUrl ? { image: { url: match.proofImageUrl } } : {}),
    footer: { text: `Match ID: ${match.id}` },
    timestamp: new Date(match.endedAt || Date.now()).toISOString(),
  };
  const matchEmbed = {
    ...embed,
    description: `${embed.description}\n\n⏳ *Kênh này sẽ tự động đóng <t:${Math.floor(Date.now() / 1000) + 30}:R>.*`,
  };
  const actionRow = {
    type: 1,
    components: [
      { type: 2, label: 'Hướng dẫn', emoji: { name: 'ℹ️' }, style: 5, url: GUIDE_URL },
    ],
  };
  await sendToMatchChannel(match, { embeds: [matchEmbed], components: [actionRow], allowed_mentions: { parse: [] } });
  await postToLogChannel(match.guildId, {
    embeds: [{
      ...embed,
      title: '🏁 Kết quả trận ranked',
      description: `**${match.challengerName}** vs **${match.opponentName}**\n\n${resultText(match.winnerUserId, match)}`,
    }],
    components: [actionRow],
    allowed_mentions: { parse: [] },
  });
  await updateAllLiveLeaderboards();

  // 1. Lấy thông tin thống kê mới nhất của 2 người chơi từ Database
  const [p1Stats, p2Stats] = await Promise.all([
    getRating(match.guildId, match.challengerId),
    getRating(match.guildId, match.opponentId)
  ]);

  const p1IsWin = match.winnerUserId === match.challengerId;
  const p2IsWin = match.winnerUserId === match.opponentId;

  // 2. ── 🏆 QUÉT THÀNH TỰU CHO PLAYER 1 ──
  await checkMatchAchievements(
    match.guildId,
    match.challengerId,
    { wins: p1Stats.wins, losses: p1Stats.losses, draws: p1Stats.draws },
    { isWin: p1IsWin, opponentId: match.opponentId } // 👈 Truyền context Player 1
  ).catch(console.error);

  // 3. ── 🏆 QUÉT THÀNH TỰU CHO PLAYER 2 ──
  await checkMatchAchievements(
    match.guildId,
    match.opponentId,
    { wins: p2Stats.wins, losses: p2Stats.losses, draws: p2Stats.draws },
    { isWin: p2IsWin, opponentId: match.challengerId } // 👈 Truyền context Player 2
  ).catch(console.error);

  await checkEconomyAchievements(match.guildId, match.opponentId).catch(console.error);
  await clearMatchProofImage(match.id).catch(err =>
    console.error('Lỗi khi xóa ảnh trong DB:', err)
  );
}

async function sendToMatchChannel(match: LadderMatch, payload: DiscordPayload): Promise<void> {
  if (!match.matchChannelId) return;
  await ensureMatchChannelOpen(match.matchChannelId);
  await createMessage(match.matchChannelId, payload).catch(error => console.error('Không gửi được vào match channel:', error));
}

async function postToLogChannel(guildId: string, payload: DiscordPayload): Promise<void> {
  const settings = await getSettings(guildId).catch(() => null);
  if (!settings?.logChannelId) return;
  await createMessage(settings.logChannelId, payload)
    .catch(error => console.error('Không gửi được vào log channel:', error));
}

async function notifyQuickMatch(guildId: string, match: LadderMatch, durationMinutes: number): Promise<void> {
  const settings = await getSettings(guildId).catch(() => null);
  // Ưu tiên gửi vào kênh log, nếu không có thì bỏ qua hoặc tìm kênh phù hợp
  const targetChannelId = MOD_ALERT_CHANNEL_ID;
  if (!targetChannelId) return;

  await createMessage(targetChannelId, {
    content: `<@${match.challengerId}> <@${match.opponentId}>`,
    embeds: [statusEmbed({
      color: THEME.crimson,
      title: '⚠️ CẢNH BÁO: TRẬN ĐẤU QUÁ NHANH (< 4 PHÚT)',
      description:
        `- **Trận giữa:** <@${match.challengerId}> vs <@${match.opponentId}>\n` +
        `- **Thời gian thi đấu:** Khoảng **${durationMinutes} phút**\n` +
        `- **Match ID:** \`${match.id}\`\n` +
        `*Đề nghị các Mod kiểm tra lại lịch sử hoặc replay trận đấu để phòng tránh tình trạng dàn xếp tỷ số / kết quả giả mạo!*`,
    })],
    allowed_mentions: { users: [match.challengerId, match.opponentId] }
  }).catch(err => console.error('Không gửi được cảnh báo trận nhanh:', err));
}

export function buildHallOfFameMessage(history: import('./types').SeasonHistory[], page: number, totalPages: number, requesterId?: string) {
  const offset = (page - 1) * 5;
  const pageItems = history.slice(offset, offset + 5);

  const embeds = pageItems.map(season => {
    return {
      color: THEME.gold,
      title: `🏆 ${season.seasonName}`,
      description: season.topPlayers.length
        ? season.topPlayers.map((p, i) => {
          const nameTag = p.userName ? ` **(${p.userName})**` : '';
          return `${rankChip(i + 1)} <@${p.userId}>${nameTag} — **${p.rating}** Elo · ${p.wins}W ${p.losses}L ${p.draws}D`;
        }).join('\n')
        : '*Không có dữ liệu*',
      footer: { text: `Kết thúc: ${new Date(season.endedAt).toLocaleDateString('vi-VN')}` },
    };
  });

  const components = [];
  if (totalPages > 1) {
    components.push({
      type: 1,
      components: [
        {
          type: 2,
          label: '◀ Trước',
          style: 2,
          custom_id: `hof_page_${page - 1}${requesterId ? `_${requesterId}` : ''}`,
          disabled: page <= 1,
        },
        {
          type: 2,
          label: `${page} / ${totalPages}`,
          style: 2,
          custom_id: 'hof_page_current',
          disabled: true,
        },
        {
          type: 2,
          label: 'Sau ▶',
          style: 2,
          custom_id: `hof_page_${page + 1}${requesterId ? `_${requesterId}` : ''}`,
          disabled: page >= totalPages,
        }
      ]
    });
  }

  return {
    content: `🌟 **BẢNG VÀNG CÁC MÙA GIẢI** 🌟${totalPages > 1 ? ` (Trang ${page}/${totalPages})` : ''}`,
    embeds,
    components,
  };
}

async function handleHallOfFamePage(interaction: DiscordInteraction, customId: string): Promise<void> {
  const guildId = requireGuild(interaction);
  const pageStr = customId.replace('hof_page_', '');
  const parts = pageStr.split('_');
  const page = parseInt(parts[0] || '', 10);
  const requesterId = parts[1];

  if (requesterId) {
    const actor = actorUser(interaction);
    if (actor.id !== requesterId) {
      throw new Error('Chỉ người yêu cầu bảng vàng này mới có thể chuyển trang.');
    }
  }

  if (isNaN(page)) throw new Error('Trang không hợp lệ.');

  const history = await getSeasonsHistory(guildId);
  const totalPages = Math.max(1, Math.ceil(history.length / 5));
  const validPage = Math.max(1, Math.min(page, totalPages));
  const hofMsg = buildHallOfFameMessage(history, validPage, totalPages, requesterId);

  await reply(interaction, {
    content: hofMsg.content,
    embeds: hofMsg.embeds,
    components: hofMsg.components,
    allowed_mentions: { parse: [] },
  });
}

async function updateLiveLeaderboard(guildId: string): Promise<void> {
  await syncTopRoles(guildId).catch(console.error);
  const settings = await getSettings(guildId).catch(() => null);
  if (!settings?.leaderboardChannelId || !settings?.leaderboardMessageId) return;

  const scope: 'server' | 'global' = settings.leaderboardScope === 'server' ? 'server' : 'global';
  const rows = scope === 'global' ? await globalLeaderboard(10, 0) : await leaderboard(guildId, 10, 0);
  const lbMsg = await buildLeaderboardMessage(guildId, rows, 1, 1, undefined, scope);

  await editChannelMessage(settings.leaderboardChannelId, settings.leaderboardMessageId, {
    embeds: lbMsg.embeds,
    components: lbMsg.components,
    allowed_mentions: { parse: [] },
  }).catch(error => console.error('Không cập nhật được live leaderboard:', error));
}

async function updateAllLiveLeaderboards(): Promise<void> {
  try {
    const liveBoards = await getAllLiveBoardSettings();
    for (const lb of liveBoards) {
      await updateLiveLeaderboard(lb.guildId).catch(console.error);
    }
  } catch (err) {
    console.error('Lỗi khi cập nhật tất cả live leaderboards:', err);
  }
}

export async function buildLeaderboardMessage(
  guildId: string,
  rows: import('./types').RatingRow[],
  page: number,
  totalPages: number,
  requesterId?: string,
  scope: 'server' | 'global' = 'server',
) {
  let userField: { name: string; value: string; inline: boolean } | undefined;

  if (requesterId) {
    const [userRating, userRank] = await Promise.all([
      getRating(guildId, requesterId).catch(() => null),
      rankPosition(guildId, requesterId).catch(() => undefined),
    ]);

    if (userRating) {
      const rankDisplay = userRank ? `**#${userRank}**` : '**Chưa xếp hạng / Tạm ẩn**';
      userField = {
        name: '👤 Thứ hạng của bạn',
        value: `<@${requesterId}> · ${rankDisplay}\n${INDENT}\`${userRating.rating}\` Elo · ${userRating.wins}W ${userRating.losses}L ${userRating.draws}D`,
        inline: false,
      };
    }
  }

  let description: string;
  if (rows.length) {
    const podium: string[] = [];
    const rest: string[] = [];
    rows.forEach((row, index) => {
      const rank = (page - 1) * 10 + index + 1;
      const nameTag = row.userName ? ` **${row.userName}**` : '';
      if (rank <= 3) {
        podium.push(
          `${rankChip(rank)} <@${row.userId}>${nameTag}\n${INDENT}\`${row.rating}\` Elo · ${row.wins}W ${row.losses}L ${row.draws}D`
        );
      } else {
        rest.push(
          `${rankChip(rank)} <@${row.userId}>${nameTag} · \`${row.rating}\` · ${row.wins}W ${row.losses}L ${row.draws}D`
        );
      }
    });
    description = [
      podium.join('\n\n'),
      podium.length && rest.length ? RULE : '',
      rest.join('\n'),
    ].filter(Boolean).join('\n');
  } else {
    description = '*Chưa có trận nào được xác nhận.*';
  }

  const embed: any = {
    color: THEME.gold,
    title: scope === 'global' ? '🏆 Bảng Xếp Hạng Elo — Toàn Hệ Thống' : '🏆 Bảng Xếp Hạng Elo — Server',
    description: `> **VGC Double League** · ${scope === 'global' ? '🌐 Toàn hệ thống' : '🏠 Server hiện tại'}\n${RULE}\n${description}`,
    timestamp: new Date().toISOString(),
  };

  if (userField) {
    embed.fields = [userField];
  }

  const components = [];
  // Tab buttons: Server vs Global
  const reqSuffix = requesterId ? `_${requesterId}` : '';
  components.push({
    type: 1,
    components: [
      { type: 2, custom_id: `lb_scope_server_1${reqSuffix}`, label: '🏠 Server Này', style: scope === 'server' ? 1 : 2 },
      { type: 2, custom_id: `lb_scope_global_1${reqSuffix}`, label: '🌐 Elo Tổng (Global)', style: scope === 'global' ? 1 : 2 },
    ]
  });

  if (totalPages > 1) {
    components.push({
      type: 1,
      components: [
        { type: 2, custom_id: `lb_page_${scope}_${page - 1}${reqSuffix}`, label: '◀ Trước', style: 2, disabled: page <= 1 },
        { type: 2, custom_id: `lb_page_current`, label: `Trang ${page}/${totalPages}`, style: 2, disabled: true },
        { type: 2, custom_id: `lb_page_${scope}_${page + 1}${reqSuffix}`, label: 'Sau ▶', style: 2, disabled: page >= totalPages }
      ]
    });
  }
  // Giữ lại nút Hướng dẫn
  components.push({
    type: 1,
    components: [{ type: 2, label: 'Hướng dẫn', emoji: { name: 'ℹ️' }, style: 5, url: GUIDE_URL }]
  });

  return { embeds: [embed], components };
}

export async function buildCoinLeaderboardMessage(
  guildId: string,
  rows: import('./types').RatingRow[],
  page: number,
  totalPages: number,
  requesterId?: string,
  scope: 'server' | 'global' = 'server',
) {
  let userField: { name: string; value: string; inline: boolean } | undefined;

  if (requesterId) {
    const [userRating, userRank] = await Promise.all([
      getRating(guildId, requesterId).catch(() => null),
      coinRankPosition(guildId, requesterId).catch(() => undefined),
    ]);

    if (userRating) {
      const rankDisplay = userRank ? `**#${userRank}**` : '**Chưa xếp hạng / 0 🪙**';
      const streakDisplay = (userRating.dailyStreak && userRating.dailyStreak > 0) ? ` · Streak daily: **${userRating.dailyStreak}** ngày 🔥` : '';
      userField = {
        name: '👤 Số dư của bạn',
        value: `<@${requesterId}> · ${rankDisplay}\n${INDENT}\`${userRating.ryucoin.toLocaleString()}\` 🪙 Ryucoin${streakDisplay}`,
        inline: false,
      };
    }
  }

  let description: string;
  if (rows.length) {
    const podium: string[] = [];
    const rest: string[] = [];
    rows.forEach((row, index) => {
      const rank = (page - 1) * 10 + index + 1;
      const nameTag = row.userName ? ` **${row.userName}**` : '';
      if (rank <= 3) {
        podium.push(`${rankChip(rank)} <@${row.userId}>${nameTag}\n${INDENT}\`${row.ryucoin.toLocaleString()}\` 🪙 Ryucoin`);
      } else {
        rest.push(`${rankChip(rank)} <@${row.userId}>${nameTag} · \`${row.ryucoin.toLocaleString()}\` 🪙`);
      }
    });
    description = [
      podium.join('\n\n'),
      podium.length && rest.length ? RULE : '',
      rest.join('\n'),
    ].filter(Boolean).join('\n');
  } else {
    description = '*Chưa có ai sở hữu Ryucoin trong server.*';
  }

  const embed: any = {
    color: THEME.gold,
    title: scope === 'global' ? '🪙 Bảng Xếp Hạng Ryucoin — Toàn Hệ Thống' : '🪙 Bảng Xếp Hạng Ryucoin — Server',
    description: `> **Danh Sách Phú Hộ** · ${scope === 'global' ? '🌐 Toàn hệ thống' : '🏠 Server hiện tại'}\n${RULE}\n${description}`,
    timestamp: new Date().toISOString(),
  };

  if (userField) {
    embed.fields = [userField];
  }

  const components = [];
  const reqSuffix = requesterId ? `_${requesterId}` : '';
  components.push({
    type: 1,
    components: [
      { type: 2, custom_id: `coin_lb_scope_server_1${reqSuffix}`, label: '🏠 Server Này', style: scope === 'server' ? 1 : 2 },
      { type: 2, custom_id: `coin_lb_scope_global_1${reqSuffix}`, label: '🌐 Ryucoin Tổng (Global)', style: scope === 'global' ? 1 : 2 },
    ]
  });

  if (totalPages > 1) {
    components.push({
      type: 1,
      components: [
        { type: 2, custom_id: `coin_lb_page_${scope}_${page - 1}${reqSuffix}`, label: '◀ Trước', style: 2, disabled: page <= 1 },
        { type: 2, custom_id: `coin_lb_page_current`, label: `Trang ${page}/${totalPages}`, style: 2, disabled: true },
        { type: 2, custom_id: `coin_lb_page_${scope}_${page + 1}${reqSuffix}`, label: 'Sau ▶', style: 2, disabled: page >= totalPages }
      ]
    });
  }

  return { embeds: [embed], components };
}

async function deleteMatchChannel(match: LadderMatch, reason: string): Promise<void> {
  if (!match.matchChannelId) return;
  await new Promise(resolve => setTimeout(resolve, 5000));
  await deleteChannel(match.matchChannelId, reason)
    .catch(error => console.error('Không xóa được match channel:', error));
}

async function isModerator(interaction: DiscordInteraction): Promise<boolean> {
  if (!interaction.guild_id) return false;
  const actor = actorUser(interaction);
  if (actor.id === '983625547076739102' || BET_ADMIN_IDS.has(actor.id)) return true;
  if (hasManageGuild(interaction)) return true;
  const settings = await getSettings(interaction.guild_id);
  return settings.modRoleIds.some(roleId => interaction.member?.roles?.includes(roleId));
}

function hasManageGuild(interaction: DiscordInteraction): boolean {
  try {
    return (BigInt(interaction.member?.permissions || '0') & MANAGE_GUILD) === MANAGE_GUILD;
  } catch {
    return false;
  }
}

function challengeButtons(matchId: string) {
  return {
    type: 1, components: [
      { type: 2, custom_id: `challenge|accept|${matchId}`, label: 'Nhận kèo', emoji: { name: '⚔️' }, style: 3 },
      { type: 2, custom_id: `challenge|decline|${matchId}`, label: 'Từ chối / Hủy kèo', emoji: { name: '✖️' }, style: 2 },
      { type: 2, label: 'Hướng dẫn', emoji: { name: 'ℹ️' }, style: 5, url: GUIDE_URL },
    ]
  };
}

function resultClaimButtons(match: LadderMatch, isLocked = false) {
  return {
    type: 1, components: [
      { type: 2, custom_id: `result|claim|${match.id}|${match.challengerId}`, label: `${match.challengerName} thắng`.slice(0, 80), emoji: { name: '🏆' }, style: 1, disabled: isLocked },
      { type: 2, custom_id: `result|claim|${match.id}|${match.opponentId}`, label: `${match.opponentName} thắng`.slice(0, 80), emoji: { name: '🏆' }, style: 1, disabled: isLocked },
      { type: 2, custom_id: `result|claim|${match.id}|draw`, label: 'Hòa', emoji: { name: '🤝' }, style: 2, disabled: isLocked },
      // Nút gọi Mod luôn luôn mở khóa (disabled: false)
      { type: 2, custom_id: `result|dispute|${match.id}`, label: 'Gọi Mod', emoji: { name: '⚠️' }, style: 4, disabled: false },
    ]
  };
}

function confirmationButtons(matchId: string) {
  return {
    type: 1, components: [
      { type: 2, custom_id: `result|confirm|${matchId}`, label: 'Xác nhận', emoji: { name: '✅' }, style: 3 },
      { type: 2, custom_id: `result|dispute|${matchId}`, label: 'Phản đối / gọi Mod', emoji: { name: '⚠️' }, style: 4 },
      { type: 2, custom_id: `result|cancel_claim|${matchId}`, label: 'Quay lại', emoji: { name: '↩️' }, style: 2 },
    ]
  };
}

function modResolveButtons(match: LadderMatch) {
  return {
    type: 1, components: [
      { type: 2, custom_id: `modresolve|${match.id}|${match.challengerId}`, label: `${match.challengerName} thắng`.slice(0, 80), emoji: { name: '🏆' }, style: 1 },
      { type: 2, custom_id: `modresolve|${match.id}|${match.opponentId}`, label: `${match.opponentName} thắng`.slice(0, 80), emoji: { name: '🏆' }, style: 1 },
      { type: 2, custom_id: `modresolve|${match.id}|draw`, label: 'Hòa', emoji: { name: '🤝' }, style: 2 },
    ]
  };
}

function matchEmbed(match: LadderMatch) {
  const names: Record<LadderMatch['status'], string> = {
    pending: 'Đang chờ nhận kèo', accepted: 'Đang tạo match channel', active: 'Đang đấu',
    awaiting_confirmation: 'Chờ xác nhận kết quả', disputed: 'Chờ Mod xử lý', finished: 'Đã kết thúc',
    declined: 'Đã từ chối', expired: 'Đã hết hạn', cancelled: 'Đã hủy',
  };
  const color = match.status === 'disputed' ? THEME.crimson : match.status === 'finished' ? THEME.win : THEME.ember;
  return {
    color,
    title: '⚔️ Chi Tiết Trận Đấu',
    description: `<@${match.challengerId}>  **VS**  <@${match.opponentId}>`,
    fields: [
      { name: 'Trạng thái', value: names[match.status], inline: true },
      { name: 'Match channel', value: match.matchChannelId ? `<#${match.matchChannelId}>` : '*Chưa tạo*', inline: true },
      { name: 'Kết quả', value: match.status === 'finished' ? resultText(match.winnerUserId, match) : '*Chưa chốt*' },
      { name: '🆔 Match ID (ấn giữ / chạm để copy)', value: `\`\`\`${match.id}\`\`\``, inline: false },
    ],
  };
}

function helpEmbeds(isAdmin: boolean) {
  const userEmbed = {
    color: THEME.ember,
    title: '📖 Ryusei Bot — Hướng Dẫn Người Chơi',
    description: [
      '`/challenge user:@...` — gửi lời thách đấu.',
      '`/queue join` — tham gia Hàng đợi ghép trận ngẫu nhiên.',
      '`/queue leave` — rời khỏi Hàng đợi.',
      'Đối thủ bấm **Nhận kèo**; bot tạo private match channel.',
      'Sau trận, một người báo người thắng hoặc hòa; đối thủ bấm **Xác nhận**.',
      'Nếu phản đối hoặc quá hạn, bot chuyển trận cho Mod. Chỉ kết quả đã xác nhận mới đổi Elo.',
      '`/leaderboard` — bảng xếp hạng Elo riêng của server.',
      '`/bxh-coin` — bảng xếp hạng Ryucoin (phú hộ) của server.',
      '`/profile` — Elo và thành tích cá nhân.',
      '`/history` — xem lịch sử đấu của mình hoặc người khác.',
      '`/hall-of-fame` — xem Bảng Vàng Top 5 các mùa giải đã qua.',
    ].join('\n'),
  };

  if (!isAdmin) return [userEmbed];

  const adminEmbed = {
    color: THEME.crimson,
    title: '🛡️ Lệnh dành cho Admin / Moderator',
    description: [
      '`/ladder setup` — Admin chọn tối đa 5 role Mod và thời gian chờ xác nhận.',
      '`/admin points-add`, `points-remove`, `points-set` — điều chỉnh điểm thủ công.',
      '`/admin log-channel` — thiết lập kênh bot tự gửi log kết quả.',
      '`/admin live-board` — thiết lập kênh bot tự cập nhật bảng xếp hạng.',
      '`/admin season-end name:...` — chốt mùa giải hiện tại, lưu top 5 vào Bảng Vàng.',
      '`/admin season-schedule name:... date:...` — tự động chốt mùa vào ngày hẹn.',
      '`/match resolve` — Mod xác nhận người thắng trận đấu khi xảy ra tranh chấp.',
    ].join('\n'),
  };

  return [userEmbed, adminEmbed];
}

function resultText(winnerId: string | undefined, match?: LadderMatch): string {
  if (!winnerId) return '🤝 Trận hòa';
  if (match) {
    const name = winnerId === match.challengerId ? match.challengerName : match.opponentName;
    return `🏆 **${name}** thắng`;
  }
  return `🏆 <@${winnerId}> thắng`;
}

function requireGuild(interaction: DiscordInteraction): string {
  if (!interaction.guild_id) throw new Error('Các lệnh này chỉ dùng trong server Discord.');
  return interaction.guild_id;
}

function requireMainGuild(interaction: DiscordInteraction): string {
  const guildId = requireGuild(interaction);
  const actor = actorUser(interaction);
  if (actor.id === '983625547076739102' || BET_ADMIN_IDS.has(actor.id)) {
    return guildId;
  }
  if (guildId !== MAIN_GUILD_ID) {
    throw new Error('🚫 Lệnh này chỉ có thể sử dụng tại **Server Chính (TGA)**!\n👉 Vui lòng tham gia server chính để sử dụng: https://discord.gg/thegioianime');
  }
  return guildId;
}

function requireChannel(interaction: DiscordInteraction): string {
  if (!interaction.channel_id) throw new Error('Không tìm thấy kênh Discord.');
  return interaction.channel_id;
}

function actorUser(interaction: DiscordInteraction): DiscordUser {
  const user = interaction.member?.user || interaction.user;
  if (!user) throw new Error('Không đọc được người dùng Discord.');
  return user;
}

function displayName(user: DiscordUser): string {
  return user.global_name || user.username;
}

function resolvedUser(interaction: DiscordInteraction, userId: string): DiscordUser {
  const user = interaction.data?.resolved?.users?.[userId];
  if (!user) throw new Error('Không đọc được thành viên đã chọn.');
  return user;
}

function optionList(interaction: DiscordInteraction): DiscordOption[] {
  const options = interaction.data?.options || [];
  const nested = options.find(option => option.type === 1 || option.type === 2);
  return nested?.options || options;
}

function subcommand(interaction: DiscordInteraction): string | undefined {
  return interaction.data?.options?.find(option => option.type === 1)?.name;
}

function rawOption(interaction: DiscordInteraction, name: string): DiscordOption | undefined {
  return optionList(interaction).find(option => option.name === name);
}

function stringOption(interaction: DiscordInteraction, name: string, required: true): string;
function stringOption(interaction: DiscordInteraction, name: string, required?: false): string | undefined;
function stringOption(interaction: DiscordInteraction, name: string, required = false): string | undefined {
  const value = rawOption(interaction, name)?.value;
  if (typeof value === 'string') return value;
  if (required) throw new Error(`Thiếu tùy chọn ${name}.`);
  return undefined;
}

function numberOption(interaction: DiscordInteraction, name: string): number | undefined {
  const value = rawOption(interaction, name)?.value;
  return typeof value === 'number' ? value : undefined;
}

function booleanOption(interaction: DiscordInteraction, name: string): boolean | undefined {
  const value = rawOption(interaction, name)?.value;
  return typeof value === 'boolean' ? value : undefined;
}

function slugifyName(name: string): string {
  const clean = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return clean.slice(0, 15) || 'player';
}

function reply(interaction: DiscordInteraction, payload: DiscordPayload, files?: DiscordFile[]) {
  return editInteractionReply(interaction.application_id, interaction.token, payload, files);
}

function acknowledge(interaction: DiscordInteraction, content: string) {
  if (interaction.type === 3) {
    return createFollowupMessage(interaction.application_id, interaction.token, { content, flags: 64, allowed_mentions: { parse: [] } }).catch(console.error);
  }
  return reply(interaction, { content, embeds: [], components: [], allowed_mentions: { parse: [] } });
}

async function handleQueue(interaction: DiscordInteraction): Promise<void> {
  const guildId = requireGuild(interaction);
  const action = interaction.data?.options?.[0]?.name;
  const actor = actorUser(interaction);

  if (action === 'leave') {
    const left = await leaveQueue(guildId, actor.id);
    await reply(interaction, {
      content: '',
      embeds: [statusEmbed(left
        ? { color: THEME.win, title: '✅ Đã rời Hàng đợi', description: 'Bạn đã hủy tìm trận và rời khỏi Hàng đợi.' }
        : { color: THEME.crimson, title: '❌ Không ở trong Hàng đợi', description: 'Bạn không ở trong Hàng đợi nào.' })],
      allowed_mentions: { parse: [] },
    });
    return;
  }

  if (action === 'join') {
    await performQueueJoin(interaction, guildId, actor);
    return;
  }
}

async function performQueueJoin(interaction: DiscordInteraction, guildId: string, actor: DiscordUser): Promise<void> {
    const currentMatch = await getOpenMatchForUser(guildId, actor.id);
    if (currentMatch) {
      await reply(interaction, {
        content: '',
        embeds: [statusEmbed({
          color: THEME.crimson,
          title: '❌ Bạn đang có trận chưa xong',
          description: `Bạn đang trong một trận đấu chưa giải quyết ở kênh <#${currentMatch.matchChannelId || currentMatch.channelId}>. Vui lòng hoàn thành trận đấu đó trước khi tìm trận mới.`,
        })],
        allowed_mentions: { parse: [] },
      });
      return;
    }

    const opponent = await joinQueue(guildId, actor.id, actor.username, interaction.channel_id || '', interaction.token);

    if (opponent) {
      const id = randomUUID();
      await createChallenge({
        id,
        guildId,
        channelId: interaction.channel_id || '',
        challengerId: opponent.userId,
        challengerName: opponent.userName,
        opponentId: actor.id,
        opponentName: actor.username,
      });

      const match = await acceptChallenge(id, actor.id);
      if (!match) throw new Error('Không thể tạo trận đấu (lỗi trạng thái).');

      const settings = await getSettings(guildId).catch(() => null);
      const p1 = slugifyName(match.challengerName);
      const p2 = slugifyName(match.opponentName);
      const matchChannelId = await createMatchChannel({
        guildId,
        sourceChannelId: interaction.channel_id || '',
        name: `rank-${p1}-vs-${p2}`,
        participantIds: [match.challengerId, match.opponentId],
        moderatorRoleIds: settings?.modRoleIds || [],
        botUserId: interaction.application_id,
        categoryId: settings?.matchCategoryId,
      });
      await startAcceptedMatch(match.id, matchChannelId);

      const [rank1, rank2, isBlacklisted1, isBlacklisted2] = await Promise.all([
        rankPosition(guildId, match.challengerId),
        rankPosition(guildId, match.opponentId),
        isUserBlacklisted(guildId, match.challengerId),
        isUserBlacklisted(guildId, match.opponentId)
      ]);

      const isRestrictedMatch = (rank1 && rank1 <= 10) || (rank2 && rank2 <= 10) || isBlacklisted1 || isBlacklisted2;
      let noticeText = 'Hai người tự tổ chức trận đấu. Khi xong, một người bấm kết quả; người còn lại phải xác nhận trước khi Elo được cập nhật.';
      if (isRestrictedMatch) {
        noticeText += '\n\n🚨 **QUY ĐỊNH ĐẶC BIỆT:** Trận đấu này bị giám sát.\n🔒 **Các nút báo cáo kết quả hiện đang bị KHÓA.**\n📸 Hãy dùng lệnh `/gui-anh [chọn file]` nộp ảnh kết quả game lên đây, bot sẽ tự động mở khóa các nút bấm!';
      }

      const controlMsg = await createMessage(matchChannelId, {
        content: `<@${match.challengerId}> <@${match.opponentId}> — Kênh chiến đấu từ hệ thống Hàng đợi (Queue) của hai bạn đã sẵn sàng.`,
        embeds: [{
          color: isRestrictedMatch ? THEME.gold : THEME.ember,
          title: '⚔️ Trận xếp hạng đã bắt đầu',
          description: noticeText,
          footer: { text: `Match ID: ${match.id}` },
        }],
        components: [resultClaimButtons(match, isRestrictedMatch)],
        allowed_mentions: { users: [match.challengerId, match.opponentId] },
      }) as { id?: string };

      if (controlMsg?.id) {
        await updateMatchControlMessageId(match.id, String(controlMsg.id));
      }

      if (isRestrictedMatch) {
        await createMessage(matchChannelId, {
          content: `📸 **HƯỚNG DẪN XÁC NHẬN KẾT QUẢ TRẬN ĐẤU**\nDo trận đấu này thuộc diện giám sát, sau khi hoàn thành, vui lòng sử dụng lệnh \`/gui-anh [chọn file]\` để tải ảnh chụp màn hình kết quả lên kênh này (Tham khảo hình mẫu kết quả hợp lệ bên dưới).\nBot sẽ tự động mở khóa các nút báo cáo kết quả sau khi bạn nộp ảnh!`,
          embeds: [{
            color: THEME.gold,
            title: '🖼️ Hình Mẫu Kết Quả Hợp Lệ (Battle Log)',
            image: { url: `https://media.discordapp.net/attachments/1521444534980972604/1539285942639263844/IMG_5788.png?ex=6a85c33f&is=6a8471bf&hm=250e3e86a3af90ce1f160b316698a8df42ae32dc76f010dfddd862ffb4bf19b6&=&format=webp&quality=lossless&width=1280&height=592` }
          }],
          allowed_mentions: { parse: [] }
        });
      }

      if (opponent.interactionToken) {
        await editInteractionReply(interaction.application_id, opponent.interactionToken, {
          content: '',
          embeds: [statusEmbed({
            color: THEME.win,
            title: '✅ Đã ghép trận thành công!',
            description: `Hãy vào kênh <#${matchChannelId}> để thi đấu.`,
          })],
          components: [],
          allowed_mentions: { parse: [] },
        }).catch(console.error);
      }

      await createMessage(interaction.channel_id || '', {
        content: `<@${opponent.userId}> <@${actor.id}>`,
        embeds: [statusEmbed({
          color: THEME.win,
          title: '🎉 Đã tìm thấy đối thủ!',
          description: `<@${opponent.userId}> ⚔️ <@${actor.id}>\nHãy vào kênh <#${matchChannelId}> để thi đấu nhé!`,
        })],
        allowed_mentions: { users: [opponent.userId, actor.id] },
      });

      await reply(interaction, {
        content: '',
        embeds: [statusEmbed({
          color: THEME.win,
          title: '✅ Đã ghép trận thành công!',
          description: `Hãy vào kênh <#${matchChannelId}> để thi đấu.`,
        })],
        allowed_mentions: { parse: [] },
      });

    } else {
      const joinTimestamp = Math.floor(Date.now() / 1000);
      await reply(interaction, {
        content: '',
        embeds: [statusEmbed({
          color: THEME.ember,
          title: '⏳ Đang tìm kiếm đối thủ...',
          description: `Bắt đầu chờ: <t:${joinTimestamp}:R>`,
        })],
        allowed_mentions: { parse: [] },
        components: [
          {
            type: 1,
            components: [
              {
                type: 2,
                custom_id: 'queue_leave',
                label: 'Hủy tìm trận',
                emoji: { name: '✖️' },
                style: 2
              }
            ]
          }
        ]
      });
    }
}

async function editSource(interaction: DiscordInteraction, payload: DiscordPayload) {
  if (interaction.token && interaction.application_id) {
    try {
      return await editInteractionReply(interaction.application_id, interaction.token, payload);
    } catch (e) {
      console.error('editInteractionReply failed in editSource:', e);
    }
  }
  if (interaction.message?.id && interaction.channel_id) {
    return await editChannelMessage(interaction.channel_id, interaction.message.id, payload);
  }
  return await reply(interaction, payload);
}

async function handleSay(interaction: DiscordInteraction): Promise<void> {
  const message = stringOption(interaction, 'message', true);
  const targetChannelId = rawOption(interaction, 'channel')?.value as string;
  const targetUserId = rawOption(interaction, 'user')?.value as string;
  const targetRoleId = rawOption(interaction, 'role')?.value as string;
  const style = (rawOption(interaction, 'kieu')?.value as string) || 'msg';

  // Ảnh đính kèm (nếu có): tải về rồi gửi lại dưới dạng tệp gốc cho tự nhiên.
  const attachmentId = rawOption(interaction, 'image')?.value as string | undefined;
  const attachment = attachmentId
    ? (interaction.data?.resolved?.attachments as Record<string, { url: string; filename?: string; content_type?: string }> | undefined)?.[attachmentId]
    : undefined;

  const formattedMessage = message.replace(/\\n/g, '\n');

  try {
    let destChannelId: string | undefined = targetChannelId || interaction.channel_id;
    let isDM = false;
    let targetName = '';

    if (targetUserId) {
      // Chỉ gửi DM khi người dùng chọn tùy chọn user
      const dmChannel = await createDMChannel(targetUserId);
      destChannelId = dmChannel.id;
      isDM = true;
      targetName = `<@${targetUserId}>`;
    }

    if (!destChannelId) {
      await reply(interaction, { content: '❌ Không xác định được kênh đích.', flags: 64, allowed_mentions: { parse: [] } });
      return;
    }

    // Chuẩn bị ảnh: ưu tiên tải về đính kèm dạng tệp, nếu lỗi thì dùng thẳng URL CDN.
    let files: { name: string; data: Buffer; contentType?: string }[] | undefined;
    let embedImageUrl: string | undefined;
    if (attachment?.url) {
      const safeName = (attachment.filename || 'image.png').replace(/[^\w.\-]/g, '_');
      try {
        const res = await fetch(attachment.url);
        const buf = Buffer.from(await res.arrayBuffer());
        files = [{ name: safeName, data: buf, contentType: attachment.content_type }];
        embedImageUrl = `attachment://${safeName}`;
      } catch (e) {
        console.error('Không tải được ảnh đính kèm cho /say, dùng URL trực tiếp:', e);
        embedImageUrl = attachment.url;
      }
    }

    if (style === 'thongbao') {
      // Kiểu THÔNG BÁO: bọc nội dung vào embed cho đỡ đơn điệu.
      // Mention (@everyone/@role/@user) đưa vào content để VẪN ping được (mention trong embed không ping).
      const mentionTokens = formattedMessage.match(/<@!?\d+>|<@&\d+>|@everyone|@here/g) || [];
      const pings: string[] = [...new Set(mentionTokens)];
      if (targetRoleId && !pings.includes(`<@&${targetRoleId}>`)) {
        pings.push(`<@&${targetRoleId}>`);
      }
      const pingContent = pings.join(' ');

      const embed: Record<string, unknown> = {
        color: THEME.ember,
        title: '📢 THÔNG BÁO',
        description: `${RULE}\n${formattedMessage}`,
        footer: { text: 'Ryusei Bot' },
        timestamp: new Date().toISOString(),
      };
      if (embedImageUrl) embed.image = { url: embedImageUrl };

      await createMessage(destChannelId, {
        content: pingContent || undefined,
        embeds: [embed],
        allowed_mentions: { parse: ['users', 'roles', 'everyone'] },
      }, files);
    } else {
      // Kiểu tin nhắn thường: text trần, ảnh đính kèm dạng tệp gốc.
      let contentStr = formattedMessage;
      if (targetRoleId && !contentStr.includes(`<@&${targetRoleId}>`)) {
        contentStr = `<@&${targetRoleId}> ${contentStr}`;
      }
      const payload: DiscordPayload = {
        content: contentStr,
        allowed_mentions: { parse: ['users', 'roles', 'everyone'] },
      };
      // Nếu không tải được tệp mà chỉ có URL, nhúng ảnh qua embed tối giản để vẫn hiển thị.
      if (!files && embedImageUrl) payload.embeds = [{ color: THEME.ember, image: { url: embedImageUrl } }];
      await createMessage(destChannelId, payload, files);
    }

    const successContent = isDM
      ? `✅ Đã gửi tin nhắn riêng (DM) tới ${targetName}.`
      : `✅ Đã gửi tin nhắn vào <#${destChannelId}>.`;

    await reply(interaction, { content: successContent, flags: 64, allowed_mentions: { parse: [] } });
  } catch (err) {
    console.error('Lỗi khi gửi say:', err);
    const msg = err instanceof Error ? err.message : String(err);
    let detail = msg;
    if (msg.includes('Missing Access') || msg.includes('Cannot send messages to this user')) {
      detail = 'Bot không thể gửi tin nhắn (người dùng tắt DM từ Bot / chặn DM, hoặc Bot thiếu quyền trong kênh).';
    }
    await reply(interaction, { content: `❌ Gặp lỗi khi gửi: ${detail}`, flags: 64, allowed_mentions: { parse: [] } });
  }
}

async function handleSelfDestruct(interaction: DiscordInteraction): Promise<void> {
  const actor = actorUser(interaction);
  const embed = {
    color: THEME.crimson,
    title: '🚨 CẢNH BÁO: KÍCH HOẠT GIAO THỨC TỰ HỦY BOT! 🚨',
    description: `⚠️ <@${actor.id}> vừa khởi chạy lệnh **TỰ HỦY TOÀN BỘ HỆ THỐNG RYUSEI BOT**!\n\n` +
      `💥 **Hậu quả thảm khốc:**\n` +
      `• Xóa sạch 100% dữ liệu Elo & Bảng Xếp Hạng\n` +
      `• Thiêu rụi toàn bộ ví xu Ryucoin của tất cả thành viên\n` +
      `• Phá hủy dữ liệu lịch sử đấu không thể phục hồi\n\n` +
      `🔥 *Bạn có muốn thực hiện vụ nổ này không?*`,
    image: { url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3ZpdXJzMGVsdmV0dmpiaXR4MnR5cGpmZWpycDVsdXlzazRxeWZyNiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/oe33xf3B50fsc/giphy.gif' },
    footer: { text: 'Giao thức tự hủy Ryusei Bot • KHÔNG THỂ HOÀN TÁC' },
    timestamp: new Date().toISOString(),
  };

  const components = [{
    type: 1,
    components: [
      { type: 2, custom_id: `self_destruct_confirm_${actor.id}`, label: '🔴 NỔ LUÔN ĐI (Xóa Hết)', style: 4 },
      { type: 2, custom_id: `self_destruct_abort_${actor.id}`, label: '🟩 HỦY LỆNH (Cứu Server)', style: 3 },
    ],
  }];

  await reply(interaction, {
    embeds: [embed],
    components,
    allowed_mentions: { parse: [] },
  });
}

async function handleQrCommand(interaction: DiscordInteraction): Promise<void> {
  const qrImage = `https://img.vietqr.io/image/MB-0828006916-compact2.png?addInfo=${encodeURIComponent('Ung ho Ryusei Bot')}`;
  const embed = {
    color: THEME.gold,
    author: { name: 'RYUSEI · DONATE' },
    title: '🌠 Ủng hộ & đồng hành cùng Ryusei Bot',
    description:
      `Cảm ơn bạn đã yêu quý **Ryusei Bot** ❤️\n` +
      `Mỗi lượt ủng hộ giúp mình *nuôi máy chủ* và *phát triển thêm tính năng mới*.\n` +
      `${RULE}\n` +
      `📱 Mở app ngân hàng **bất kỳ** → quét mã **VietQR** bên dưới.\n` +
      `✍️ Nội dung chuyển khoản đã được điền sẵn — bạn chỉ cần bấm gửi!`,
    fields: [
      { name: '🏦 Ngân hàng', value: 'MBBank (MB)', inline: true },
      { name: '💳 Số tài khoản', value: '`0828006916`', inline: true },
      { name: '📝 Nội dung CK', value: '`Ung ho Ryusei Bot`', inline: true },
    ],
    image: { url: qrImage },
    footer: { text: '🌠 Ryusei Bot · Cảm ơn sự ủng hộ của bạn' },
    timestamp: new Date().toISOString(),
  };

  await reply(interaction, {
    embeds: [embed],
    allowed_mentions: { parse: [] },
  });
}

async function handleAddRyucoin(interaction: DiscordInteraction): Promise<void> {
  const actor = actorUser(interaction);
  const allowedUserIds = new Set(['983625547076739102', '873563860991365141', '1020702407719661670']);
  if (!allowedUserIds.has(actor.id)) {
    await reply(interaction, { content: '🚫 Bạn không có quyền thần thánh này!', flags: 64 });
    return;
  }
  const targetId = stringOption(interaction, 'user');
  const amount = interaction.data?.options?.find(o => o.name === 'amount')?.value as number;
  if (!targetId || !amount) return;
  const guildId = requireMainGuild(interaction);
  await addRyucoin(guildId, targetId, amount);
  await reply(interaction, {
    content: `<@${targetId}>`,
    embeds: [statusEmbed({
      color: THEME.gold,
      title: '🪙 Đã cộng Ryucoin',
      description: `Đã bơm **${amount} 🪙 Ryucoin** cho <@${targetId}>! 💸`,
    })],
    allowed_mentions: { users: [targetId] },
  });
}

async function handleRemoveRyucoin(interaction: DiscordInteraction): Promise<void> {
  const actor = actorUser(interaction);
  const allowedUserIds = new Set(['983625547076739102', '873563860991365141', '1020702407719661670']);
  if (!allowedUserIds.has(actor.id)) {
    await reply(interaction, { content: '🚫 Bạn không có quyền thần thánh này!', flags: 64 });
    return;
  }
  const targetId = stringOption(interaction, 'user');
  const amount = interaction.data?.options?.find(o => o.name === 'amount')?.value as number;
  if (!targetId || !amount) return;
  const guildId = requireMainGuild(interaction);
  const deductAmount = -Math.abs(amount);
  await addRyucoin(guildId, targetId, deductAmount);
  await reply(interaction, {
    content: `<@${targetId}>`,
    embeds: [statusEmbed({
      color: THEME.crimson,
      title: '🪙 Đã trừ Ryucoin',
      description: `Đã trừ **${Math.abs(amount)} 🪙 Ryucoin** của <@${targetId}>! 📉`,
    })],
    allowed_mentions: { users: [targetId] },
  });
}

async function handleGive(interaction: DiscordInteraction): Promise<void> {
  const guildId = requireGuild(interaction);
  const actor = actorUser(interaction);
  const targetUser = resolvedUser(interaction, stringOption(interaction, 'user', true));
  const amount = numberOption(interaction, 'amount');

  if (!amount || amount < 20 || !Number.isInteger(amount)) {
    await reply(interaction, { content: '❌ Số Ryucoin chuyển phải là một số nguyên tối thiểu từ **20 🪙** trở lên.', flags: 64 });
    return;
  }

  if (targetUser.bot) {
    await reply(interaction, { content: '❌ Không thể chuyển Ryucoin cho Bot.', flags: 64 });
    return;
  }

  if (targetUser.id === actor.id) {
    await reply(interaction, { content: '❌ Bạn không thể tự chuyển Ryucoin cho chính mình.', flags: 64 });
    return;
  }

  const result = await transferRyucoin({
    guildId,
    senderId: actor.id,
    senderName: displayName(actor),
    recipientId: targetUser.id,
    recipientName: displayName(targetUser),
    amount,
  });

  const taxText = result.tax > 0 ? ` (Thuế 5%: **${result.tax} 🪙**)` : '';
  await checkEconomyAchievements(guildId, actor.id).catch(console.error);
  await checkEconomyAchievements(guildId, targetUser.id).catch(console.error);

  await reply(interaction, {
    embeds: [{
      color: THEME.win,
      title: '💸 Giao Dịch Chuyển Ryucoin Thành Công!',
      description: `<@${actor.id}> vừa chuyển **${result.receivedAmount} 🪙 Ryucoin** cho <@${targetUser.id}>!${taxText}`,
      fields: [
        { name: '📤 Người gửi', value: `<@${actor.id}>\nSố dư: **${result.senderNewBalance} 🪙**`, inline: true },
        { name: '📥 Người nhận', value: `<@${targetUser.id}>\nSố dư: **${result.recipientNewBalance} 🪙**`, inline: true },
      ],
      footer: { text: 'Ryusei VGC Economy • Thuế giao dịch 5%' },
      timestamp: new Date().toISOString(),
    }],
    allowed_mentions: { parse: ['users'] },
  });
}


async function handleSetBackground(interaction: DiscordInteraction): Promise<void> {
  const actor = actorUser(interaction);
  const bankManagerIds = new Set(['983625547076739102', '873563860991365141']);
  if (!bankManagerIds.has(actor.id)) {
    await reply(interaction, { content: '🚫 Bạn không có quyền sử dụng lệnh này! Chỉ 2 Quản lý Ngân hàng Admin mới có quyền cài đặt background.', flags: 64 });
    return;
  }

  const targetId = stringOption(interaction, 'user');
  if (!targetId) {
    await reply(interaction, { content: '❌ Vui lòng chọn người chơi cần set background.', flags: 64 });
    return;
  }

  let imageUrl = stringOption(interaction, 'image_url') || '';
  if (!imageUrl && interaction.data?.options) {
    const fileOpt = interaction.data.options.find(o => o.name === 'image_file');
    if (fileOpt && fileOpt.value) {
      const attachmentId = String(fileOpt.value);
      const attachment = interaction.data.resolved?.attachments?.[attachmentId];
      if (attachment?.url) {
        imageUrl = attachment.url;
      }
    }
  }

  if (!imageUrl) {
    await reply(interaction, { content: '❌ Vui lòng cung cấp link ảnh (`image_url`) hoặc tải tệp ảnh lên (`image_file`).', flags: 64 });
    return;
  }

  if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
    await reply(interaction, { content: '❌ Link ảnh không hợp lệ! Vui lòng cung cấp URL HTTP/HTTPS trực tiếp.', flags: 64 });
    return;
  }

  // Tải dữ liệu ảnh và lưu trực tiếp vào Neon PostgreSQL để tránh link Discord CDN bị hết hạn sau 24h
  let base64Data = '';
  let contentType = 'image/png';
  try {
    const imageRes = await fetch(imageUrl);
    if (!imageRes.ok) {
      await reply(interaction, { content: `❌ Không thể tải ảnh từ URL/File đã chọn (HTTP ${imageRes.status}).`, flags: 64 });
      return;
    }
    contentType = imageRes.headers.get('content-type') || 'image/png';
    const arrayBuffer = await imageRes.arrayBuffer();
    if (arrayBuffer.byteLength > 8 * 1024 * 1024) {
      await reply(interaction, { content: '❌ Kích thước tệp ảnh quá lớn! Vui lòng chọn ảnh dưới 8MB.', flags: 64 });
      return;
    }
    base64Data = Buffer.from(arrayBuffer).toString('base64');
  } catch (err: any) {
    await reply(interaction, { content: `❌ Lỗi khi tải dữ liệu ảnh: ${err?.message || err}`, flags: 64 });
    return;
  }

  await saveCustomBackground(targetId, base64Data, contentType);

  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

  const persistentBgUrl = `${vercelUrl}/api/bg/${targetId}?t=${Date.now()}`;

  const guildId = requireGuild(interaction);
  await setUserBackground(guildId, targetId, persistentBgUrl);

  let bgFiles: DiscordFile[] | undefined;
  if (base64Data) {
    try {
      const ext = contentType.includes('jpeg') || contentType.includes('jpg') ? 'jpg' : 'png';
      bgFiles = [{
        name: `background.${ext}`,
        data: Buffer.from(base64Data, 'base64'),
        contentType,
      }];
    } catch { }
  }

  await reply(interaction, {
    content: `✅ **Đã cài đặt Custom Background vĩnh viễn thành công cho <@${targetId}>!**\n🖼️ Ảnh đã được lưu trực tiếp vào DB (không lo hết hạn link Discord sau 1 ngày).`,
    embeds: [
      {
        title: '🖼️ Custom Background Profile Preview',
        description: `Hình nền Profile mới của <@${targetId}>:`,
        image: { url: bgFiles?.[0] ? `attachment://${bgFiles[0].name}` : persistentBgUrl },
        color: THEME.win,
        timestamp: new Date().toISOString(),
      }
    ],
    allowed_mentions: { users: [targetId] }
  }, bgFiles);
}

async function createShopTicketChannel(input: {
  interaction: DiscordInteraction;
  ticketType: 'Profile' | 'Shiny' | 'Role' | 'SellShiny';
  itemName: string;
  cost: number;
  imageUrl?: string;
  targetUser?: { id: string; username: string };
}): Promise<string> {
  const { interaction, ticketType, itemName, cost, imageUrl, targetUser } = input;
  const guildId = requireGuild(interaction);
  const actor = targetUser || actorUser(interaction);

  let adminIds: string[] = [];
  switch (ticketType) {
    case 'Profile':
      adminIds = ['983625547076739102', '873563860991365141']; // 👈 Điền ID Admin phụ trách Profile
      break;
    case 'Shiny':
    case 'SellShiny':
      adminIds = ['983625547076739102', '873563860991365141', '964130916547067904']; // 👈 Điền ID Admin phụ trách Shiny
      break;
    case 'Role':
      adminIds = ['983625547076739102', '873563860991365141']; // 👈 Điền ID Admin phụ trách Role
      break;
    default:
      adminIds = ['983625547076739102', '873563860991365141']; // ID dự phòng
      break;
  }

  const cleanUsername = actor.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15) || 'user';
  let channelName = `ticket-shiny-${cleanUsername}`;
  if (ticketType === 'Profile') channelName = `ticket-profile-${cleanUsername}`;
  else if (ticketType === 'Role') channelName = `ticket-role-${cleanUsername}`;
  else if (ticketType === 'SellShiny') channelName = `ticket-sell-shiny-${cleanUsername}`;

  const participantIds = [actor.id];
  for (const adminId of adminIds) {
    if (adminId && !participantIds.includes(adminId)) {
      participantIds.push(adminId);
    }
  }

  const settings = await getSettings(guildId).catch(() => null);
  const channelId = await createMatchChannel({
    guildId,
    sourceChannelId: interaction.channel_id || '',
    name: channelName,
    participantIds,
    moderatorRoleIds: [],
    botUserId: interaction.application_id,
    categoryId: settings?.matchCategoryId,
  });

  const allTagIds = [actor.id, ...adminIds].filter((id, index, self) => self.indexOf(id) === index);
  const pingStr = `🎫 ` + allTagIds.map(id => `<@${id}>`).join(' ');

  let embedTitle = '✨ TICKET MUA POKÉMON SHINY';
  let embedDesc = `**Người mua:** <@${actor.id}> (${actor.username})\n**Sản phẩm:** **${itemName}**\n**Số xu trừ:** **-${cost} 🪙 Ryucoin** (Đã tự động thanh toán & nạp Quỹ Ngân Hàng)\n**Trạng thái:** ✅ Đã thanh toán **${cost} 🪙** thành công!\n\n💬 Vui lòng trao đổi trực tiếp với Mod/Admin trong kênh này để chọn nhận Pokémon Shiny!`;
  let color: number = THEME.gold;

  if (ticketType === 'Profile') {
    embedTitle = '🖼️ TICKET CUSTOM PROFILE';
    embedDesc = `**Người mua:** <@${actor.id}> (${actor.username})\n**Dịch vụ:** Custom Profile Tuỳ Chỉnh\n**Số xu trừ:** **-${cost} 🪙 Ryucoin** (Đã tự động thanh toán & nạp Quỹ Ngân Hàng)\n**Trạng thái:** ⏳ Đang chờ người dùng gửi ảnh & Admin cài đặt!\n\n💬 **Hướng dẫn:**\n1. User hãy gửi **link ảnh (URL)** hoặc **tải tệp ảnh** muốn cài làm Profile vào kênh này.\n2. Admin dùng lệnh \`/set-(background hoặc thumbnail) + user:<@${actor.id}> + image_url:<link_ảnh>\` để cài đặt profile cho user!\n3. Sau khi cài xong, Admin bấm **🔒 Đóng Ticket**.`;
    color = THEME.ember;
  } else if (ticketType === 'Role') {
    embedTitle = '🎖️ TICKET MUA ROLE 15 NGÀY';
    embedDesc = `**Người mua:** <@${actor.id}> (${actor.username})\n**Sản phẩm:** **${itemName}**\n**Số xu trừ:** **-${cost} 🪙 Ryucoin** (Đã nạp Quỹ Ngân Hàng)\n**Trạng thái:** ✅ Đã thanh toán 125 🪙!\n\n💬 Vui lòng chờ Mod/Admin kiểm tra và cấp Role 15 ngày cho bạn.`;
    color = THEME.crimson;
  } else if (ticketType === 'SellShiny') {
    embedTitle = '✨ TICKET NHẬN POKÉMON SHINY';
    embedDesc = `**Người mua / Trúng giải:** <@${actor.id}> (${actor.username})\n**Sản phẩm:** **${itemName}**\n**Trạng thái:** ✅ Đã thanh toán **${cost.toLocaleString()} 🪙** thành công!\n\n💬 Vui lòng trao đổi trực tiếp với Mod/Admin trong kênh này để nhận Pokémon Shiny của bạn!`;
    color = THEME.gold;
  }

  const ticketEmbed: Record<string, unknown> = {
    title: embedTitle,
    description: embedDesc,
    color,
    footer: { text: `Ticket ID: ${channelId} • Đã ping Mod/Admin` },
    timestamp: new Date().toISOString(),
  };
  if (imageUrl) ticketEmbed.image = { url: imageUrl };

  const components = [
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 4,
          label: '🔒 Đóng Ticket',
          custom_id: `ticket_close_${channelId}`,
        }
      ]
    }
  ];

  await createMessage(channelId, {
    content: pingStr,
    embeds: [ticketEmbed],
    components,
  });

  return channelId;
}

function buildNicknameModalData(interaction: DiscordInteraction) {
  const actor = actorUser(interaction);
  return {
    type: 9,
    data: {
      title: '🏷️ Đổi Nickname Server (80 🪙)',
      custom_id: `modal_shop_nickname_${actor.id}`,
      components: [
        {
          type: 1,
          components: [
            {
              type: 4,
              custom_id: 'input_new_nickname',
              label: 'Nhập Nickname mới hiển thị trên Server:',
              style: 1,
              min_length: 1,
              max_length: 32,
              placeholder: 'Ví dụ: VGC Champion Kyogre',
              required: true,
            }
          ]
        }
      ]
    }
  };
}

function buildGaQuestionModalData(interaction: DiscordInteraction) {
  const customId = interaction.data?.custom_id || '';
  const giveawayId = customId.slice('ga_question_btn_'.length);
  return {
    type: 9,
    data: {
      title: '❓ Trả lời Giveaway',
      custom_id: `ga_question_modal_${giveawayId}`,
      components: [
        {
          type: 1,
          components: [
            {
              type: 4,
              custom_id: 'answer_input',
              label: 'Nhập câu trả lời của bạn:',
              style: 1,
              min_length: 1,
              max_length: 100,
              placeholder: 'Đáp án của bạn...',
              required: true,
            }
          ]
        }
      ]
    }
  };
}

function buildSellShinyStockModalData(interaction: DiscordInteraction) {
  const customId = interaction.data?.custom_id || '';
  const listingId = customId.slice('sell_shiny_stock_btn_'.length);
  return {
    type: 9,
    data: {
      title: '📦 Cập nhật Stock Pokémon Shiny',
      custom_id: `modal_sell_shiny_stock_${listingId}`,
      components: [
        {
          type: 1,
          components: [
            {
              type: 4,
              custom_id: 'stock_input',
              label: 'Số lượng stock mới (còn lại):',
              style: 1,
              min_length: 1,
              max_length: 6,
              placeholder: 'Nhập số lượng stock (Ví dụ: 5)',
              required: true,
            }
          ]
        }
      ]
    }
  };
}

async function handleModalSubmit(interaction: DiscordInteraction): Promise<void> {
  const customId = interaction.data?.custom_id || '';

  if (customId.startsWith('modal_sell_shiny_stock_')) {
    const listingId = customId.slice('modal_sell_shiny_stock_'.length);
    const actor = actorUser(interaction);
    const listing = await getSellShinyListing(listingId);

    if (!listing) {
      await reply(interaction, {
        content: '❌ Sản phẩm này không còn tồn tại trên hệ thống.',
        flags: 64,
      });
      return;
    }

    if (actor.id !== listing.sellerId && actor.id !== SUPER_ADMIN_ID && actor.id !== '983625547076739102') {
      await reply(interaction, {
        content: '❌ Chỉ người bán mới có quyền cập nhật stock cho sản phẩm này.',
        flags: 64,
      });
      return;
    }

    const components = (interaction.data as any)?.components || [];
    let stockValStr = '';
    for (const row of components) {
      for (const comp of row.components || []) {
        if (comp.custom_id === 'stock_input') {
          stockValStr = comp.value || '';
        }
      }
    }

    const newStock = parseInt(stockValStr.trim(), 10);
    if (isNaN(newStock) || newStock < 0) {
      await reply(interaction, {
        content: '❌ Số lượng stock phải là một số nguyên không âm.',
        flags: 64,
      });
      return;
    }

    const updated = await updateSellShinyStock(listingId, newStock);
    if (!updated) {
      await reply(interaction, {
        content: '❌ Không thể cập nhật stock cho sản phẩm này.',
        flags: 64,
      });
      return;
    }

    const remainingStock = updated.totalSlots - updated.soldSlots;
    const messageId = updated.messageId;
    const channelId = updated.channelId;

    if (channelId && messageId) {
      if (remainingStock > 0) {
        const embed: Record<string, unknown> = {
          color: THEME.ember,
          title: `✨ POKÉMON SHINY ĐANG BÁN!`,
          description: `🏷️ **Tên Pokémon:** **${updated.itemName}**\n💰 **Giá:** **${updated.price.toLocaleString()} 🪙 Ryucoin**\n📦 **Stock:** **${remainingStock} / ${updated.totalSlots}**\n\n🟢 **Trạng thái:** Còn lại **${remainingStock}** sản phẩm.\n\n👇 Bấm nút **[🛒 Mua Ngay]** bên dưới để sở hữu Pokémon Shiny này!`,
          fields: [
            { name: '👤 Người bán', value: `<@${updated.sellerId}>`, inline: true },
            { name: '🪙 Giá bán', value: `**${updated.price.toLocaleString()} 🪙**`, inline: true },
          ],
          footer: { text: `Sử dụng Ryucoin để mua • Người bấm nhanh nhất & đủ tiền sẽ sở hữu` },
          timestamp: new Date(updated.createdAt).toISOString(),
        };
        if (updated.imageUrl) embed.image = { url: updated.imageUrl };

        await editChannelMessage(channelId, messageId, {
          embeds: [embed],
          components: [
            {
              type: 1,
              components: [
                {
                  type: 2,
                  style: 3,
                  custom_id: `sell_shiny_buy_${updated.id}`,
                  label: `🛒 Mua Ngay (${updated.price.toLocaleString()} 🪙)`,
                },
              ],
            },
          ],
        }).catch(console.error);
      } else {
        const embed: Record<string, unknown> = {
          color: THEME.win,
          title: `✨ POKÉMON SHINY ĐÃ HẾT HÀNG!`,
          description: `🎉 **${updated.itemName}** đã được bán hết!\n💰 **Giá:** **${updated.price.toLocaleString()} 🪙 Ryucoin**\n📦 **Stock:** **0 / ${updated.totalSlots} (Đã hết hàng)**\n\n🔴 **Trạng thái:** Đã bán hết toàn bộ stock.`,
          fields: [
            { name: '👤 Người bán', value: `<@${updated.sellerId}>`, inline: true },
            { name: '🪙 Giá bán', value: `**${updated.price.toLocaleString()} 🪙**`, inline: true },
          ],
          footer: { text: `Giao dịch hoàn tất` },
          timestamp: new Date().toISOString(),
        };
        if (updated.imageUrl) embed.image = { url: updated.imageUrl };

        await editChannelMessage(channelId, messageId, {
          embeds: [embed],
          components: [
            {
              type: 1,
              components: [
                {
                  type: 2,
                  style: 2,
                  custom_id: `sell_shiny_sold_${updated.id}`,
                  label: `🛒 Mua Ngay (Hết hàng)`,
                  disabled: true,
                },
              ],
            },
          ],
        }).catch(console.error);
      }
    }

    await reply(interaction, {
      content: `✅ Đã cập nhật stock cho **${updated.itemName}** thành công! Tồn kho hiện tại: **${remainingStock}** sản phẩm.`,
      flags: 64,
    });
    return;
  }

  if (customId.startsWith('form_submit')) {
    await handleFormModalSubmit(interaction);
    return;
  }

  if (customId.startsWith('ga_question_modal_')) {
    const giveawayId = customId.slice('ga_question_modal_'.length);
    const actor = actorUser(interaction);

    const firstRow = interaction.data?.components?.[0] as any;
    const inputComponent = firstRow?.components?.[0] as any;
    const userAnswer = (inputComponent?.value as string || '').trim();

    if (!userAnswer) {
      await editInteractionReply(interaction.application_id, interaction.token, {
        content: '❌ Bạn chưa nhập câu trả lời.',
        allowed_mentions: { parse: [] },
      });
      return;
    }

    const giveaway = await getGiveaway(giveawayId);
    if (!giveaway) {
      await editInteractionReply(interaction.application_id, interaction.token, {
        content: '❌ Không tìm thấy thông tin Giveaway này.',
        allowed_mentions: { parse: [] },
      });
      return;
    }

    if (giveaway.claimedBy) {
      await editInteractionReply(interaction.application_id, interaction.token, {
        content: `😢 Trễ rồi! **${giveaway.claimedByName || 'Người khác'}** đã trả lời đúng và nhận phần quà trước bạn rồi!`,
        allowed_mentions: { parse: [] },
      });
      return;
    }

    const cleanUser = userAnswer.toLowerCase().trim();
    const cleanCorrect = (giveaway.answer || '').toLowerCase().trim();

    if (cleanUser !== cleanCorrect) {
      await editInteractionReply(interaction.application_id, interaction.token, {
        content: `❌ Câu trả lời **"${userAnswer}"** chưa chính xác! Hãy thử lại nhé. 💡`,
        allowed_mentions: { parse: [] },
      });
      return;
    }

    const result = await claimGiveaway(giveawayId, actor.id, displayName(actor));
    if (result.claimed) {
      await editInteractionReply(interaction.application_id, interaction.token, {
        content: `🎉 **CHÍNH XÁC!** Bạn là người đầu tiên trả lời đúng câu hỏi và đã giành được phần quà! 🏆`,
        allowed_mentions: { parse: [] },
      });

      let winnerDesc =
        `❓ **Câu hỏi:** ${giveaway.question}\n` +
        `✅ **Đáp án đúng:** **${giveaway.answer}**\n\n` +
        `🏆 **Người thắng:** <@${actor.id}> (${displayName(actor)})\n`;
      if (giveaway.reward && giveaway.reward.trim()) {
        winnerDesc += `🎁 **Phần quà:** **${giveaway.reward.trim()}**\n\n`;
      } else {
        winnerDesc += `\n`;
      }
      winnerDesc += `Hãy gửi ảnh chụp GTS qua kênh <#1527217614441549905> để nhận thưởng.`;

      const embed: Record<string, unknown> = {
        color: THEME.gold,
        title: '✨ Kết Quả Giveaway Câu Hỏi',
        description: winnerDesc,
        footer: { text: 'Cảm ơn mọi người đã tham gia! 🍀' },
      };
      if (giveaway.imageUrl) embed.image = { url: giveaway.imageUrl };

      // 1. Gửi tin nhắn MỚI vào kênh để công bố kết quả
      const targetChannelId = giveaway.channelId || interaction.channel_id;
      if (targetChannelId) {
        await createMessage(targetChannelId, {
          content: `🎉 **<@${actor.id}> đã trả lời chính xác câu hỏi và giành chiến thắng Giveaway!** Xin chúc mừng! ✨`,
          embeds: [embed],
          allowed_mentions: { users: [actor.id] },
        }).catch(console.error);
      }

      // 2. Khóa nút bấm ở tin nhắn cũ
      if (giveaway.channelId && giveaway.messageId) {
        await editChannelMessage(giveaway.channelId, giveaway.messageId, {
          components: [
            {
              type: 1,
              components: [
                {
                  type: 2,
                  style: 2,
                  custom_id: 'ga_question_done',
                  label: `✅ Đã có người trả lời đúng (${displayName(actor)})`,
                  disabled: true,
                },
              ],
            },
          ],
        }).catch(console.error);
      }
    } else {
      await editInteractionReply(interaction.application_id, interaction.token, {
        content: `😢 Câu trả lời của bạn đúng nhưng **${result.claimedByName || 'người khác'}** đã gửi trước bạn tích tắc!`,
        allowed_mentions: { parse: [] },
      });
    }
    return;
  }

  if (customId.startsWith('modal_shop_nickname_')) {
    const userId = customId.split('_')[3];
    const actor = actorUser(interaction);
    if (actor.id !== userId) {
      await editInteractionReply(interaction.application_id, interaction.token, {
        content: '🚫 Đây không phải là phiên làm việc của bạn!',
        allowed_mentions: { parse: [] },
      });
      return;
    }

    const guildId = requireGuild(interaction);
    const rating = await getRating(guildId, actor.id);
    const cost = 80;

    if (rating.ryucoin < cost) {
      await editInteractionReply(interaction.application_id, interaction.token, {
        content: `❌ Bạn không đủ Ryucoin! Hiện có **${rating.ryucoin} 🪙**, cần **${cost} 🪙** để đổi Nickname.`,
        allowed_mentions: { parse: [] },
      });
      return;
    }

    const firstRow = interaction.data?.components?.[0] as any;
    const inputComponent = firstRow?.components?.[0] as any;
    const newNickname = (inputComponent?.value as string || '').trim();

    if (!newNickname || newNickname.length > 32) {
      await editInteractionReply(interaction.application_id, interaction.token, {
        content: '❌ Nickname không hợp lệ (độ dài từ 1 đến 32 ký tự).',
        allowed_mentions: { parse: [] },
      });
      return;
    }

    try {
      await addRyucoin(guildId, actor.id, -cost);
      await depositToBank(guildId, cost).catch(err => console.error('Lỗi nạp doanh thu nickname vào bank:', err));
      await checkEconomyAchievements(guildId, actor.id).catch(console.error);
      await updateUserName(guildId, actor.id, newNickname).catch(() => null);

      let nickSuccess = true;
      try {
        await modifyGuildMemberNickname(guildId, actor.id, newNickname);
      } catch (err) {
        console.error('Không đổi được nickname trên Discord:', err);
        nickSuccess = false;
      }

      const nickMsg = nickSuccess
        ? `🎉 **Đã đổi Nickname Server thành công!** (-80 🪙 Ryucoin)\nNickname mới của bạn: **${newNickname}**`
        : `🎉 **Đã đổi Nickname thành công trên hệ thống Ryusei VGC!** (-80 🪙 Ryucoin)\nNickname mới: **${newNickname}**\n*(Lưu ý: Do vai trò/quyền Hạn trên Server, Nickname trên Discord chưa đổi tự động được, bạn có thể tự đổi thủ công trên Server nhé).*`;

      await editInteractionReply(interaction.application_id, interaction.token, {
        content: nickMsg,
        allowed_mentions: { parse: [] },
      });
    } catch (err: any) {
      console.error('Lỗi khi đổi nickname shop:', err);
      await editInteractionReply(interaction.application_id, interaction.token, {
        content: `❌ Lỗi khi xử lý giao dịch: ${err.message}`,
        allowed_mentions: { parse: [] },
      });
    }
    return;
  }

  // ---- BET: xử lý modal nhập số coin ----
  if (customId.startsWith('bet_amount_')) {
    // Format: bet_amount_{betId}_{index}  (index = 1 hoặc 2)
    const withoutPrefix = customId.slice('bet_amount_'.length);
    const sepIdx = withoutPrefix.lastIndexOf('_');
    const betId = withoutPrefix.slice(0, sepIdx);
    const choiceIndex = withoutPrefix.slice(sepIdx + 1);

    const guildId = requireGuild(interaction);
    const actor = actorUser(interaction);

    const firstRow = interaction.data?.components?.[0] as any;
    const inputComponent = firstRow?.components?.[0] as any;
    const rawAmount = (inputComponent?.value as string || '').trim();
    const amount = parseInt(rawAmount, 10);

    if (isNaN(amount) || amount < 10) {
      await editInteractionReply(interaction.application_id, interaction.token, {
        content: '❌ Số coin không hợp lệ! Phải là số nguyên và tối thiểu **10 🪙**.',
        allowed_mentions: { parse: [] },
      });
      return;
    }

    const bet = await getBet(betId);
    if (!bet || bet.guildId !== guildId) {
      await editInteractionReply(interaction.application_id, interaction.token, {
        content: '❌ Kèo cược này không tồn tại hoặc không còn hiệu lực.',
        allowed_mentions: { parse: [] },
      });
      return;
    }

    const playerChoice = choiceIndex === '2' ? bet.player2Name : bet.player1Name;

    if (bet.status !== 'open') {
      await editInteractionReply(interaction.application_id, interaction.token, {
        content: bet.status === 'locked'
          ? '🔒 Kèo cược này đã bị khóa (đang trong thời gian thi đấu)! Không thể đặt cược thêm.'
          : '❌ Kèo cược này đã kết thúc!',
        allowed_mentions: { parse: [] },
      });
      return;
    }

    try {
      const { newBalance } = await placeBetEntry({
        betId,
        guildId,
        userId: actor.id,
        playerChoice,
        amount,
      });

      await editInteractionReply(interaction.application_id, interaction.token, {
        content: `✅ Đã đặt cược **${amount} 🪙** cho **${playerChoice}**! Số dư còn lại: **${newBalance} 🪙**`,
        allowed_mentions: { parse: [] },
      });

      // Cập nhật embed poll nếu biết message_id
      if (bet.messageId && bet.channelId) {
        const entries = await getBetEntries(betId);
        const updatedPayload = buildBetMessage(bet, entries);
        await editChannelMessage(bet.channelId, bet.messageId, updatedPayload as DiscordPayload).catch(console.error);
      }
    } catch (err: any) {
      await editInteractionReply(interaction.application_id, interaction.token, {
        content: `❌ ${err.message}`,
        allowed_mentions: { parse: [] },
      });
    }
    return;
  }
}

function buildMainShopMessage(rating: RatingRow, actorId: string) {
  const gap = { name: '\u200b', value: '\u200b', inline: true };
  const embed: any = {
    title: '🛒 CỬA HÀNG VGC ROYALE',
    description:
      `> 💰 **Ví của bạn** — \`${rating.ryucoin.toLocaleString()}\` 🪙 Ryucoin\n` +
      `${RULE}\n` +
      `*Chọn dịch vụ ở menu bên dưới để mở giao dịch.*`,
    color: THEME.gold,
    fields: [
      { name: '🖼️ Background', value: '`400` 🪙 Ryucoin', inline: true },
      { name: '🖼️ Logo Thumbnail', value: '`350` 🪙 Ryucoin', inline: true },
      gap,
      { name: '🏷️ Đổi Nickname', value: '`80` 🪙 Ryucoin', inline: true },
      { name: '🎖️ Role Đặc Quyền', value: '`125` 🪙 · 15 ngày', inline: true },
      gap,
      { name: '✨ Shiny Thường', value: '`500` 🪙 Ryucoin', inline: true },
      { name: '🎫 Thẻ Tuần', value: '`150` 🪙 · +35/daily', inline: true },
      gap,
    ],
    footer: { text: 'Ryusei VGC Shop • Doanh thu được nạp tự động vào Quỹ Ngân Hàng' }
  };

  return {
    content: '',
    embeds: [embed],
    components: [
      {
        type: 1,
        components: [
          {
            type: 3,
            custom_id: `shop_menu_${actorId}`,
            placeholder: '🛒 Chọn dịch vụ muốn mua…',
            options: [
              { label: 'Background Thẻ Profile', value: `shop_select_bg_${actorId}`, description: '400 🪙 · Ảnh nền thẻ profile', emoji: { name: '🖼️' } },
              { label: 'Logo Thumbnail Profile', value: `shop_select_logo_${actorId}`, description: '350 🪙 · Logo góc thẻ profile', emoji: { name: '🖼️' } },
              { label: 'Đổi Nickname Server', value: `shop_btn_nickname_${actorId}`, description: '80 🪙 · Đổi tên hiển thị trên server', emoji: { name: '🏷️' } },
              { label: 'Role Đặc Quyền (15 ngày)', value: `shop_buy_role_${actorId}`, description: '125 🪙 · Role màu nổi bật 15 ngày', emoji: { name: '🎖️' } },
              { label: 'Pokémon Shiny Thường', value: `shop_buy_shiny_common_${actorId}`, description: '500 🪙 · Mở ticket nhận 1 shiny', emoji: { name: '✨' } },
              { label: 'Thẻ Tuần', value: `shop_buy_weekly_pass_${actorId}`, description: '150 🪙 · +35 🪙 mỗi lần /daily', emoji: { name: '🎫' } },
            ],
          },
        ],
      },
    ],
  };
}

function buildShopMessage(index: number, rating: RatingRow, actorId: string) {
  const list = Object.entries(WALLPAPERS);
  const total = list.length;
  const item = list[index];
  if (!item) throw new Error('Không tìm thấy hình nền');
  const [id, wp] = item;

  const embed: any = {
    title: '🖼️ Background Thẻ Profile',
    description:
      `> 💰 **Ví của bạn** — \`${rating.ryucoin.toLocaleString()}\` 🪙 Ryucoin\n` +
      `${RULE}\n` +
      `**Mẫu:** ${wp.name}\n` +
      `**Giá:** ${wp.cost === 0 ? '✨ Miễn phí' : `\`${wp.cost.toLocaleString()}\` 🪙 Ryucoin`}\n\n` +
      `Trang trí thẻ Profile của bạn và mở Ticket giao dịch.`,
    color: THEME.gold,
    footer: { text: `Mẫu ${index + 1}/${total}` }
  };
  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
  if (wp.url) {
    embed.image = { url: vercelUrl + wp.url };
  } else {
    embed.description += '\n\n*Mẫu này dùng nền mực tối mặc định.*';
  }

  const isEquipped = rating.wallpaperId === id;
  const isUnlocked = rating.unlockedWallpapers && rating.unlockedWallpapers.includes(id);

  let actionBtn: any = { type: 2, style: 3, label: `🛒 Mua & Mở Ticket (${wp.cost} 🪙)`, custom_id: `shop_buy_bg_${id}_${actorId}` };
  if (isEquipped) {
    actionBtn = { type: 2, style: 2, label: '✅ Đang dùng', custom_id: `shop_equipped`, disabled: true };
  } else if (isUnlocked) {
    actionBtn = { type: 2, style: 1, label: '✨ Sử dụng (Đã sở hữu)', custom_id: `shop_buy_bg_${id}_${actorId}` };
  }

  return {
    content: '',
    embeds: [embed],
    components: [
      {
        type: 1,
        components: [
          { type: 2, style: 1, label: '⬅️ Trước', custom_id: `shop_page_${index - 1}_${actorId}`, disabled: index === 0 },
          actionBtn,
          { type: 2, style: 1, label: 'Tiếp ➡️', custom_id: `shop_page_${index + 1}_${actorId}`, disabled: index === total - 1 }
        ]
      },
      {
        type: 1,
        components: [
          { type: 2, style: 2, label: '🏠 Về Menu Shop', custom_id: `shop_main_menu_${actorId}` }
        ]
      }
    ]
  };
}

async function handleShop(interaction: DiscordInteraction): Promise<void> {
  const guildId = requireMainGuild(interaction);
  const actor = actorUser(interaction);
  const rating = await getRating(guildId, actor.id);
  const msg = buildMainShopMessage(rating, actor.id);
  await reply(interaction, msg);

  // Tự động xóa tin nhắn /shop sau 1 phút (58 giây)
  await new Promise(resolve => setTimeout(resolve, 58000));
  await deleteInteractionReply(interaction.application_id, interaction.token).catch(err =>
    console.error('Lỗi khi tự động xóa tin nhắn /shop:', err)
  );
}

async function handleBalance(interaction: DiscordInteraction): Promise<void> {
  const guildId = requireGuild(interaction);
  const targetId = stringOption(interaction, 'user') || actorUser(interaction).id;
  const rating = await getRating(guildId, targetId);
  const isSelf = targetId === actorUser(interaction).id;
  const who = isSelf ? 'Số dư của bạn' : `Số dư của <@${targetId}>`;
  await reply(interaction, {
    embeds: [statusEmbed({
      color: THEME.gold,
      title: '🪙 Ví Ryucoin',
      description: `${who}: **${rating.ryucoin}** 🪙 Ryucoin`,
    })],
    allowed_mentions: { parse: [] },
  });
}

async function buildPokedexMessage(queryName: string, activeTab: 'base' | 'singles' | 'doubles' | 'forms'): Promise<{ content: string; embeds: any[]; components: any[] }> {
  const showdownId = queryName.toLowerCase().replace(/[^a-z0-9]/g, '');
  let species = Dex.species.get(showdownId);
  if (!species.exists) {
    species = Dex.species.get(queryName);
  }

  if (!species.exists) {
    return {
      content: '',
      embeds: [statusEmbed({
        color: THEME.crimson,
        title: '❌ Không tìm thấy Pokémon',
        description: `Không tìm thấy Pokémon nào với tên **"${queryName}"**. Vui lòng kiểm tra lại chính tả (ví dụ: Garchomp, Raichu, Incineroar).`,
      })],
      components: []
    };
  }

  const name = species.name;
  const num = species.num;
  const types = species.types.join(' / ');
  const abilities = Object.values(species.abilities).filter(Boolean).join(', ');
  const baseStats = species.baseStats;
  const totalStats = baseStats.hp + baseStats.atk + baseStats.def + baseStats.spa + baseStats.spd + baseStats.spe;
  const spriteId = (species as any).spriteid || species.id;
  const spriteUrl = `https://play.pokemonshowdown.com/sprites/gen5/${spriteId}.png`;

  let embed: any;

  if (activeTab === 'base') {
    embed = {
      title: `📖 Pokédex: ${name} (#${num})`,
      color: THEME.ember,
      thumbnail: { url: spriteUrl },
      description: `**Hệ:** ${types}\n**Đặc tính:** ${abilities}\n\n`
        + `**📊 Base Stats:**\n`
        + `**HP:** ${baseStats.hp} | **Atk:** ${baseStats.atk} | **Def:** ${baseStats.def}\n`
        + `**SpA:** ${baseStats.spa} | **SpD:** ${baseStats.spd} | **Spe:** ${baseStats.spe} | **Tổng:** ${totalStats}\n\n`
        + `*Sử dụng các nút bên dưới để chuyển sang Meta Singles, Doubles hoặc Các dạng hình thái (Forms).*`,
      footer: { text: 'Pokémon Champions Battle Data • Dex Info' }
    };
  } else if (activeTab === 'forms') {
    const baseName = species.baseSpecies || species.name;
    const metaData = await fetchChampionsMetadata(baseName);

    if (metaData && metaData.rows && metaData.rows.length > 0) {
      const formLines = metaData.rows.map(r => {
        const formTitle = r.title || r.saved_name || r.form || name;
        const typesStr = r.types || types;
        const abilitiesStr = (r.abilities || abilities).replace(/\|/g, ' / ');
        const statsStr = r.hp !== undefined
          ? `HP ${r.hp} | Atk ${r.atk} | Def ${r.def} | SpA ${r.spa} | SpD ${r.spd} | Spe ${r.spe} (Total ${r.total})`
          : 'Không có thông số';

        return `🔹 **${formTitle}**\n`
          + `• **Hệ:** \`${typesStr}\` | **Đặc tính:** \`${abilitiesStr}\`\n`
          + `• **Stats:** \`${statsStr}\``;
      }).join('\n\n');

      embed = {
        title: `🌀 Alternate Forms: ${baseName}`,
        color: THEME.ember,
        thumbnail: { url: spriteUrl },
        description: formLines,
        footer: { text: 'Nguồn: Champions Battle Data Metadata' }
      };
    } else {
      // Fallback Dex Formes
      const otherFormes = [species.name, ...(species.otherFormes || [])];
      const formLines = otherFormes.map(fName => {
        const s = Dex.species.get(fName);
        if (!s.exists) return `🔹 **${fName}**`;
        const sTypes = s.types.join(' / ');
        const sAbilities = Object.values(s.abilities).filter(Boolean).join(' / ');
        const st = s.baseStats;
        const sTotal = st.hp + st.atk + st.def + st.spa + st.spd + st.spe;

        return `🔹 **${s.name}**\n`
          + `• **Hệ:** \`${sTypes}\` | **Đặc tính:** \`${sAbilities}\`\n`
          + `• **Stats:** \`HP ${st.hp} | Atk ${st.atk} | Def ${st.def} | SpA ${st.spa} | SpD ${st.spd} | Spe ${st.spe} (Total ${sTotal})\``;
      }).join('\n\n');

      embed = {
        title: `🌀 Alternate Forms: ${baseName}`,
        color: THEME.ember,
        thumbnail: { url: spriteUrl },
        description: formLines || '*Không có hình thái khác cho Pokémon này.*',
        footer: { text: 'Pokémon Dex Data' }
      };
    }
  } else {
    const formatTitle = activeTab === 'singles' ? 'Singles (Đánh Đơn)' : 'Doubles (Đánh Đôi)';
    const battleData = await fetchChampionsBattleData(species.id || showdownId, activeTab === 'singles' ? 'Singles' : 'Doubles');

    if (!battleData || !battleData.rows || battleData.rows.length === 0) {
      embed = {
        title: `📖 Pokédex: ${name} - Meta ${formatTitle}`,
        color: THEME.gold,
        thumbnail: { url: spriteUrl },
        description: `*Chưa có dữ liệu Meta ${formatTitle} cho Pokémon này trên hệ thống Champions Battle Data.*`,
        footer: { text: 'Pokémon Champions Battle Data' }
      };
    } else {
      const rows = battleData.rows;
      const items = rows.filter(r => r.category === 'held_item' || r.category === 'item').slice(0, 5)
        .map(r => `\`${r.name}\`${r.percentage ? `: **${r.percentage}**` : ''}`).join(' • ');

      const abilities = rows.filter(r => r.category === 'ability').slice(0, 3)
        .map(r => `\`${r.name}\`${r.percentage ? `: **${r.percentage}**` : ''}`).join(' • ');

      const moves = rows.filter(r => r.category === 'move').slice(0, 6)
        .map(r => `\`${r.name}\`${r.percentage ? `: **${r.percentage}**` : ''}`).join(' • ');

      const teammates = rows.filter(r => r.category === 'teammate').slice(0, 5)
        .map(r => `\`${r.name}\``).join(' • ');

      const natures = rows.filter(r => r.category === 'stat_alignment').slice(0, 3)
        .map(r => {
          let str = `\`${r.name}\``;
          if (r.percentage) str += `: **${r.percentage}**`;
          if (r.stat_up && r.stat_down) str += ` *(+${r.stat_up} / -${r.stat_down})*`;
          return str;
        }).join('\n');

      const spreads = rows.filter(r => r.category === 'stat_points').slice(0, 3)
        .map(r => `\`${r.hp_points || 0}/${r.attack_points || 0}/${r.defense_points || 0}/${r.sp_atk_points || 0}/${r.sp_def_points || 0}/${r.speed_points || 0}\`: **${r.percentage || ''}**`)
        .join('\n');

      let desc = '';
      if (abilities) desc += `**⚡ Đặc tính (Abilities):**\n${abilities}\n\n`;
      desc += `**🏆 Trang bị (Items):**\n${items || 'Không có'}\n\n`;
      desc += `**⚔️ Chiêu thức (Moves):**\n${moves || 'Không có'}\n\n`;
      desc += `**👥 Đồng đội (Teammates):**\n${teammates || 'Không có'}\n\n`;
      if (natures) desc += `**🧠 Tính cách (Natures):**\n${natures}\n\n`;
      if (spreads) desc += `**📊 Điểm chỉ số (EV Spreads):**\n${spreads}\n\n`;

      embed = {
        title: `📖 Pokédex: ${name} - Meta ${formatTitle}`,
        color: activeTab === 'singles' ? THEME.crimson : THEME.win,
        thumbnail: { url: spriteUrl },
        description: desc,
        footer: { text: 'Nguồn: Champions Battle Data' }
      };
    }
  }

  const buttons = [
    {
      type: 2,
      style: activeTab === 'base' ? 1 : 2,
      label: '📊 Base Stats',
      custom_id: `pkdx_base_${species.id}`,
      disabled: activeTab === 'base'
    },
    {
      type: 2,
      style: activeTab === 'singles' ? 1 : 2,
      label: '⚔️ Singles',
      custom_id: `pkdx_sgl_${species.id}`,
      disabled: activeTab === 'singles'
    },
    {
      type: 2,
      style: activeTab === 'doubles' ? 1 : 2,
      label: '👥 Doubles',
      custom_id: `pkdx_dbl_${species.id}`,
      disabled: activeTab === 'doubles'
    },
    {
      type: 2,
      style: activeTab === 'forms' ? 1 : 2,
      label: '🌀 Alternate Forms',
      custom_id: `pkdx_frms_${species.id}`,
      disabled: activeTab === 'forms'
    }
  ];

  return {
    content: '',
    embeds: [embed],
    components: [{ type: 1, components: buttons }]
  };
}

async function handlePokedex(interaction: DiscordInteraction): Promise<void> {
  const pokemonOpt = stringOption(interaction, 'pokemon');
  if (!pokemonOpt) {
    await reply(interaction, { content: '❌ Vui lòng nhập tên Pokémon cần tra cứu.' });
    return;
  }

  const message = await buildPokedexMessage(pokemonOpt, 'base');
  await reply(interaction, message);
}

async function handlePokedexTabButton(interaction: DiscordInteraction, customId: string): Promise<void> {
  const parts = customId.split('_');
  const action = parts[1];
  const speciesId = parts.slice(2).join('_');

  let activeTab: 'base' | 'singles' | 'doubles' | 'forms' = 'base';
  if (action === 'sgl') activeTab = 'singles';
  else if (action === 'dbl') activeTab = 'doubles';
  else if (action === 'frms') activeTab = 'forms';

  const message = await buildPokedexMessage(speciesId, activeTab);
  await editSource(interaction, message);
}

export async function handleAutocompleteResponse(interaction: DiscordInteraction) {
  try {
    const command = interaction.data?.name;
    const options = interaction.data?.options || [];
    const focusedOption = options.find((opt: any) => opt.focused);
    const query = ((focusedOption?.value as string) || '').toLowerCase().trim();

    let choices: { name: string; value: string }[] = [];

    if (command === 'pokedex') {
      const list = Dex.species.all();
      const filtered = list.filter(s => s.name.toLowerCase().includes(query) || s.id.includes(query)).slice(0, 25);
      choices = filtered.map(s => ({ name: s.name, value: s.name }));
    } else if (command === 'move') {
      const list = Dex.moves.all();
      const filtered = list.filter(m => m.name.toLowerCase().includes(query) || m.id.includes(query)).slice(0, 25);
      choices = filtered.map(m => ({ name: m.name, value: m.name }));
    } else if (command === 'ability') {
      const list = Dex.abilities.all();
      const filtered = list.filter(a => a.name.toLowerCase().includes(query) || a.id.includes(query)).slice(0, 25);
      choices = filtered.map(a => ({ name: a.name, value: a.name }));
    } else if (command === 'end-bet') {
      const guildId = interaction.guild_id;
      if (guildId) {
        const bet = await getActiveBetInGuild(guildId).catch(() => null);
        if (bet) {
          const players = [bet.player1Name, bet.player2Name];
          choices = players
            .filter(p => p.toLowerCase().includes(query))
            .map(p => ({ name: p, value: p }));
        }
      }
    }

    return {
      type: 8,
      data: { choices }
    };
  } catch (err) {
    console.error('Autocomplete error:', err);
    return {
      type: 8,
      data: { choices: [] }
    };
  }
}

async function handleMoveCommand(interaction: DiscordInteraction): Promise<void> {
  const nameOpt = stringOption(interaction, 'name');
  if (!nameOpt) {
    await reply(interaction, { embeds: [statusEmbed({ color: THEME.crimson, title: '❌ Thiếu thông tin', description: 'Vui lòng nhập tên chiêu thức.' })] });
    return;
  }

  const move = Dex.moves.get(nameOpt);
  if (!move.exists) {
    await reply(interaction, { embeds: [statusEmbed({ color: THEME.crimson, title: '❌ Không tìm thấy chiêu thức', description: `Không tìm thấy chiêu thức nào tên **"${nameOpt}"**.` })] });
    return;
  }

  const categoryEmoji = move.category === 'Physical' ? '💥 Vật lý (Physical)' : move.category === 'Special' ? '✨ Đặc biệt (Special)' : '🛡️ Trạng thái (Status)';
  const powerStr = move.basePower ? `**Sức mạnh (Power):** ${move.basePower}` : '**Sức mạnh (Power):** -';
  const accuracyStr = move.accuracy === true ? '100% (Tuyệt đối)' : `${move.accuracy}%`;
  const priorityStr = move.priority > 0 ? `+${move.priority}` : `${move.priority}`;
  const desc = move.desc || move.shortDesc || 'Không có mô tả chi tiết.';

  const embed = {
    title: `⚔️ Chiêu thức: ${move.name}`,
    color: THEME.ember,
    description: `**Hệ:** ${move.type}\n`
      + `**Phân loại:** ${categoryEmoji}\n`
      + `${powerStr} | **Độ chính xác:** ${accuracyStr}\n`
      + `**PP:** ${move.pp} (Max ${Math.floor(move.pp * 1.6)}) | **Độ ưu tiên:** ${priorityStr}\n\n`
      + `**📖 Hiệu ứng:**\n${desc}`,
    footer: { text: 'Pokémon Dex Data' }
  };

  await reply(interaction, { embeds: [embed] });
}

async function handleAbilityCommand(interaction: DiscordInteraction): Promise<void> {
  const nameOpt = stringOption(interaction, 'name');
  if (!nameOpt) {
    await reply(interaction, { embeds: [statusEmbed({ color: THEME.crimson, title: '❌ Thiếu thông tin', description: 'Vui lòng nhập tên đặc tính.' })] });
    return;
  }

  const ability = Dex.abilities.get(nameOpt);
  if (!ability.exists) {
    await reply(interaction, { embeds: [statusEmbed({ color: THEME.crimson, title: '❌ Không tìm thấy đặc tính', description: `Không tìm thấy đặc tính nào tên **"${nameOpt}"**.` })] });
    return;
  }

  const desc = ability.desc || ability.shortDesc || 'Không có mô tả chi tiết.';

  const embed = {
    title: `🧠 Đặc tính: ${ability.name}`,
    color: THEME.ember,
    description: `**📖 Tác dụng:**\n${desc}`,
    footer: { text: 'Pokémon Dex Data' }
  };

  await reply(interaction, { embeds: [embed] });
}

async function handleDaily(interaction: DiscordInteraction): Promise<void> {
  const guildId = requireGuild(interaction);
  const actor = actorUser(interaction);
  const userRoleIds = interaction.member?.roles || [];
  
  const result = await claimDaily(guildId, actor.id, displayName(actor), userRoleIds);
  const weeklyPass = await getUserWeeklyPass(actor.id);

  if (result.alreadyClaimed) {
    await reply(interaction, {
      embeds: [statusEmbed({
        color: THEME.ember,
        title: '⏳ Đã điểm danh hôm nay',
        description: `Bạn đã nhận thưởng điểm danh hôm nay rồi!\nHãy quay lại sau <t:${result.nextResetTimestamp}:R> (<t:${result.nextResetTimestamp}:f>) để nhận tiếp nhé.`,
      })],
      allowed_mentions: { parse: [] },
    });
    return;
  }

  // ── XỬ LÝ BONUS THẺ TUẦN (WEEKLY PASS) ──
  let finalReward = result.reward;
  let passBonusText = '';
  
  if (weeklyPass) {
    const passBonusCoins = 35; // tùy chỉnh số xu thưởng thêm ở đây
    finalReward += passBonusCoins;
    
    // Cộng thêm phần xu bonus của thẻ tuần vào ví người chơi và cập nhật lại newRyucoin hiển thị
    await addRyucoin(guildId, actor.id, passBonusCoins);
    result.newRyucoin += passBonusCoins;
    
    const expireTime = Math.floor(weeklyPass.expiresAt / 1000);
    passBonusText = `\n🎫 **Thẻ Tuần kích hoạt:** +${passBonusCoins} 🪙 Ryucoin (Hết hạn: <t:${expireTime}:R>)`;
  }
  // ────────────────────────────────────────

  await checkEconomyAchievements(guildId, actor.id).catch(console.error);

  const bonusText = result.bonusCoins > 0
    ? `\n🎉 **Thưởng chuỗi 7 ngày:** +${result.bonusCoins} Ryucoin!`
    : '';

  const noRoleNotice = (result.reward === 0 && !weeklyPass)
    ? '\n⚠️ *Bạn hiện chưa sở hữu Role nào được gán thưởng Ryucoin Daily.*'
    : '';

  await reply(interaction, {
    embeds: [{
      color: THEME.win,
      title: '🎁 Điểm Danh Hàng Ngày (Daily Claim)',
      description: `Chúc mừng <@${actor.id}> đã nhận thưởng điểm danh hôm nay!${bonusText}${passBonusText}${noRoleNotice}`,
      fields: [
        { name: '💰 Phần thưởng', value: `+${finalReward} Ryucoin`, inline: true },
        { name: '🔥 Chuỗi điểm danh (Streak)', value: `**${result.streak}** ngày`, inline: true },
        { name: '👛 Số dư mới', value: `**${result.newRyucoin}** Ryucoin`, inline: true },
      ],
      footer: { text: 'Reset lúc 0:00 UTC+7 mỗi ngày • Ryusei VGC Daily' },
      timestamp: new Date().toISOString(),
    }],
    allowed_mentions: { users: [actor.id] },
  });
}


// ==================== BET SYSTEM HELPERS ====================

/** Trả modal type:9 ngay lập tức cho nút bet_vote_ */
function buildBetVoteModalData(interaction: DiscordInteraction): object {
  const customId = interaction.data?.custom_id || '';
  // customId = bet_vote_{betId}_{index}  (index = 1 hoặc 2)
  const withoutPrefix = customId.slice('bet_vote_'.length);
  const sepIdx = withoutPrefix.lastIndexOf('_');
  const betId = withoutPrefix.slice(0, sepIdx);
  const choiceIndex = withoutPrefix.slice(sepIdx + 1);
  const modalCustomId = `bet_amount_${betId}_${choiceIndex}`;

  // Lấy tên tuyển thủ từ nhãn nút vừa bấm (không cần gọi DB) để tiêu đề modal đẹp hơn.
  let playerLabel = '';
  const rows = (interaction as any).message?.components as any[] | undefined;
  if (Array.isArray(rows)) {
    for (const row of rows) {
      for (const comp of row?.components || []) {
        if (comp?.custom_id === customId && typeof comp?.label === 'string') {
          playerLabel = comp.label.replace(/^🟦\s*Đặt cược\s*/, '').replace(/^🟥\s*Đặt cược\s*/, '').trim();
        }
      }
    }
  }

  return {
    type: 9,
    data: {
      custom_id: modalCustomId,
      title: (playerLabel ? `💰 Đặt cược cho ${playerLabel}` : '💰 Đặt cược').slice(0, 45),
      components: [{
        type: 1,
        components: [{
          type: 4,
          custom_id: 'bet_coin_input',
          label: 'Số Ryucoin muốn đặt (tối thiểu 10)',
          style: 1,
          min_length: 1,
          max_length: 10,
          placeholder: 'Ví dụ: 100',
          required: true,
        }],
      }],
    },
  };
}

/** Xây dựng embed poll cược với % và nút chọn */
function buildBetMessage(bet: BetRow, entries: BetEntry[]): object {
  const totalPool = entries.reduce((s, e) => s + e.amount, 0);
  const p1Total = entries.filter(e => e.playerChoice === bet.player1Name).reduce((s, e) => s + e.amount, 0);
  const p2Total = entries.filter(e => e.playerChoice === bet.player2Name).reduce((s, e) => s + e.amount, 0);
  const p1Count = entries.filter(e => e.playerChoice === bet.player1Name).length;
  const p2Count = entries.filter(e => e.playerChoice === bet.player2Name).length;

  const p1Pct = totalPool > 0 ? Math.round((p1Total / totalPool) * 100) : 50;
  const p2Pct = totalPool > 0 ? Math.round((p2Total / totalPool) * 100) : 50;

  // Bar trực quan
  const barLen = 20;
  const p1Blocks = Math.round((p1Pct / 100) * barLen);
  const p2Blocks = barLen - p1Blocks;
  const bar = '🟦'.repeat(Math.max(0, p1Blocks)) + '🟥'.repeat(Math.max(0, p2Blocks));

  // Tỉ lệ nhân nếu thắng
  const houseRate = 0.9;
  const p1OddsRaw = p1Total > 0 ? (totalPool * houseRate) / p1Total : houseRate;
  const p2OddsRaw = p2Total > 0 ? (totalPool * houseRate) / p2Total : houseRate;
  const p1Odds = p1OddsRaw.toFixed(2);
  const p2Odds = p2OddsRaw.toFixed(2);

  const isLocked = bet.status === 'locked';

  const embed: any = {
    color: isLocked ? THEME.crimson : THEME.ember,
    title: isLocked ? '🔒 KÈO CƯỢC ĐÃ KHÓA (ĐANG THI ĐẤU)!' : '🎰 KÈO CƯỢC ĐANG MỞ!',
    description:
      (isLocked
        ? `> 🔒 **Đã dừng nhận cược.** Trận đấu đang diễn ra, hãy chờ kết quả!\n\n`
        : `> Chọn tuyển thủ bạn tin tưởng và nhập số **Ryucoin** muốn đặt.\n\n`) +
      `**🏟️ ${bet.player1Name}** vs **${bet.player2Name} 🏟️**\n\n` +
      `${bar}\n\n` +
      `🟦 **${bet.player1Name}** — ${p1Pct}% | ${p1Count} người | ${p1Total} 🪙 | Odds: **×${p1Odds}**\n` +
      `🟥 **${bet.player2Name}** — ${p2Pct}% | ${p2Count} người | ${p2Total} 🪙 | Odds: **×${p2Odds}**\n\n` +
      `💰 **Tổng pool:** ${totalPool} 🪙`,
    footer: { text: `Ryusei VGC Bet • ${entries.length} người đã đặt` },
    timestamp: new Date().toISOString(),
  };

  const components: any[] = isLocked ? [] : [{
    type: 1,
    components: [
      {
        type: 2,
        style: 1,
        label: `🟦 Đặt cược ${bet.player1Name}`.slice(0, 80),
        custom_id: `bet_vote_${bet.id}_1`,
      },
      {
        type: 2,
        style: 4,
        label: `🟥 Đặt cược ${bet.player2Name}`.slice(0, 80),
        custom_id: `bet_vote_${bet.id}_2`,
      },
    ],
  }];

  return { embeds: [embed], components };
}

async function handleCreateBet(interaction: DiscordInteraction): Promise<void> {
  const actor = actorUser(interaction);
  if (!BET_ADMIN_IDS.has(actor.id)) {
    await reply(interaction, {
      content: '🚫 Bạn không có quyền tạo kèo cược. Chỉ Admin mới dùng được lệnh này.',
      flags: 64,
    });
    return;
  }
  const guildId = requireMainGuild(interaction);
  const channelId = requireChannel(interaction);
  const player1 = (stringOption(interaction, 'player1', true) || '').trim();
  const player2 = (stringOption(interaction, 'player2', true) || '').trim();

  if (player1.toLowerCase() === player2.toLowerCase()) {
    await reply(interaction, { content: '❌ Hai tuyển thủ phải khác nhau.', flags: 64 });
    return;
  }

  const { randomUUID } = await import('node:crypto');
  const bet = await createBet({
    id: randomUUID(),
    guildId,
    channelId,
    player1Name: player1,
    player2Name: player2,
    createdBy: actor.id,
  });

  const pollPayload = buildBetMessage(bet, []) as any;

  await reply(interaction, {
    embeds: pollPayload.embeds,
    components: pollPayload.components,
    allowed_mentions: { parse: [] },
  });

  // Lưu message ID để edit sau mỗi lượt đặt cược
  try {
    const originalMsg = await discordRequest(
      `/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`,
      {},
      false,
    );
    if (originalMsg.id) {
      await updateBetMessageId(bet.id, String(originalMsg.id));
    }
  } catch (e) {
    console.error('Không lấy được message ID của bet poll:', e);
  }
}

async function handleShowBet(interaction: DiscordInteraction): Promise<void> {
  const actor = actorUser(interaction);
  if (!BET_ADMIN_IDS.has(actor.id)) {
    await reply(interaction, {
      content: '🚫 Bạn không có quyền hiện lại kèo cược. Chỉ Admin mới dùng được lệnh này.',
      flags: 64,
    });
    return;
  }
  const guildId = requireMainGuild(interaction);
  const channelId = requireChannel(interaction);
  const bet = await getActiveBetInGuild(guildId);
  if (!bet) {
    await reply(interaction, {
      embeds: [statusEmbed({ color: THEME.crimson, title: '❌ Không có kèo cược', description: 'Hiện không có kèo cược nào đang mở trong server này.' })],
      allowed_mentions: { parse: [] },
    });
    return;
  }
  const entries = await getBetEntries(bet.id);
  const pollPayload = buildBetMessage(bet, entries) as any;

  // Gỡ nút ở tin nhắn cược cũ (nếu có) để tránh việc nhiều tin nhắn có nút cược trùng lặp
  if (bet.messageId && bet.channelId) {
    await editChannelMessage(bet.channelId, bet.messageId, {
      components: [],
    }).catch(console.error);
  }

  await reply(interaction, {
    embeds: pollPayload.embeds,
    components: pollPayload.components,
    allowed_mentions: { parse: [] },
  });

  // Cập nhật channelId + messageId mới vào DB để các lượt đặt cược tiếp theo edit đúng tin nhắn
  try {
    const originalMsg = await discordRequest(
      `/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`,
      {},
      false,
    );
    if (originalMsg.id) {
      await updateBetChannelAndMessageId(bet.id, channelId, String(originalMsg.id));
    }
  } catch (e) {
    console.error('Không lấy được message ID của show-bet:', e);
  }
}

async function handleStopBet(interaction: DiscordInteraction): Promise<void> {
  const actor = actorUser(interaction);
  if (!BET_ADMIN_IDS.has(actor.id)) {
    await reply(interaction, {
      content: '🚫 Bạn không có quyền dừng cược. Chỉ Admin mới dùng được lệnh này.',
      flags: 64,
    });
    return;
  }
  const guildId = requireMainGuild(interaction);

  const bet = await getActiveBetInGuild(guildId);
  if (!bet || bet.status !== 'open') {
    await reply(interaction, {
      content: '❌ Không có kèo cược nào đang mở (hoặc kèo cược đã bị khóa/kết thúc).',
      flags: 64,
    });
    return;
  }

  const updatedBet = await stopBet({ betId: bet.id, guildId });
  const entries = await getBetEntries(bet.id);
  const pollPayload = buildBetMessage(updatedBet, entries) as any;

  // Edit tin nhắn poll gốc (nếu có messageId) để gỡ nút cược và đổi màu embed thành Đã khóa
  if (bet.messageId && bet.channelId) {
    await editChannelMessage(bet.channelId, bet.messageId, {
      embeds: pollPayload.embeds,
      components: [],
    }).catch(console.error);
  }

  await reply(interaction, {
    embeds: pollPayload.embeds,
    components: [],
    allowed_mentions: { parse: [] },
  });
}

async function handleEndBet(interaction: DiscordInteraction): Promise<void> {
  const actor = actorUser(interaction);
  if (!BET_ADMIN_IDS.has(actor.id)) {
    await reply(interaction, {
      content: '🚫 Bạn không có quyền kết thúc kèo cược. Chỉ Admin mới dùng được lệnh này.',
      flags: 64,
    });
    return;
  }
  const guildId = requireMainGuild(interaction);
  const winnerName = (stringOption(interaction, 'winner', true) || '').trim();

  const bet = await getActiveBetInGuild(guildId);
  if (!bet) {
    await reply(interaction, { content: '❌ Không có kèo cược nào đang mở.', flags: 64 });
    return;
  }

  // Kiểm tra tên winner hợp lệ (so sánh không phân biệt hoa thường)
  let resolvedWinner: string | null = null;
  if (winnerName.toLowerCase() === bet.player1Name.toLowerCase()) resolvedWinner = bet.player1Name;
  else if (winnerName.toLowerCase() === bet.player2Name.toLowerCase()) resolvedWinner = bet.player2Name;

  if (!resolvedWinner) {
    await reply(interaction, {
      content: `❌ Tên người thắng không khớp. Phải là **${bet.player1Name}** hoặc **${bet.player2Name}**.`,
      flags: 64,
    });
    return;
  }

  const { payouts, houseKeep, totalPool } = await closeBet({
    betId: bet.id,
    guildId,
    winner: resolvedWinner,
  });

  const loserName = resolvedWinner === bet.player1Name ? bet.player2Name : bet.player1Name;

  // Tạo summary danh sách nhận thưởng (tối đa 10 dòng)
  const payoutLines = payouts.slice(0, 10)
    .map(p => `• <@${p.userId}> nhận **${p.amount} 🪙**`)
    .join('\n');
  const moreCount = payouts.length > 10 ? `\n*...và ${payouts.length - 10} người khác*` : '';

  const resultEmbed: any = {
    color: THEME.win,
    title: '🏆 KÈO CƯỢC ĐÃ KẾT THÚC!',
    description:
      `**🏆 Người thắng: ${resolvedWinner}**\n` +
      `**❌ Người thua: ${loserName}**\n\n` +
      `💰 **Tổng pool:** ${totalPool} 🪙\n` +
      `🎁 **Phân phối:** ${totalPool - houseKeep} 🪙 → ${payouts.length} người thắng\n\n` +
      (payoutLines
        ? `**Danh sách nhận thưởng:**\n${payoutLines}${moreCount}`
        : '*Không có ai đặt cược phía người thắng.*'),
    footer: { text: `Bet ID: ${bet.id}` },
    timestamp: new Date().toISOString(),
  };

  // Xóa nút bấm khỏi tin nhắn poll cũ
  if (bet.messageId && bet.channelId) {
    await editChannelMessage(bet.channelId, bet.messageId, {
      components: [],
    }).catch(console.error);
  }

  // Đăng tin nhắn kết quả mới công khai ở kênh bet
  if (bet.channelId) {
    await createMessage(bet.channelId, {
      embeds: [resultEmbed],
      allowed_mentions: { parse: [] },
    }).catch(console.error);
  }

  // Reply ephemeral xác nhận cho admin
  await reply(interaction, {
    content: `✅ Đã kết thúc kèo **${bet.player1Name}** vs **${bet.player2Name}**! Người thắng: **${resolvedWinner}** 🏆`,
    flags: 64,
    allowed_mentions: { parse: [] },
  });
}

async function handleBank(interaction: DiscordInteraction): Promise<void> {
  const guildId = requireMainGuild(interaction);
  const bank = await getBank(guildId);

  const embed: any = {
    color: THEME.ember,
    title: '🏦 QUỸ NGÂN HÀNG ADMIN SERVER',
    description: `Chào mừng bạn đến với Ngân Hàng Server! Toàn bộ thuế giao dịch, phí sàn cược và doanh thu bán hàng được tự động quy gom vào quỹ này để tổ chức các sự kiện & phát thưởng.\n\n` +
      `💰 **Tổng Số Dư Quỹ Hiện Tại:** **${bank.balance} 🪙 Ryucoin**`,
    footer: { text: 'Ryusei VGC Bank System' },
    timestamp: new Date().toISOString(),
  };

  await reply(interaction, { embeds: [embed] });
}

async function handleBankGive(interaction: DiscordInteraction): Promise<void> {
  const guildId = requireMainGuild(interaction);
  const actor = actorUser(interaction);
  const targetUser = resolvedUser(interaction, stringOption(interaction, 'user', true));
  const amount = numberOption(interaction, 'amount');

  if (!amount || amount <= 0 || !Number.isInteger(amount)) {
    await reply(interaction, {
      content: '',
      embeds: [statusEmbed({ color: THEME.crimson, title: '❌ Số tiền không hợp lệ', description: 'Số Ryucoin cấp phải là một số nguyên dương.' })],
    });
    return;
  }

  if (targetUser.bot) {
    await reply(interaction, {
      content: '',
      embeds: [statusEmbed({ color: THEME.crimson, title: '❌ Không thể cấp thưởng', description: 'Không thể phát Ryucoin từ ngân hàng cho Bot.' })],
    });
    return;
  }

  const result = await withdrawFromBank({
    guildId,
    executorId: actor.id,
    recipientId: targetUser.id,
    recipientName: displayName(targetUser),
    amount,
  });

  await reply(interaction, {
    content: `<@${targetUser.id}>`,
    embeds: [{
      color: THEME.win,
      title: '🏛️ Cấp Thưởng Từ Quỹ Ngân Hàng Admin Thành Công!',
      description: `<@${actor.id}> vừa rút **${amount} 🪙 Ryucoin** từ Quỹ Ngân Hàng Admin để trao thưởng cho <@${targetUser.id}> (Không trừ thuế)!`,
      fields: [
        { name: '📤 Quỹ Ngân Hàng', value: `Số dư còn lại: **${result.bankBalance} 🪙**`, inline: true },
        { name: '📥 Người nhận', value: `<@${targetUser.id}>\nSố dư: **${result.recipientNewBalance} 🪙**`, inline: true },
      ],
      footer: { text: 'Ryusei VGC Bank • Cấp thưởng công khai (miễn thuế)' },
      timestamp: new Date().toISOString(),
    }],
    allowed_mentions: { users: [targetUser.id] },
  });
}

async function handleSetBankManagers(interaction: DiscordInteraction): Promise<void> {
  const guildId = requireMainGuild(interaction);
  const actor = actorUser(interaction);

  const memberPerms = BigInt(interaction.member?.permissions || '0');
  if ((memberPerms & MANAGE_GUILD) === 0n && !BET_ADMIN_IDS.has(actor.id)) {
    await reply(interaction, { content: '🚫 Chỉ Admin Server mới có quyền cài đặt Quản lý Ngân hàng.', flags: 64 });
    return;
  }

  const user1 = resolvedUser(interaction, stringOption(interaction, 'user1', true));
  const user2Raw = stringOption(interaction, 'user2');
  const user2 = user2Raw ? resolvedUser(interaction, user2Raw) : undefined;

  const managers = [user1.id];
  if (user2 && user2.id !== user1.id) managers.push(user2.id);

  const saved = await setBankManagers(guildId, managers);

  const mentions = saved.map(id => `<@${id}>`).join(', ');

  await reply(interaction, {
    embeds: [{
      color: THEME.ember,
      title: '⚙️ Đã Cấu Hình Quản Lý Ngân Hàng Admin!',
      description: `Đã cấp quyền truy cập & sử dụng lệnh \`/bank_give\` cho **${saved.length} người**:\n\n${mentions}\n\n*Hai Quản lý này có thể tự do kiểm tra số dư và dùng lệnh \`/bank_give\` để phát thưởng từ Quỹ Ngân Hàng.*`,
      footer: { text: 'Ryusei VGC Bank Configuration' },
      timestamp: new Date().toISOString(),
    }],
    allowed_mentions: { parse: ['users'] },
  });
}

async function handleBankAdd(interaction: DiscordInteraction): Promise<void> {
  const guildId = requireMainGuild(interaction);
  const actor = actorUser(interaction);
  const amount = numberOption(interaction, 'amount');

  if (!amount || amount <= 0 || !Number.isInteger(amount)) {
    await reply(interaction, { content: '❌ Số Ryucoin nạp phải là số nguyên dương.', flags: 64 });
    return;
  }

  const memberPerms = BigInt(interaction.member?.permissions || '0');
  const bank = await getBank(guildId);
  const isManager = bank.authorizedUserIds.includes(actor.id);
  const isAdmin = (memberPerms & MANAGE_GUILD) !== 0n || BET_ADMIN_IDS.has(actor.id);

  if (!isManager && !isAdmin) {
    await reply(interaction, { content: '🚫 Bạn không có quyền nạp tiền vào Quỹ Ngân Hàng Admin.', flags: 64 });
    return;
  }

  const newBalance = await depositToBank(guildId, amount);

  await reply(interaction, {
    embeds: [{
      color: THEME.win,
      title: '➕ Nạp Tiền Vào Quỹ Ngân Hàng Admin Thành Công!',
      description: `<@${actor.id}> vừa nạp thêm **+${amount} 🪙 Ryucoin** vào Quỹ Ngân Hàng Admin!`,
      fields: [
        { name: '🏦 Số dư Quỹ mới', value: `**${newBalance} 🪙 Ryucoin**`, inline: true },
      ],
      footer: { text: 'Ryusei VGC Bank Deposit' },
      timestamp: new Date().toISOString(),
    }],
    allowed_mentions: { parse: ['users'] },
  });
}

async function handleFreeCoinsCommand(interaction: DiscordInteraction): Promise<void> {
  requireMainGuild(interaction);
  await reply(interaction, {
    embeds: [statusEmbed({
      color: THEME.gold,
      title: '🪙 Drop Ryucoin!',
      description: '**50** 🪙 Ryucoin đang chờ! Bấm **Nhận** thật nhanh — ai nhanh tay nhất sẽ ẵm trọn!',
    })],
    components: [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 3,
            custom_id: 'free_coins_claim',
            label: 'Nhận',
            emoji: { name: '🪙' },
          },
        ],
      },
    ],
  });
}

async function handleFreeShinyCommand(interaction: DiscordInteraction): Promise<void> {
  requireMainGuild(interaction);
  await reply(interaction, {
    embeds: [statusEmbed({
      color: THEME.gold,
      title: '✨ Drop Pokémon Shiny!',
      description: '**1 Pokémon Shiny** đang chờ chủ nhân! Bấm **Nhận Shiny** thật nhanh — chỉ người nhanh tay nhất mới có được!',
    })],
    components: [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 3,
            custom_id: 'free_shiny_claim',
            label: 'Nhận Shiny',
            emoji: { name: '✨' },
          },
        ],
      },
    ],
  });
}

async function handleGaShinyCommand(interaction: DiscordInteraction): Promise<void> {
  const actor = actorUser(interaction);
  if (actor.id !== '983625547076739102') {
    await reply(interaction, {
      content: '❌ Bạn không có quyền sử dụng lệnh này.',
      flags: 64,
    });
    return;
  }

  const guildId = requireMainGuild(interaction);
  const giveawayId = interaction.id;

  const customText = stringOption(interaction, 'text');
  const targetChannelId = stringOption(interaction, 'kenh') || stringOption(interaction, 'channel');

  // Đọc attachment nếu có
  const attachmentId = rawOption(interaction, 'anh')?.value as string | undefined;
  const attachment = attachmentId
    ? (interaction.data?.resolved?.attachments as Record<string, { url: string; content_type?: string }> | undefined)?.[attachmentId]
    : undefined;
  const imageUrl = attachment?.url;

  await createGiveaway(giveawayId, guildId);

  const description = customText && customText.trim()
    ? customText.trim()
    : '🏃 Bấm nút bên dưới thật nhanh để giành quyền nhận **1 Pokémon Shiny**!\n\n⚠️ Chỉ **1 người đầu tiên** bấm mới được nhận.';

  const embed: Record<string, unknown> = {
    color: THEME.gold,
    title: '✨ Giveaway — 1 Pokémon Shiny',
    description,
    footer: { text: 'Chúc mọi người may mắn! 🍀' },
  };
  if (imageUrl) embed.image = { url: imageUrl };

  const giveawayPayload: DiscordPayload = {
    embeds: [embed],
    components: [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 3,
            custom_id: `ga_shiny_claim_${giveawayId}`,
            label: '🎁 Nhận Shiny ngay!',
          },
        ],
      },
    ],
    allowed_mentions: { parse: [] },
  };

  const destChannelId = targetChannelId || interaction.channel_id;
  if (destChannelId) {
    await createMessage(destChannelId, giveawayPayload);
    await reply(interaction, {
      content: `✅ Đã đăng bài Giveaway Pokémon Shiny vào kênh <#${destChannelId}>! ✨`,
      flags: 64,
    });
  } else {
    await reply(interaction, {
      content: `✅ Đã tạo Giveaway Pokémon Shiny! ✨`,
      flags: 64,
    });
  }
}

async function handleQuestionGaCommand(interaction: DiscordInteraction): Promise<void> {
  const actor = actorUser(interaction);
  if (actor.id !== '983625547076739102') {
    await reply(interaction, {
      content: '❌ Bạn không có quyền sử dụng lệnh này.',
      flags: 64,
    });
    return;
  }

  const guildId = requireMainGuild(interaction);
  const giveawayId = interaction.id;
  const destChannelId = stringOption(interaction, 'kenh') || stringOption(interaction, 'channel') || interaction.channel_id || requireChannel(interaction);

  const question = stringOption(interaction, 'cauhoi', true);
  const answer = stringOption(interaction, 'dapan', true);
  const reward = stringOption(interaction, 'phanqua');

  // Attachment option if provided
  const attachmentId = rawOption(interaction, 'anh')?.value as string | undefined;
  const attachment = attachmentId
    ? (interaction.data?.resolved?.attachments as Record<string, { url: string; content_type?: string }> | undefined)?.[attachmentId]
    : undefined;
  const imageUrl = attachment?.url;

  await createQuestionGiveaway({
    id: giveawayId,
    guildId,
    channelId: destChannelId,
    question,
    answer,
    reward,
    imageUrl,
  });

  let embedDesc = `❓ **Câu hỏi:** ${question}\n`;
  if (reward && reward.trim()) {
    embedDesc += `🎁 **Phần quà:** **${reward.trim()}**\n\n`;
  } else {
    embedDesc += `\n`;
  }
  embedDesc +=
    `📝 Bấm nút **"✍️ Trả lời"** bên dưới để nhập đáp án của bạn!\n` +
    `⚠️ Người trả lời **chính xác & nhanh nhất** sẽ giành chiến thắng.`;

  const embed: Record<string, unknown> = {
    color: THEME.ember,
    title: '❓ Giveaway Câu Hỏi',
    description: embedDesc,
    footer: { text: 'Chúc mọi người may mắn! 🍀' },
  };
  if (imageUrl) embed.image = { url: imageUrl };

  const giveawayPayload: DiscordPayload = {
    embeds: [embed],
    components: [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 3,
            custom_id: `ga_question_btn_${giveawayId}`,
            label: '✍️ Trả lời',
          },
        ],
      },
    ],
    allowed_mentions: { parse: [] },
  };

  const msg = await createMessage(destChannelId, giveawayPayload);
  if (msg?.id) {
    await updateGiveawayMessageId(giveawayId, String(msg.id)).catch(console.error);
  }

  await reply(interaction, {
    content: `✅ Đã đăng bài Giveaway Câu Hỏi vào kênh <#${destChannelId}>! ✨`,
    flags: 64,
  });
}

async function handleSellShinyCommand(interaction: DiscordInteraction): Promise<void> {
  const actor = actorUser(interaction);
  if (actor.id !== SUPER_ADMIN_ID && actor.id !== '983625547076739102') {
    await reply(interaction, {
      content: '❌ Bạn không có quyền sử dụng lệnh này.',
      flags: 64,
    });
    return;
  }

  const guildId = requireGuild(interaction);

  const itemName = stringOption(interaction, 'ten', true);
  const price = numberOption(interaction, 'gia');
  if (!price || price < 1) {
    await reply(interaction, {
      content: '❌ Giá Ryucoin phải là số dương hợp lệ.',
      flags: 64,
    });
    return;
  }

  const stock = numberOption(interaction, 'stock') || 1;
  const targetChannelId = stringOption(interaction, 'kenh') || stringOption(interaction, 'channel');

  // Đọc attachment nếu có
  const attachmentId = rawOption(interaction, 'anh')?.value as string | undefined;
  const attachment = attachmentId
    ? (interaction.data?.resolved?.attachments as Record<string, { url: string; content_type?: string }> | undefined)?.[attachmentId]
    : undefined;
  const imageUrl = attachment?.url || stringOption(interaction, 'image_url');

  const listingId = randomUUID();

  const embed: Record<string, unknown> = {
    color: THEME.ember,
    title: `✨ POKÉMON SHINY ĐANG BÁN!`,
    description: `🏷️ **Tên Pokémon:** **${itemName}**\n💰 **Giá:** **${price.toLocaleString()} 🪙 Ryucoin**\n📦 **Stock:** **${stock} / ${stock}**\n\n🟢 **Trạng thái:** Còn lại **${stock}** sản phẩm.\n\n👇 Bấm nút **[🛒 Mua Ngay]** bên dưới để sở hữu Pokémon Shiny này!`,
    fields: [
      { name: '👤 Người bán', value: `<@${actor.id}>`, inline: true },
      { name: '🪙 Giá bán', value: `**${price.toLocaleString()} 🪙**`, inline: true },
    ],
    footer: { text: `Sử dụng Ryucoin để mua • Người bấm nhanh nhất & đủ tiền sẽ sở hữu` },
    timestamp: new Date().toISOString(),
  };
  if (imageUrl) embed.image = { url: imageUrl };

  const payload: DiscordPayload = {
    embeds: [embed],
    components: [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 3, // Green
            custom_id: `sell_shiny_buy_${listingId}`,
            label: `🛒 Mua Ngay (${price.toLocaleString()} 🪙)`,
          },
        ],
      },
    ],
    allowed_mentions: { parse: [] },
  };

  const destChannelId = targetChannelId || interaction.channel_id;
  if (!destChannelId) throw new Error('Không xác định được kênh đăng bài.');

  // Tạo listing record trong DB
  await createSellShinyListing({
    id: listingId,
    guildId,
    channelId: destChannelId,
    sellerId: actor.id,
    itemName,
    price,
    imageUrl: imageUrl || undefined,
    mode: 'direct',
    totalSlots: stock,
  });

  const msg = await createMessage(destChannelId, payload) as { id?: string };
  if (msg?.id) {
    await updateSellShinyMessageId(listingId, String(msg.id));
  }

  if (targetChannelId && targetChannelId !== interaction.channel_id) {
    await reply(interaction, {
      content: `✅ Đã đăng bài rao bán Pokémon Shiny với **${stock}** stock tại <#${targetChannelId}>!`,
      flags: 64,
    });
  } else {
    await reply(interaction, {
      content: `✅ Đã đăng bài rao bán Pokémon Shiny thành công với **${stock}** stock!`,
      flags: 64,
    });
  }
}

async function handleGachaShinyCommand(interaction: DiscordInteraction): Promise<void> {
  const actor = actorUser(interaction);
  if (actor.id !== SUPER_ADMIN_ID && actor.id !== '983625547076739102') {
    await reply(interaction, {
      content: '❌ Bạn không có quyền sử dụng lệnh này.',
      flags: 64,
    });
    return;
  }

  const guildId = requireGuild(interaction);

  const itemName = stringOption(interaction, 'ten', true);
  const price = numberOption(interaction, 'gia');
  if (!price || price < 1) {
    await reply(interaction, {
      content: '❌ Giá Ryucoin cho mỗi vé phải là số dương hợp lệ.',
      flags: 64,
    });
    return;
  }

  const slotsInput = numberOption(interaction, 'slots');
  const totalSlots = Math.max(2, Math.min(100, slotsInput || 10));

  const targetChannelId = stringOption(interaction, 'kenh') || stringOption(interaction, 'channel');

  // Đọc attachment nếu có
  const attachmentId = rawOption(interaction, 'anh')?.value as string | undefined;
  const attachment = attachmentId
    ? (interaction.data?.resolved?.attachments as Record<string, { url: string; content_type?: string }> | undefined)?.[attachmentId]
    : undefined;
  const imageUrl = attachment?.url || stringOption(interaction, 'image_url');

  const listingId = randomUUID();

  const embed: Record<string, unknown> = {
    color: THEME.ember,
    title: `🎟️ VÉ SỐ POKÉMON SHINY — ${itemName}`,
    description: `🏷️ **Tên Pokémon:** **${itemName}**\n🪙 **Giá 1 vé:** **${price.toLocaleString()} 🪙 Ryucoin**\n📊 **Tiến độ gom vé:** 🟢 **0 / ${totalSlots} vé** (0%)\n\n👇 Bấm nút **[🎟️ Mua 1 vé]** bên dưới để tham gia mua vé số! 1 người có thể mua nhiều vé để tăng cơ hội trúng. Đủ **${totalSlots} vé** bot sẽ tự động **Gacha quay số**!`,
    fields: [
      { name: '👥 Danh sách người mua vé', value: 'Chưa có ai mua vé nào', inline: false },
    ],
    footer: { text: `Vé số Gacha • Đủ ${totalSlots} vé sẽ tự động quay số chọn người thắng` },
    timestamp: new Date().toISOString(),
  };
  if (imageUrl) embed.image = { url: imageUrl };

  const payload: DiscordPayload = {
    embeds: [embed],
    components: [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 1,
            custom_id: `sell_shiny_buy_${listingId}`,
            label: `🎟️ Mua 1 vé (${price.toLocaleString()} 🪙)`,
          },
        ],
      },
    ],
    allowed_mentions: { parse: [] },
  };

  const destChannelId = targetChannelId || interaction.channel_id;
  if (!destChannelId) throw new Error('Không xác định được kênh đăng bài.');

  // Tạo listing record trong DB với mode 'lottery'
  await createSellShinyListing({
    id: listingId,
    guildId,
    channelId: destChannelId,
    sellerId: actor.id,
    itemName,
    price,
    imageUrl: imageUrl || undefined,
    mode: 'lottery',
    totalSlots,
  });

  const msg = await createMessage(destChannelId, payload) as { id?: string };
  if (msg?.id) {
    await updateSellShinyMessageId(listingId, String(msg.id));
  }

  if (targetChannelId && targetChannelId !== interaction.channel_id) {
    await reply(interaction, {
      content: `✅ Đã đăng bài mở bán Vé số Gacha Pokémon Shiny (${totalSlots} slot) tại <#${targetChannelId}>!`,
      flags: 64,
    });
  } else {
    await reply(interaction, {
      content: `✅ Đã đăng bài mở bán Vé số Gacha Pokémon Shiny (${totalSlots} slot) thành công!`,
      flags: 64,
    });
  }
}

async function handleSetThumbnail(interaction: DiscordInteraction): Promise<void> {
  const actor = actorUser(interaction);
  if (!await isModerator(interaction) && !hasManageGuild(interaction) && actor.id !== SUPER_ADMIN_ID) {
    await reply(interaction, { content: '🚫 Bạn không có quyền sử dụng lệnh này!', flags: 64 });
    return;
  }

  const targetId = stringOption(interaction, 'user');
  if (!targetId) return;

  let imageUrl = stringOption(interaction, 'image_url') || '';
  if (!imageUrl && interaction.data?.options) {
    const fileOpt = interaction.data.options.find(o => o.name === 'image_file');
    if (fileOpt && fileOpt.value) {
      const attachmentId = String(fileOpt.value);
      const attachment = interaction.data.resolved?.attachments?.[attachmentId];
      if (attachment?.url) imageUrl = attachment.url;
    }
  }

  if (!imageUrl || (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://'))) {
    await reply(interaction, { content: '❌ Vui lòng cung cấp link ảnh hợp lệ hoặc tải tệp ảnh lên.', flags: 64 });
    return;
  }

  // Tải dữ liệu ảnh và lưu Base64
  let base64Data = '';
  let contentType = 'image/png';
  try {
    const imageRes = await fetch(imageUrl);
    if (!imageRes.ok) {
      await reply(interaction, { content: `❌ Không thể tải ảnh từ URL/File đã chọn (HTTP ${imageRes.status}).`, flags: 64 });
      return;
    }
    contentType = imageRes.headers.get('content-type') || 'image/png';
    const arrayBuffer = await imageRes.arrayBuffer();
    if (arrayBuffer.byteLength > 5 * 1024 * 1024) {
      await reply(interaction, { content: '❌ Kích thước tệp ảnh quá lớn! Vui lòng chọn ảnh dưới 5MB cho thumbnail.', flags: 64 });
      return;
    }
    base64Data = Buffer.from(arrayBuffer).toString('base64');
  } catch (err: any) {
    await reply(interaction, { content: `❌ Lỗi khi tải dữ liệu ảnh: ${err?.message || err}`, flags: 64 });
    return;
  }

  await saveCustomThumbnail(targetId, base64Data, contentType);

  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

  // Đặt API route mới, ví dụ: /api/thumb/
  const persistentThumbUrl = `${vercelUrl}/api/thumb/${targetId}?t=${Date.now()}`;

  const guildId = requireGuild(interaction);
  await setUserThumbnail(guildId, targetId, persistentThumbUrl);

  let thumbFiles: DiscordFile[] | undefined;
  if (base64Data) {
    try {
      const ext = contentType.includes('jpeg') || contentType.includes('jpg') ? 'jpg' : 'png';
      thumbFiles = [{
        name: `thumbnail.${ext}`,
        data: Buffer.from(base64Data, 'base64'),
        contentType,
      }];
    } catch { }
  }

  await reply(interaction, {
    content: `✅ **Đã cài đặt Thumbnail Profile vĩnh viễn cho <@${targetId}>!**`,
    embeds: [{
      title: '🖼️ Thumbnail Preview',
      thumbnail: { url: thumbFiles?.[0] ? `attachment://${thumbFiles[0].name}` : persistentThumbUrl },
      color: THEME.win,
    }],
    allowed_mentions: { users: [targetId] }
  }, thumbFiles);
}

async function handleTaoBillCommand(interaction: DiscordInteraction): Promise<void> {
  const actor = actorUser(interaction);
  // Chỉ kiểm tra quyền nếu ở trong guild, nếu ở DM thì cho phép mọi người tạo bill
  if (interaction.guild_id && !await isModerator(interaction) && !hasManageGuild(interaction) && actor.id !== SUPER_ADMIN_ID) {
    throw new Error('Chỉ Mod/Admin mới có quyền sử dụng lệnh tạo Bill.');
  }

  const options = interaction.data?.options || [];
  const amount = options.find(o => o.name === 'amount')?.value as number;
  const customTitle = options.find(o => o.name === 'title')?.value as string | undefined;
  const customerUser = options.find(o => o.name === 'customer')?.value as string | undefined;
  const expiresInMinutes = (options.find(o => o.name === 'expires_in')?.value as number) || 30;

  if (!amount || amount < 1000) {
    throw new Error('Số tiền thanh toán tối thiểu là 1,000 VNĐ.');
  }

  const title = customTitle || 'Gói Pokémon Home Premium';
  const guildId = interaction.guild_id || 'DM';
  const channelId = interaction.channel_id || actor.id;

  const billCode = `BILL${Math.floor(100000 + Math.random() * 900000)}`;
  const expiresAtMs = Date.now() + expiresInMinutes * 60 * 1000;
  const expiresTs = Math.floor(expiresAtMs / 1000);

  await createBill({
    id: billCode,
    guildId,
    channelId,
    creatorId: actor.id,
    customerId: customerUser,
    title,
    amount,
    expiresInMinutes,
  });

  const amountFormatted = amount.toLocaleString('vi-VN');
  const qrUrl = `https://img.vietqr.io/image/mb-0828006916-compact2.jpg?amount=${amount}&addInfo=${billCode}&accountName=${encodeURIComponent('TRUONG NGUYEN TIEN DAT')}`;

  let files: { name: string; data: Buffer; contentType?: string }[] | undefined;
  let embedImageUrl = qrUrl;

  try {
    const qrRes = await fetch(qrUrl);
    if (qrRes.ok) {
      const qrBuf = Buffer.from(await qrRes.arrayBuffer());
      const fileName = `vietqr_${billCode}.jpg`;
      files = [{ name: fileName, data: qrBuf, contentType: 'image/jpeg' }];
      embedImageUrl = `attachment://${fileName}`;
    }
  } catch (err) {
    console.error(`[TaoBill] Lỗi tải ảnh mã VietQR về server:`, err);
  }

  const embed = {
    color: THEME.ember,
    author: { name: 'RYUSEI BILLING · HÓA ĐƠN THANH TOÁN' },
    title: `💳 HÓA ĐƠN: ${title.toUpperCase()}`,
    description:
      `Vui lòng quét mã VietQR bên dưới bằng App Ngân Hàng bất kỳ để hoàn tất thanh toán!\n` +
      `*Hệ thống sẽ **tự động xác nhận** ngay khi nhận được tiền (1–3 giây).*`,
    fields: [
      { name: '🧾 Mã Bill', value: `\`${billCode}\``, inline: true },
      { name: '📦 Nội dung / Dịch vụ', value: `**${title}**`, inline: true },
      { name: '💵 Số tiền', value: `**${amountFormatted} VNĐ**`, inline: true },
      { name: '👤 Khách hàng', value: customerUser ? `<@${customerUser}>` : 'Tất cả thành viên', inline: true },
      { name: '⏳ Trạng thái', value: '🟡 **Đang chờ thanh toán...**', inline: true },
      { name: '⏰ Hạn thanh toán', value: `<t:${expiresTs}:R> (<t:${expiresTs}:f>)`, inline: false },
      { name: '🏦 Ngân hàng nhận', value: 'MBBank (`0828006916`)', inline: true },
      { name: '📝 Nội dung CK', value: `\`${billCode}\``, inline: true },
    ],
    image: { url: embedImageUrl },
    footer: { text: `Ryusei Bot Billing • Mã bill: ${billCode}` },
    timestamp: new Date().toISOString(),
  };

  const components = [
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 1,
          custom_id: `bill_check_${billCode}`,
          label: '🔄 Kiểm tra thanh toán',
        },
        {
          type: 2,
          style: 4,
          custom_id: `bill_cancel_${billCode}`,
          label: '❌ Hủy bill',
        },
      ],
    },
  ];

  await editInteractionReply(interaction.application_id, interaction.token, {
    content: customerUser ? `<@${customerUser}>` : undefined,
    embeds: [embed],
    components,
    allowed_mentions: { users: customerUser ? [customerUser] : [] },
  }, files);

  try {
    const msgRes = await discordRequest(`/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`) as { id?: string };
    if (msgRes?.id) {
      await updateBillMessageId(billCode, String(msgRes.id));
    }
  } catch (err) {
    console.error(`[TaoBill] Lỗi lưu message_id cho bill ${billCode}:`, err);
  }
}

async function handleBillCheckButton(interaction: DiscordInteraction, billCode: string): Promise<void> {
  const bill = await getBill(billCode);
  if (!bill) {
    await createFollowupMessage(interaction.application_id, interaction.token, {
      content: '❌ Không tìm thấy thông tin hóa đơn này.',
      flags: 64,
    });
    return;
  }

  if (bill.status === 'paid') {
    const paidTs = bill.paidAt ? Math.floor(bill.paidAt / 1000) : Math.floor(Date.now() / 1000);
    const amountFormatted = bill.amount.toLocaleString('vi-VN');
    const paidEmbed = {
      color: 0x2ECC71,
      author: { name: 'RYUSEI BILLING · XÁC NHẬN THANH TOÁN' },
      title: `✅ ĐÃ THANH TOÁN THÀNH CÔNG`,
      description:
        `🎉 Hóa đơn **${bill.id}** cho **${bill.title}** đã được thanh toán thành công qua MBBank VietQR!\n` +
        `──────────────────────────────────`,
      fields: [
        { name: '📦 Dịch vụ / Nội dung', value: `**${bill.title}**`, inline: true },
        { name: '💵 Số tiền đã nhận', value: `**${amountFormatted} VNĐ**`, inline: true },
        { name: '👤 Khách hàng', value: bill.customerId ? `<@${bill.customerId}>` : 'Thành viên', inline: true },
        { name: '🏦 Ngân hàng nhận', value: 'MBBank (`0828006916`)', inline: true },
        { name: '⏰ Thời gian thanh toán', value: `<t:${paidTs}:F>`, inline: false },
      ],
      footer: { text: `Ryusei Bot • Mã đơn: ${bill.id} • Trạng thái: PAID` },
      timestamp: new Date().toISOString(),
    };

    await editSource(interaction, {
      embeds: [paidEmbed],
      components: [],
    }).catch(console.error);

    await createFollowupMessage(interaction.application_id, interaction.token, {
      content: `✅ Hóa đơn \`${bill.id}\` đã được thanh toán thành công!`,
      flags: 64,
    });
    return;
  }

  if (bill.status === 'cancelled') {
    await createFollowupMessage(interaction.application_id, interaction.token, {
      content: `❌ Hóa đơn \`${bill.id}\` này đã bị hủy.`,
      flags: 64,
    });
    return;
  }

  if (bill.expiresAt && Date.now() > bill.expiresAt) {
    await expireBill(bill.id);

    const expiredEmbed = {
      color: 0x95A5A6,
      author: { name: 'RYUSEI BILLING · HẾT HẠN THANH TOÁN' },
      title: `⏰ HÓA ĐƠN ĐÃ HẾT HẠN`,
      description: `Hóa đơn mã \`${bill.id}\` cho **${bill.title}** đã hết hạn thanh toán (quá thời gian chờ).`,
      footer: { text: `Ryusei Bot Billing • Mã bill: ${bill.id}` },
      timestamp: new Date().toISOString(),
    };

    await editSource(interaction, {
      embeds: [expiredEmbed],
      components: [],
      attachments: [],
    }).catch(console.error);

    const messageId = bill.messageId || interaction.message?.id;
    const channelId = bill.channelId || interaction.channel_id;

    if (channelId && messageId && channelId !== 'DM') {
      await editChannelMessage(channelId, messageId, {
        embeds: [expiredEmbed],
        components: [],
        attachments: [],
      }).catch(console.error);
    }

    await createFollowupMessage(interaction.application_id, interaction.token, {
      content: `❌ Hóa đơn \`${bill.id}\` này đã hết hạn thanh toán (quá thời gian chờ).`,
      flags: 64,
    });
    return;
  }

  const expiresTs = bill.expiresAt ? Math.floor(bill.expiresAt / 1000) : 0;
  const timeText = expiresTs ? `\n⏰ Hạn thanh toán: <t:${expiresTs}:R>` : '';

  await createFollowupMessage(interaction.application_id, interaction.token, {
    content: `⏳ Hóa đơn \`${bill.id}\` (**${bill.amount.toLocaleString('vi-VN')}đ**) đang chờ thanh toán.${timeText}\n` +
      `👉 Bạn hãy mở App Ngân hàng quét mã VietQR và điền đúng nội dung \`${bill.id}\`. Hệ thống sẽ tự động xác nhận trong vài giây sau khi chuyển tiền!`,
    flags: 64,
  });
}

async function handleBillCancelButton(interaction: DiscordInteraction, billCode: string): Promise<void> {
  const actor = actorUser(interaction);
  const bill = await getBill(billCode);

  if (!bill) {
    await createFollowupMessage(interaction.application_id, interaction.token, {
      content: '❌ Không tìm thấy thông tin hóa đơn.',
      flags: 64,
    });
    return;
  }

  if (bill.status === 'paid') {
    await createFollowupMessage(interaction.application_id, interaction.token, {
      content: '🚫 Hóa đơn này đã được thanh toán, không thể hủy.',
      flags: 64,
    });
    return;
  }

  // Chỉ cho người tạo hoặc Admin mới được hủy
  if (actor.id !== bill.creatorId && actor.id !== SUPER_ADMIN_ID) {
    await createFollowupMessage(interaction.application_id, interaction.token, {
      content: '🚫 Chỉ người tạo hóa đơn mới có quyền bấm hủy hóa đơn này.',
      flags: 64,
    });
    return;
  }

  await cancelBill(billCode);

  const cancelEmbed = {
    color: THEME.crimson,
    title: `❌ HÓA ĐƠN ĐÃ BỊ HỦY`,
    description: `Hóa đơn mã \`${bill.id}\` cho dịch vụ **${bill.title}** đã bị hủy bởi <@${actor.id}>.`,
    footer: { text: `Ryusei Bot Billing • Bill ID: ${bill.id}` },
    timestamp: new Date().toISOString(),
  };

  // Cập nhật trực tiếp tin nhắn chứa nút bấm (hoạt động 100% kể cả trong DM)
  await editSource(interaction, {
    content: bill.customerId ? `<@${bill.customerId}>` : undefined,
    embeds: [cancelEmbed],
    components: [],
    attachments: [],
    allowed_mentions: { users: bill.customerId ? [bill.customerId] : [] },
  }).catch(err => console.error(`[BillCancel] Lỗi update embed hủy via editSource:`, err));

  const messageId = bill.messageId || interaction.message?.id;
  const channelId = bill.channelId || interaction.channel_id;

  if (channelId && messageId && channelId !== 'DM') {
    await editChannelMessage(channelId, messageId, {
      embeds: [cancelEmbed],
      components: [],
      attachments: [],
    }).catch(err => console.error(`[BillCancel] Lỗi update embed hủy via editChannelMessage:`, err));
  }

  await createFollowupMessage(interaction.application_id, interaction.token, {
    content: `✅ Đã hủy hóa đơn \`${billCode}\` thành công!`,
    flags: 64,
  });
}

async function handleThanhTuuCommand(interaction: DiscordInteraction): Promise<void> {
  const guildId = requireGuild(interaction);
  const actor = actorUser(interaction);
  const sub = subcommand(interaction);

  await checkEconomyAchievements(guildId, actor.id).catch(console.error);
  const myUnlockedIds = await getUserAchievements(actor.id);

  if (sub === 'all') {
    // Khai báo các danh mục hiện có trong Database của bạn
    const options = [
      { 
        label: 'Thành tựu Trận Đấu (Match)', 
        value: 'match', 
        description: 'Các thành tựu đạt được khi thi đấu xếp hạng',
        emoji: { name: '⚔️' }
      },
      { 
        label: 'Thành tựu Kinh Tế (Economy)', 
        value: 'economy', 
        description: 'Các thành tựu liên quan đến ví Ryucoin',
        emoji: { name: '💰' }
      },
      { 
        label: 'Thành tựu Đặc Biệt (Special)', 
        value: 'special', 
        description: 'Các thành tựu sự kiện, ẩn, danh hiệu độc quyền',
        emoji: { name: '✨' }
      }
    ];

    await reply(interaction, {
      embeds: [{
        color: THEME.ember,
        title: '📚 Từ Điển Thành Tựu Ryusei Bot',
        description: 'Bên dưới là các danh mục thành tựu hiện có. Vui lòng **chọn một danh mục** để xem danh sách chi tiết nhé!',
      }],
      components: [{
        type: 1, // Action Row
        components: [{
          type: 3, // String Select Menu
          custom_id: `view_ach_category_${actor.id}`, // Gắn ID người dùng để chống bấm hộ
          placeholder: 'Bấm vào đây để chọn danh mục...',
          options: options
        }]
      }],
      flags: 64
    });
    return;
  }

  if (sub === 'danh-sach') {
    if (myUnlockedIds.length === 0) {
      await reply(interaction, {
        embeds: [statusEmbed({ color: THEME.ember, title: '📭 Chưa có thành tựu', description: 'Bạn chưa mở khóa thành tựu nào. Hãy chăm chỉ thi đấu nhé!' })],
        flags: 64,
      });
      return;
    }

    // 👇 THÊM await VÀO ĐÂY ĐỂ LẤY DỮ LIỆU TỪ NEON DB
    const achList = await getAchievementsList();

    const lines = myUnlockedIds.map(id => {
      const ach = achList.find((a: any) => a.id === id);
      return ach ? `${ach.icon} **${ach.name}** - *${ach.description}*` : `❓ Thành tựu ẩn (${id})`;
    });

    await reply(interaction, {
      embeds: [{
        color: THEME.gold,
        title: '📜 Bộ Sưu Tập Thành Tựu Của Bạn',
        description: lines.join('\n\n'),
      }],
      flags: 64
    });
    return;
  }

  if (sub === 'chon') {
    if (myUnlockedIds.length === 0) {
      await reply(interaction, { content: '❌ Bạn chưa có thành tựu nào để trưng bày.', flags: 64 });
      return;
    }

    // 1. Lấy sẵn danh sách thành tựu từ DB ra trước (có await)
    const achList = await getAchievementsList();

    // 2. Dùng danh sách vừa lấy để map trực tiếp, không gọi hàm async bên trong nữa
    const options = myUnlockedIds.map(id => {
      const ach = achList.find((a: any) => a.id === id);
      if (!ach) return null;

      const opt: any = {
        label: ach.name.substring(0, 100),
        value: ach.id.substring(0, 100),
        description: ach.description ? ach.description.substring(0, 100) : 'Thành tựu cá nhân',
      };

      if (ach.icon) {
        const customEmojiMatch = ach.icon.match(/<a?:(\w+):(\d+)>/);
        if (customEmojiMatch) {
          opt.emoji = { name: customEmojiMatch[1], id: customEmojiMatch[2] };
        } else {
          opt.emoji = { name: ach.icon };
        }
      }
      return opt;
    }).filter(Boolean);

    // 2. Phòng hờ nếu mảng options trống
    if (options.length === 0) {
      await reply(interaction, { content: '❌ Không tìm thấy thông tin chi tiết của các thành tựu bạn đã mở khóa.', flags: 64 });
      return;
    }

    // 3. Gửi component lên Discord
    await reply(interaction, {
      content: '📌 **Chọn tối đa 3 thành tựu** bạn muốn hiển thị trên thẻ `/profile` của mình:',
      components: [{
        type: 1, // Action Row
        components: [{
          type: 3, // String Select Menu
          custom_id: `select_achievements_${actor.id}`,
          placeholder: 'Bấm vào đây để chọn thành tựu...',
          min_values: 0,
          max_values: Math.min(3, options.length), // Giới hạn max_values không được lớn hơn tổng số option thực tế
          options: options.slice(0, 25), // Discord giới hạn tối đa 25 option
        }]
      }],
      flags: 64 // Ephemeral message (chỉ người gõ thấy)
    });
  }
}

function buildFormModalData(interaction: DiscordInteraction) {
  const embed = interaction.message?.embeds?.[0];
  const formTitle = embed?.title || '📝 Đơn Đăng Ký / Hỗ Trợ';
  const modalTitle = formTitle.slice(0, 45);

  const fields: Array<{ name: string; value?: string }> = embed?.fields || [];
  const modalComponents: any[] = [];

  if (fields.length > 0) {
    const targetFields = fields.slice(0, 5);
    targetFields.forEach((field, index) => {
      const rawName = field.name.replace(/^[\d️⃣1️⃣2️⃣3️⃣4️⃣5️⃣#️⃣\s\.\-]+/, '').trim() || field.name;
      const label = rawName.slice(0, 45);
      modalComponents.push({
        type: 1,
        components: [
          {
            type: 4,
            custom_id: `input_form_field_${index}`,
            label: label,
            style: index === 0 ? 1 : 2,
            required: true,
          },
        ],
      });
    });
  } else {
    modalComponents.push({
      type: 1,
      components: [
        {
          type: 4,
          custom_id: 'input_form_field_0',
          label: 'Họ và tên / In-game Name',
          style: 1,
          required: true,
        },
      ],
    });
    modalComponents.push({
      type: 1,
      components: [
        {
          type: 4,
          custom_id: 'input_form_field_1',
          label: 'Lý do / Nội dung đăng ký',
          style: 2,
          required: true,
        },
      ],
    });
  }

  return {
    type: 9,
    data: {
      title: modalTitle,
      custom_id: 'form_submit',
      components: modalComponents,
    },
  };
}

async function handleFormModalSubmit(interaction: DiscordInteraction): Promise<void> {
  const actor = actorUser(interaction);
  const embed = interaction.message?.embeds?.[0];
  const formTitle = embed?.title || '📝 Đơn Đăng Ký / Hỗ Trợ';
  const embedFields: Array<{ name: string; value?: string }> = embed?.fields || [];

  const answers: Array<{ label: string; value: string }> = [];

  const components = interaction.data?.components || [];
  components.forEach((row: any, index: number) => {
    const input = row?.components?.[0];
    if (input) {
      let label = '';
      if (embedFields[index]?.name) {
        label = embedFields[index].name.replace(/^[\d️⃣1️⃣2️⃣3️⃣4️⃣5️⃣#️⃣\s\.\-]+/, '').trim() || embedFields[index].name;
      } else if (index === 0) {
        label = 'Họ và tên / In-game Name';
      } else if (index === 1) {
        label = 'Lý do / Nội dung đăng ký';
      } else {
        label = `Câu hỏi ${index + 1}`;
      }
      answers.push({
        label,
        value: (input.value || '').trim(),
      });
    }
  });

  const superAdminId = process.env.SUPER_ADMIN_ID || SUPER_ADMIN_ID;
  const guildName = interaction.guild?.name || 'Server Discord';
  const channelMention = interaction.channel_id ? `<#${interaction.channel_id}>` : 'N/A';
  const nowTs = Math.floor(Date.now() / 1000);

  const dmEmbed: Record<string, unknown> = {
    color: THEME.gold,
    title: `📥 [ĐƠN MỚI] ${formTitle}`,
    description: `Có đơn đăng ký / thông tin mới vừa được nộp từ **${guildName}**!`,
    fields: [
      {
        name: '👤 Người gửi',
        value: `<@${actor.id}> (\`${actor.username}\` | ID: \`${actor.id}\`)`,
        inline: true,
      },
      {
        name: '🏠 Server / Kênh',
        value: `**${guildName}** (${channelMention})`,
        inline: true,
      },
      {
        name: '⏰ Thời gian nộp',
        value: `<t:${nowTs}:F> (<t:${nowTs}:R>)`,
        inline: false,
      },
      ...answers.map((ans) => ({
        name: `📋 ${ans.label}`,
        value: ans.value || '*(Không điền)*',
        inline: false,
      })),
    ],
    footer: { text: 'Ryusei Bot • Form System (DM Super Admin)' },
    timestamp: new Date().toISOString(),
  };

  let dmSuccess = false;
  try {
    const dmChannel = await createDMChannel(superAdminId);
    await createMessage(dmChannel.id, { embeds: [dmEmbed] });
    dmSuccess = true;
  } catch (err) {
    console.error(`[Form] Lỗi gửi tin nhắn DM tới Super Admin (${superAdminId}):`, err);
  }

  await editInteractionReply(interaction.application_id, interaction.token, {
    embeds: [
      statusEmbed({
        title: '✅ Đã Nộp Đơn Thành Công!',
        description: dmSuccess
          ? `Cảm ơn <@${actor.id}>! Thông tin đơn của bạn đã được chuyển trực tiếp đến **Super Admin** qua tin nhắn riêng (DM).`
          : `Cảm ơn <@${actor.id}>! Đơn của bạn đã được tiếp nhận. (Lưu ý: Không thể gửi DM tới Super Admin do cài đặt riêng tư).`,
        color: THEME.win,
      }),
    ],
    flags: 64,
  });
}

async function handleFormCommand(interaction: DiscordInteraction): Promise<void> {
  const actor = actorUser(interaction);
  if (!hasManageGuild(interaction) && actor.id !== SUPER_ADMIN_ID) {
    throw new Error('Chỉ Admin (có quyền Quản Lý Server) mới được sử dụng lệnh tạo Form.');
  }

  const options = interaction.data?.options || [];
  const getOpt = (name: string) => options.find(o => o.name === name)?.value as string | undefined;

  const title = getOpt('title') || '📝 Đơn Đăng Ký / Hỗ Trợ';
  const description = getOpt('description') || 'Vui lòng bấm nút **📝 Điền Form** bên dưới để điền thông tin và gửi trực tiếp đến Super Admin.';
  const buttonLabel = getOpt('button_label') || '📝 Điền Form';

  const f1 = getOpt('field1');
  const f2 = getOpt('field2');
  const f3 = getOpt('field3');
  const f4 = getOpt('field4');
  const f5 = getOpt('field5');

  const rawFields = [f1, f2, f3, f4, f5].filter((f): f is string => Boolean(f && f.trim()));

  const fields: Array<{ name: string; value: string }> = [];

  if (rawFields.length > 0) {
    const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];
    rawFields.forEach((label, idx) => {
      fields.push({
        name: `${emojis[idx]} ${label}`,
        value: '*(Vui lòng bấm nút bên dưới để nhập)*',
      });
    });
  } else {
    fields.push({
      name: '1️⃣ Họ và tên / In-game Name',
      value: '*(Vui lòng bấm nút bên dưới để nhập)*',
    });
    fields.push({
      name: '2️⃣ Lý do / Nội dung đăng ký',
      value: '*(Vui lòng bấm nút bên dưới để nhập)*',
    });
  }

  const embed = statusEmbed({
    title: title.slice(0, 256),
    description: description.slice(0, 4096),
    color: THEME.ember,
    fields,
  });

  const components = [
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 1,
          custom_id: 'form_open',
          label: buttonLabel.slice(0, 80),
          emoji: { name: '📝' },
        },
      ],
    },
  ];

  await editInteractionReply(interaction.application_id, interaction.token, {
    embeds: [embed],
    components,
  });
}