import { neon, type NeonQueryFunction } from '@neondatabase/serverless';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { calculateElo } from '../ladder-core';
import { databaseUrl } from './env';
import { discordRequest } from './discord';
import type {
  FinalResult,
  LadderMatch,
  LadderSettings,
  MatchStatus,
  RatingRow,
} from './types';

// All revenue (shop, bet house edge, transfer tax) flows to the main server's bank
export const MAIN_GUILD_ID = '1520999265466450090';
// Only this user can run /ladder setup and server admin config commands
export const SUPER_ADMIN_ID = '873563860991365141';

type Sql = NeonQueryFunction<false, false>;
type DbRow = Record<string, unknown>;

async function fetchUserName(userId: string): Promise<string | undefined> {
  try {
    const user = await discordRequest(`/users/${userId}`) as { username?: string; global_name?: string | null };
    if (user?.global_name) return user.global_name;
    if (user?.username) return user.username;
  } catch (err) {
    console.error(`Lỗi fetch username cho ${userId}:`, err);
  }
  return undefined;
}

let sqlClient: Sql | undefined;
let pgPool: pg.Pool | undefined;
let schemaPromise: Promise<void> | undefined;
// Cache kiểu cột unlocked_wallpapers trong prod: một số DB cũ lưu dạng jsonb, DB mới là text[].
// Migrate cố convert về text[] nhưng có thể chưa chạy/kẹt lock, nên lệnh ghi phải tự thích ứng.
let unlockedWallpapersIsJsonb: boolean | undefined;

function getPgPool(): pg.Pool {
  if (!pgPool) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    pgPool = new pg.Pool({
      connectionString: databaseUrl(),
      ssl: { rejectUnauthorized: false },
      max: 10,
      keepAlive: true,
      // Fail fast when the DB is unreachable/paused instead of hanging until Vercel kills the
      // function at 60s (which leaves every command stuck on "thinking...").
      connectionTimeoutMillis: 7_000,
      statement_timeout: 20_000,
      query_timeout: 20_000,
      idleTimeoutMillis: 10_000,
    });
    pgPool.on('error', err => console.error('[pgPool] idle client error:', err.message));
  }
  return pgPool;
}

function sql(): Sql {
  if (!sqlClient) sqlClient = neon(databaseUrl(), { fetchOptions: { cache: 'no-store' } });
  return sqlClient;
}

async function query<T extends DbRow>(statement: string, params: unknown[] = []): Promise<T[]> {
  const url = databaseUrl();
  if (url.includes('neon.tech')) {
    return await sql().query(statement, params) as T[];
  }
  const res = await getPgPool().query(statement, params);
  return res.rows as T[];
}

async function executeTx<T = any>(
  queriesFn: (tx: { query: (stmt: string, p?: any[]) => Promise<any[]> }) => any[]
): Promise<T[]> {
  const url = databaseUrl();
  if (url.includes('neon.tech')) {
    return (await sql().transaction(queriesFn as any)) as unknown as T[];
  }
  const client = await getPgPool().connect();
  try {
    await client.query('BEGIN');
    const txAdapter = {
      query: async (stmt: string, p: any[] = []) => {
        const res = await client.query(stmt, p);
        return res.rows;
      },
    };
    const promiseOrArray = queriesFn(txAdapter);
    const results = Array.isArray(promiseOrArray) ? await Promise.all(promiseOrArray) : await promiseOrArray;
    await client.query('COMMIT');
    return results as unknown as T[];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function ensureSchema(): Promise<void> {
  if (!schemaPromise) schemaPromise = migrate().catch(error => {
    schemaPromise = undefined;
    throw error;
  });
  return schemaPromise;
}

async function migrate(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS ryusei_bills (
      id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      message_id TEXT,
      creator_id TEXT NOT NULL,
      customer_id TEXT,
      title TEXT NOT NULL,
      package_duration TEXT,
      amount INT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      payer_id TEXT,
      created_at BIGINT NOT NULL,
      paid_at BIGINT,
      expires_at BIGINT
    );
  `);
  await query(`ALTER TABLE ryusei_bills ADD COLUMN IF NOT EXISTS expires_at BIGINT;`).catch(() => undefined);
  await query(`
    CREATE TABLE IF NOT EXISTS ryusei_sell_shiny (
      id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      message_id TEXT,
      announce_message_id TEXT,
      seller_id TEXT NOT NULL,
      item_name TEXT NOT NULL,
      price BIGINT NOT NULL,
      image_url TEXT,
      mode TEXT DEFAULT 'direct',
      total_slots INT DEFAULT 1,
      sold_slots INT DEFAULT 0,
      status TEXT DEFAULT 'open',
      buyer_id TEXT,
      created_at BIGINT NOT NULL,
      completed_at BIGINT,
      ticket_channel_id TEXT
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS ryusei_sell_shiny_tickets (
      id TEXT PRIMARY KEY,
      listing_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      created_at BIGINT NOT NULL
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS ryusei_warnings (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      created_at BIGINT NOT NULL
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS ryusei_blacklist (
      guild_id TEXT NOT NULL,
      user_id TEXT PRIMARY KEY,
      expires_at BIGINT NOT NULL
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS ryusei_giveaways (
      id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      channel_id TEXT,
      message_id TEXT,
      question TEXT,
      answer TEXT,
      reward TEXT,
      image_url TEXT,
      created_at BIGINT NOT NULL,
      claimed_by_name TEXT,
      claimed_by_id TEXT,
      claimed_at BIGINT
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS ryusei_ladder_settings (
      guild_id TEXT PRIMARY KEY,
      mod_role_id TEXT,
      match_category_id TEXT,
      leaderboard_channel_id TEXT,
      leaderboard_message_id TEXT,
      leaderboard_scope TEXT DEFAULT 'guild',
      scheduled_season_name TEXT,
      scheduled_season_end BIGINT,
      scheduled_season_reset_mode TEXT,
      hall_of_fame_channel_id TEXT,
      hall_of_fame_role_id TEXT,
      top_role_ids TEXT[],
      current_top_users TEXT[]
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS ryusei_global_ratings (
      user_id TEXT PRIMARY KEY,
      rating INT DEFAULT 1000,
      wins INT DEFAULT 0,
      losses INT DEFAULT 0,
      draws INT DEFAULT 0,
      streak INT DEFAULT 0,
      max_streak INT DEFAULT 0,
      coins BIGINT DEFAULT 0,
      updated_at BIGINT
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS ryusei_server_members (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      joined_at BIGINT NOT NULL,
      last_active_at BIGINT NOT NULL,
      PRIMARY KEY (guild_id, user_id)
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS ryusei_ladder_matches (
      id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      thread_id TEXT,
      challenger_id TEXT NOT NULL,
      opponent_id TEXT NOT NULL,
      challenger_name TEXT,
      opponent_name TEXT,
      status TEXT NOT NULL,
      proposed_winner_id TEXT,
      proposed_by_id TEXT,
      confirmation_deadline BIGINT,
      created_at BIGINT NOT NULL,
      started_at BIGINT,
      ended_at BIGINT,
      winner_user_id TEXT,
      resolution_note TEXT,
      resolution_token TEXT,
      control_message_id TEXT,
      proof_image_url TEXT
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS ryusei_ladder_seasons_history (
      id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      season_name TEXT NOT NULL,
      ended_at BIGINT NOT NULL,
      top_players_json TEXT
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS ryusei_match_proofs (
      id TEXT PRIMARY KEY,
      match_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      image_url TEXT NOT NULL,
      created_at BIGINT NOT NULL
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS ryusei_ladder_queue (
      user_id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      channel_id TEXT,
      user_name TEXT NOT NULL,
      rating INT NOT NULL,
      joined_at BIGINT NOT NULL,
      interaction_token TEXT
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS ryusei_achievements_config (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      name TEXT NOT NULL,
      icon TEXT,
      description TEXT,
      reward_coins INT DEFAULT 0,
      reward_role_id TEXT,
      condition_type TEXT,
      condition_value TEXT
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS ryusei_user_achievements (
      user_id TEXT NOT NULL,
      achievement_id TEXT NOT NULL,
      unlocked_at BIGINT NOT NULL,
      PRIMARY KEY (user_id, achievement_id)
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS ryusei_bets (
      id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      message_id TEXT,
      creator_id TEXT NOT NULL,
      match_id TEXT,
      title TEXT NOT NULL,
      option_a TEXT NOT NULL,
      option_b TEXT NOT NULL,
      total_a BIGINT DEFAULT 0,
      total_b BIGINT DEFAULT 0,
      status TEXT DEFAULT 'open',
      winning_option TEXT,
      created_at BIGINT NOT NULL,
      closed_at BIGINT
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS ryusei_bet_entries (
      id TEXT PRIMARY KEY,
      bet_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      option TEXT NOT NULL,
      amount BIGINT NOT NULL,
      created_at BIGINT NOT NULL
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS ryusei_bank (
      guild_id TEXT PRIMARY KEY,
      balance BIGINT DEFAULT 0
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS ryusei_daily_role_rewards (
      guild_id TEXT NOT NULL,
      role_id TEXT NOT NULL,
      reward_coins BIGINT NOT NULL,
      PRIMARY KEY (guild_id, role_id)
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS ryusei_custom_backgrounds (
      user_id TEXT PRIMARY KEY,
      image_url TEXT NOT NULL,
      updated_at BIGINT NOT NULL
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS ryusei_custom_thumbnails (
      user_id TEXT PRIMARY KEY,
      image_url TEXT NOT NULL,
      updated_at BIGINT NOT NULL
    );
  `);

  await query(`ALTER TABLE ryusei_sell_shiny ADD COLUMN IF NOT EXISTS mode TEXT DEFAULT 'direct'`);
  await query(`ALTER TABLE ryusei_sell_shiny ADD COLUMN IF NOT EXISTS total_slots INT DEFAULT 1`);
  await query(`ALTER TABLE ryusei_sell_shiny ADD COLUMN IF NOT EXISTS sold_slots INT DEFAULT 0`);
  await query(`ALTER TABLE ryusei_sell_shiny ADD COLUMN IF NOT EXISTS announce_message_id TEXT`);

  await query(`ALTER TABLE ryusei_ladder_queue ADD COLUMN IF NOT EXISTS interaction_token TEXT`);
  await query(`ALTER TABLE ryusei_ladder_queue ADD COLUMN IF NOT EXISTS channel_id TEXT`);
  await query(`ALTER TABLE ryusei_ladder_queue ALTER COLUMN channel_id DROP NOT NULL`);

  // unlocked_wallpapers: đảm bảo cột tồn tại dạng text[] (DB mới) và convert cột
  // jsonb cũ trong prod về text[]. Toàn bộ code ghi cột này bằng array_append /
  // $::text[], nên cột jsonb gây lỗi "is of type jsonb but expression is of type text[]".
  await query(`ALTER TABLE ryusei_global_ratings ADD COLUMN IF NOT EXISTS unlocked_wallpapers text[] DEFAULT ARRAY['default']::text[]`);
  try {
    await query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'ryusei_global_ratings'
            AND column_name = 'unlocked_wallpapers'
            AND data_type = 'jsonb'
        ) THEN
          ALTER TABLE ryusei_global_ratings ALTER COLUMN unlocked_wallpapers DROP DEFAULT;
          ALTER TABLE ryusei_global_ratings
            ALTER COLUMN unlocked_wallpapers TYPE text[]
            USING (
              CASE
                WHEN unlocked_wallpapers IS NULL THEN ARRAY['default']::text[]
                ELSE translate(unlocked_wallpapers::text, '[]"', '{}')::text[]
              END
            );
          ALTER TABLE ryusei_global_ratings ALTER COLUMN unlocked_wallpapers SET DEFAULT ARRAY['default']::text[];
        END IF;
      END $$;
    `);
  } catch (err) {
    console.error('[migrate] Không thể chuẩn hoá cột unlocked_wallpapers về text[]:', err);
  }

  // Đảm bảo cấu hình thành tựu eco_10k có condition_type đúng là 'expression'
  await query(`UPDATE ryusei_achievements_config SET condition_type = 'expression' WHERE id = 'eco_10k' AND condition_type != 'expression'`).catch(() => null);

  await query(`
    UPDATE ryusei_sell_shiny s
    SET sold_slots = (
      SELECT COUNT(*)::int FROM ryusei_sell_shiny_tickets t WHERE t.listing_id = s.id
    )
    WHERE s.mode = 'lottery'
  `);
}

export async function addWarningAndBlacklist(guildId: string, userId: string, reason: string): Promise<{ strikeCount: number; days: number; expiresAt: number }> {
  await ensureSchema();
  const now = Date.now();

  // Lưu lịch sử cảnh cáo
  await query(
    `INSERT INTO ryusei_warnings (guild_id, user_id, reason, created_at) VALUES ($1, $2, $3, $4)`,
    [guildId, userId, reason, now]
  );

  // Đếm tổng số lần bị cảnh cáo
  const countRes = await query(`SELECT COUNT(*) as cnt FROM ryusei_warnings WHERE guild_id = $1 AND user_id = $2`, [guildId, userId]);
  const row = countRes[0] as { cnt?: string | number } | undefined;
  const strikeCount = parseInt(String(row?.cnt || '1'), 10);

  // Xác định số ngày phạt dựa trên số lần vi phạm
  let days = 3;
  if (strikeCount === 2) days = 7;
  else if (strikeCount === 3) days = 30;
  else if (strikeCount >= 4) days = -1; // -1 biểu thị vĩnh viễn

  const expiresAt = days === -1 ? 0 : now + days * 24 * 60 * 60 * 1000;

  // Cập nhật hoặc thêm vào bảng Blacklist
  await query(
    `INSERT INTO ryusei_blacklist (guild_id, user_id, expires_at) VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET expires_at = $3, guild_id = $1`,
    [guildId, userId, expiresAt]
  );

  return { strikeCount, days, expiresAt };
}

export async function getUserWarnings(guildId: string, userId: string) {
  await ensureSchema();
  const res = await query(`SELECT * FROM ryusei_warnings WHERE guild_id = $1 AND user_id = $2 ORDER BY created_at DESC`, [guildId, userId]);
  return res;
}

export async function clearUserWarnings(guildId: string, userId: string): Promise<void> {
  await ensureSchema();
  await query(`DELETE FROM ryusei_warnings WHERE guild_id = $1 AND user_id = $2`, [guildId, userId]);
  await query(`DELETE FROM ryusei_blacklist WHERE guild_id = $1 AND user_id = $2`, [guildId, userId]);
}

export async function getActiveBlacklist(guildId: string) {
  await ensureSchema();
  const res = await query(`SELECT * FROM ryusei_blacklist WHERE guild_id = $1`, [guildId]);
  return res;
}

export async function createGiveaway(id: string, guildId: string): Promise<void> {
  await ensureSchema();
  await query(
    `INSERT INTO ryusei_giveaways (id, guild_id, created_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (id) DO NOTHING`,
    [id, guildId, Date.now()],
  );
}

export async function createQuestionGiveaway(input: {
  id: string;
  guildId: string;
  channelId: string;
  question: string;
  answer: string;
  reward?: string;
  imageUrl?: string;
}): Promise<void> {
  await ensureSchema();
  await query(
    `INSERT INTO ryusei_giveaways (id, guild_id, channel_id, question, answer, reward, image_url, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (id) DO NOTHING`,
    [
      input.id,
      input.guildId,
      input.channelId,
      input.question,
      input.answer,
      input.reward || null,
      input.imageUrl || null,
      Date.now(),
    ],
  );
}

export async function updateGiveawayMessageId(id: string, messageId: string): Promise<void> {
  await ensureSchema();
  await query(
    `UPDATE ryusei_giveaways SET message_id = $2 WHERE id = $1`,
    [id, messageId],
  );
}

export async function getGiveaway(id: string): Promise<{
  id: string;
  guildId: string;
  channelId?: string;
  messageId?: string;
  question?: string;
  answer?: string;
  reward?: string;
  imageUrl?: string;
  claimedBy?: string;
  claimedByName?: string;
  claimedAt?: number;
  createdAt: number;
} | undefined> {
  await ensureSchema();
  const [row] = await query(`SELECT * FROM ryusei_giveaways WHERE id = $1`, [id]);
  if (!row) return undefined;
  return {
    id: String(row.id),
    guildId: String(row.guild_id),
    channelId: row.channel_id ? String(row.channel_id) : undefined,
    messageId: row.message_id ? String(row.message_id) : undefined,
    question: row.question ? String(row.question) : undefined,
    answer: row.answer ? String(row.answer) : undefined,
    reward: row.reward ? String(row.reward) : undefined,
    imageUrl: row.image_url ? String(row.image_url) : undefined,
    claimedBy: row.claimed_by ? String(row.claimed_by) : undefined,
    claimedByName: row.claimed_by_name ? String(row.claimed_by_name) : undefined,
    claimedAt: row.claimed_at ? Number(row.claimed_at) : undefined,
    createdAt: Number(row.created_at),
  };
}

export async function claimGiveaway(
  id: string,
  userId: string,
  userName: string,
): Promise<{ claimed: boolean; claimedByName: string | null }> {
  await ensureSchema();
  const rows = await query(
    `UPDATE ryusei_giveaways
     SET claimed_by = $2, claimed_by_name = $3, claimed_at = $4
     WHERE id = $1 AND claimed_by IS NULL
     RETURNING claimed_by_name`,
    [id, userId, userName, Date.now()],
  );
  if (rows.length > 0) return { claimed: true, claimedByName: userName };
  const [existing] = await query(
    `SELECT claimed_by_name FROM ryusei_giveaways WHERE id = $1`,
    [id],
  );
  return { claimed: false, claimedByName: existing ? String(existing.claimed_by_name ?? '') : null };
}

export interface SellShinyRow {
  id: string;
  guildId: string;
  channelId: string;
  messageId: string | null;
  announceMessageId: string | null;
  sellerId: string;
  itemName: string;
  price: number;
  imageUrl: string | null;
  mode: 'direct' | 'lottery';
  totalSlots: number;
  soldSlots: number;
  status: 'open' | 'completed';
  buyerId: string | null;
  createdAt: number;
  completedAt: number | null;
  ticketChannelId: string | null;
}

export interface SellShinyTicketRow {
  id: string;
  listingId: string;
  userId: string;
  userName: string;
  createdAt: number;
}

export async function createSellShinyListing(input: {
  id: string;
  guildId: string;
  channelId: string;
  sellerId: string;
  itemName: string;
  price: number;
  imageUrl?: string;
  mode?: 'direct' | 'lottery';
  totalSlots?: number;
}): Promise<void> {
  await ensureSchema();
  await query(
    `INSERT INTO ryusei_sell_shiny (id, guild_id, channel_id, seller_id, item_name, price, image_url, mode, total_slots, sold_slots, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, 'open', $10)
     ON CONFLICT (id) DO NOTHING`,
    [
      input.id,
      input.guildId,
      input.channelId,
      input.sellerId,
      input.itemName,
      input.price,
      input.imageUrl || null,
      input.mode || 'direct',
      input.totalSlots || 1,
      Date.now(),
    ],
  );
}

export async function updateSellShinyMessageId(id: string, messageId: string): Promise<void> {
  await ensureSchema();
  await query(
    `UPDATE ryusei_sell_shiny SET message_id = $2 WHERE id = $1`,
    [id, messageId],
  );
}

export async function updateSellShinyAnnounceMessageId(id: string, announceMessageId: string): Promise<void> {
  await ensureSchema();
  await query(
    `UPDATE ryusei_sell_shiny SET announce_message_id = $2 WHERE id = $1`,
    [id, announceMessageId],
  );
}

export async function getSellShinyListing(id: string): Promise<SellShinyRow | null> {
  await ensureSchema();
  const rows = await query<DbRow>(
    `SELECT id, guild_id as "guildId", channel_id as "channelId", message_id as "messageId", announce_message_id as "announceMessageId", seller_id as "sellerId", item_name as "itemName", price, image_url as "imageUrl", mode, total_slots as "totalSlots", sold_slots as "soldSlots", status, buyer_id as "buyerId", created_at as "createdAt", completed_at as "completedAt", ticket_channel_id as "ticketChannelId"
     FROM ryusei_sell_shiny WHERE id = $1`,
    [id],
  );
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    id: String(r.id),
    guildId: String(r.guildId),
    channelId: String(r.channelId),
    messageId: r.messageId ? String(r.messageId) : null,
    announceMessageId: r.announceMessageId ? String(r.announceMessageId) : null,
    sellerId: String(r.sellerId),
    itemName: String(r.itemName),
    price: Number(r.price),
    imageUrl: r.imageUrl ? String(r.imageUrl) : null,
    mode: (r.mode as 'direct' | 'lottery') || 'direct',
    totalSlots: Number(r.totalSlots || 1),
    soldSlots: Number(r.soldSlots || 0),
    status: r.status as 'open' | 'completed',
    buyerId: r.buyerId ? String(r.buyerId) : null,
    createdAt: Number(r.createdAt),
    completedAt: r.completedAt ? Number(r.completedAt) : null,
    ticketChannelId: r.ticketChannelId ? String(r.ticketChannelId) : null,
  };
}

export async function getSellShinyListingByTicketChannelId(ticketChannelId: string): Promise<SellShinyRow | null> {
  await ensureSchema();
  const rows = await query<DbRow>(
    `SELECT id, guild_id as "guildId", channel_id as "channelId", message_id as "messageId", announce_message_id as "announceMessageId", seller_id as "sellerId", item_name as "itemName", price, image_url as "imageUrl", mode, total_slots as "totalSlots", sold_slots as "soldSlots", status, buyer_id as "buyerId", created_at as "createdAt", completed_at as "completedAt", ticket_channel_id as "ticketChannelId"
     FROM ryusei_sell_shiny WHERE ticket_channel_id = $1`,
    [ticketChannelId],
  );
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    id: String(r.id),
    guildId: String(r.guildId),
    channelId: String(r.channelId),
    messageId: r.messageId ? String(r.messageId) : null,
    announceMessageId: r.announceMessageId ? String(r.announceMessageId) : null,
    sellerId: String(r.sellerId),
    itemName: String(r.itemName),
    price: Number(r.price),
    imageUrl: r.imageUrl ? String(r.imageUrl) : null,
    mode: (r.mode as 'direct' | 'lottery') || 'direct',
    totalSlots: Number(r.totalSlots || 1),
    soldSlots: Number(r.soldSlots || 0),
    status: r.status as 'open' | 'completed',
    buyerId: r.buyerId ? String(r.buyerId) : null,
    createdAt: Number(r.createdAt),
    completedAt: r.completedAt ? Number(r.completedAt) : null,
    ticketChannelId: r.ticketChannelId ? String(r.ticketChannelId) : null,
  };
}

export async function buySellShinyListing(input: {
  id: string;
  buyerId: string;
  ticketChannelId: string;
}): Promise<SellShinyRow | null> {
  await ensureSchema();
  const now = Date.now();
  const rows = await query<DbRow>(
    `UPDATE ryusei_sell_shiny
     SET status = 'completed', buyer_id = $1, completed_at = $2, ticket_channel_id = $3
     WHERE id = $4 AND status = 'open'
     RETURNING id, guild_id as "guildId", channel_id as "channelId", message_id as "messageId", announce_message_id as "announceMessageId", seller_id as "sellerId", item_name as "itemName", price, image_url as "imageUrl", mode, total_slots as "totalSlots", sold_slots as "soldSlots", status, buyer_id as "buyerId", created_at as "createdAt", completed_at as "completedAt", ticket_channel_id as "ticketChannelId"`,
    [input.buyerId, now, input.ticketChannelId, input.id],
  );
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    id: String(r.id),
    guildId: String(r.guildId),
    channelId: String(r.channelId),
    messageId: r.messageId ? String(r.messageId) : null,
    announceMessageId: r.announceMessageId ? String(r.announceMessageId) : null,
    sellerId: String(r.sellerId),
    itemName: String(r.itemName),
    price: Number(r.price),
    imageUrl: r.imageUrl ? String(r.imageUrl) : null,
    mode: (r.mode as 'direct' | 'lottery') || 'direct',
    totalSlots: Number(r.totalSlots || 1),
    soldSlots: Number(r.soldSlots || 0),
    status: r.status as 'open' | 'completed',
    buyerId: r.buyerId ? String(r.buyerId) : null,
    createdAt: Number(r.createdAt),
    completedAt: r.completedAt ? Number(r.completedAt) : null,
    ticketChannelId: r.ticketChannelId ? String(r.ticketChannelId) : null,
  };
}

export async function buySellShinyStock(input: {
  id: string;
  buyerId: string;
  ticketChannelId: string;
}): Promise<{ success: boolean; listing: SellShinyRow | null }> {
  await ensureSchema();
  const now = Date.now();
  const rows = await query<DbRow>(
    `UPDATE ryusei_sell_shiny
     SET sold_slots = sold_slots + 1,
         status = CASE WHEN sold_slots + 1 >= total_slots THEN 'completed' ELSE status END,
         completed_at = CASE WHEN sold_slots + 1 >= total_slots THEN $2 ELSE completed_at END,
         buyer_id = $1,
         ticket_channel_id = $3
     WHERE id = $4 AND status = 'open' AND sold_slots < total_slots
     RETURNING id, guild_id as "guildId", channel_id as "channelId", message_id as "messageId", announce_message_id as "announceMessageId", seller_id as "sellerId", item_name as "itemName", price, image_url as "imageUrl", mode, total_slots as "totalSlots", sold_slots as "soldSlots", status, buyer_id as "buyerId", created_at as "createdAt", completed_at as "completedAt", ticket_channel_id as "ticketChannelId"`,
    [input.buyerId, now, input.ticketChannelId, input.id],
  );
  if (!rows[0]) return { success: false, listing: null };
  const r = rows[0];
  return {
    success: true,
    listing: {
      id: String(r.id),
      guildId: String(r.guildId),
      channelId: String(r.channelId),
      messageId: r.messageId ? String(r.messageId) : null,
      announceMessageId: r.announceMessageId ? String(r.announceMessageId) : null,
      sellerId: String(r.sellerId),
      itemName: String(r.itemName),
      price: Number(r.price),
      imageUrl: r.imageUrl ? String(r.imageUrl) : null,
      mode: (r.mode as 'direct' | 'lottery') || 'direct',
      totalSlots: Number(r.totalSlots || 1),
      soldSlots: Number(r.soldSlots || 0),
      status: r.status as 'open' | 'completed',
      buyerId: r.buyerId ? String(r.buyerId) : null,
      createdAt: Number(r.createdAt),
      completedAt: r.completedAt ? Number(r.completedAt) : null,
      ticketChannelId: r.ticketChannelId ? String(r.ticketChannelId) : null,
    },
  };
}

export async function updateSellShinyStock(id: string, newRemainingStock: number): Promise<SellShinyRow | null> {
  await ensureSchema();
  const listing = await getSellShinyListing(id);
  if (!listing) return null;

  const newTotalSlots = listing.soldSlots + newRemainingStock;
  const newStatus = newRemainingStock > 0 ? 'open' : 'completed';
  const completedAt = newRemainingStock > 0 ? null : Date.now();

  await query(
    `UPDATE ryusei_sell_shiny
     SET total_slots = $2, status = $3, completed_at = $4
     WHERE id = $1`,
    [id, newTotalSlots, newStatus, completedAt],
  );

  return await getSellShinyListing(id);
}


export async function buySellShinyTicket(input: {
  ticketId: string;
  listingId: string;
  userId: string;
  userName: string;
}): Promise<{ success: boolean; soldSlots: number; totalSlots: number }> {
  await ensureSchema();

  const listing = await getSellShinyListing(input.listingId);
  if (!listing || listing.status !== 'open') {
    return { success: false, soldSlots: listing?.soldSlots || 0, totalSlots: listing?.totalSlots || 0 };
  }

  // Insert ticket first
  await query(
    `INSERT INTO ryusei_sell_shiny_tickets (id, listing_id, user_id, user_name, created_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [input.ticketId, input.listingId, input.userId, input.userName, Date.now()]
  );

  // Sync sold_slots with exact ticket count from ryusei_sell_shiny_tickets
  const countRows = await query<DbRow>(
    `SELECT COUNT(*)::int as count FROM ryusei_sell_shiny_tickets WHERE listing_id = $1`,
    [input.listingId]
  );
  const actualTicketsCount = Number(countRows[0]?.count || 1);

  if (actualTicketsCount > listing.totalSlots) {
    // Exceeded total slots, revert this ticket
    await query(`DELETE FROM ryusei_sell_shiny_tickets WHERE id = $1`, [input.ticketId]);
    await query(`UPDATE ryusei_sell_shiny SET sold_slots = total_slots WHERE id = $1`, [input.listingId]);
    return { success: false, soldSlots: listing.totalSlots, totalSlots: listing.totalSlots };
  }

  await query(
    `UPDATE ryusei_sell_shiny SET sold_slots = $2 WHERE id = $1`,
    [input.listingId, actualTicketsCount]
  );

  return { success: true, soldSlots: actualTicketsCount, totalSlots: listing.totalSlots };
}

export async function getSellShinyTickets(listingId: string): Promise<SellShinyTicketRow[]> {
  await ensureSchema();
  const rows = await query<DbRow>(
    `SELECT id, listing_id as "listingId", user_id as "userId", user_name as "userName", created_at as "createdAt"
     FROM ryusei_sell_shiny_tickets
     WHERE listing_id = $1 ORDER BY created_at ASC`,
    [listingId]
  );
  return rows.map(r => ({
    id: String(r.id),
    listingId: String(r.listingId),
    userId: String(r.userId),
    userName: String(r.userName),
    createdAt: Number(r.createdAt),
  }));
}

export async function getExpiredCompletedSellShinyListings(expirationMs: number = 5 * 60_000): Promise<SellShinyRow[]> {
  await ensureSchema();
  const cutoff = Date.now() - expirationMs;
  const rows = await query<DbRow>(
    `SELECT id, guild_id as "guildId", channel_id as "channelId", message_id as "messageId", announce_message_id as "announceMessageId"
     FROM ryusei_sell_shiny
     WHERE status = 'completed' AND completed_at IS NOT NULL AND completed_at <= $1`,
    [cutoff],
  );
  return rows.map(r => ({
    id: String(r.id),
    guildId: String(r.guildId),
    channelId: String(r.channelId),
    messageId: r.messageId ? String(r.messageId) : null,
    announceMessageId: r.announceMessageId ? String(r.announceMessageId) : null,
    sellerId: '',
    itemName: '',
    price: 0,
    imageUrl: null,
    mode: 'direct',
    totalSlots: 1,
    soldSlots: 0,
    status: 'completed',
    buyerId: null,
    createdAt: 0,
    completedAt: 0,
    ticketChannelId: null,
  }));
}

export async function deleteSellShinyListings(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await ensureSchema();
  await query(
    `DELETE FROM ryusei_sell_shiny_tickets WHERE listing_id = ANY($1::text[])`,
    [ids],
  );
  await query(
    `DELETE FROM ryusei_sell_shiny WHERE id = ANY($1::text[])`,
    [ids],
  );
}

function matchFrom(row: DbRow): LadderMatch {
  return {
    id: String(row.id),
    guildId: String(row.guild_id),
    channelId: String(row.channel_id),
    matchChannelId: row.thread_id ? String(row.thread_id) : undefined,
    challengerId: String(row.challenger_id),
    challengerName: String(row.challenger_name || row.challenger_id),
    opponentId: String(row.opponent_id),
    opponentName: String(row.opponent_name || row.opponent_id),
    status: row.status as MatchStatus,
    proposedWinnerId: row.proposed_winner_id ? String(row.proposed_winner_id) : undefined,
    proposedById: row.proposed_by_id ? String(row.proposed_by_id) : undefined,
    confirmationDeadline: row.confirmation_deadline ? Number(row.confirmation_deadline) : undefined,
    createdAt: Number(row.created_at),
    startedAt: row.started_at ? Number(row.started_at) : undefined,
    endedAt: row.ended_at ? Number(row.ended_at) : undefined,
    winnerUserId: row.winner_user_id ? String(row.winner_user_id) : undefined,
    resolutionNote: row.resolution_note ? String(row.resolution_note) : undefined,
    controlMessageId: row.control_message_id ? String(row.control_message_id) : undefined,
    proofImageUrl: row.proof_image_url ? String(row.proof_image_url) : undefined,
  };
}

function ratingFrom(row: DbRow): RatingRow {
  const wins = Number(row.wins || 0);
  const losses = Number(row.losses || 0);
  const draws = Number(row.draws || 0);
  const rawRating = Number(row.rating);
  const rating = (!rawRating || isNaN(rawRating)) ? 1000 : rawRating;
  return {
    userId: String(row.user_id),
    userName: row.user_name ? String(row.user_name) : undefined,
    rating,
    wins,
    losses,
    draws,
    peakRating: row.peak_rating ? Number(row.peak_rating) : rating,
    ryucoin: Number(row.ryucoin) || 0,
    wallpaperId: row.wallpaper_id ? String(row.wallpaper_id) : 'default',
    unlockedWallpapers: Array.isArray(row.unlocked_wallpapers) ? row.unlocked_wallpapers : ['default'],
    dailyStreak: Number(row.daily_streak) || 0,
    lastDailyClaim: Number(row.last_daily_claim) || 0,
    matches: wins + losses + draws,
    updatedAt: row.updated_at ? Number(row.updated_at) : undefined,
    thumbnailUrl: row.thumbnail_url ? String(row.thumbnail_url) : undefined,
    selected_achievements: row.selected_achievements ? String(row.selected_achievements) : '[]',
  };
}

function settingsFrom(row: DbRow): LadderSettings {
  return {
    guildId: String(row.guild_id),
    modRoleIds: Array.isArray(row.mod_role_ids) && row.mod_role_ids.length
      ? row.mod_role_ids.map(String)
      : row.mod_role_id ? [String(row.mod_role_id)] : [],
    resultTimeoutMinutes: Number(row.result_timeout_minutes),
    logChannelId: row.log_channel_id ? String(row.log_channel_id) : undefined,
    matchCategoryId: row.match_category_id ? String(row.match_category_id) : undefined,
    leaderboardChannelId: row.leaderboard_channel_id ? String(row.leaderboard_channel_id) : undefined,
    leaderboardMessageId: row.leaderboard_message_id ? String(row.leaderboard_message_id) : undefined,
    leaderboardScope: row.leaderboard_scope === 'server' ? 'server' : 'global',
    scheduledSeasonName: row.scheduled_season_name ? String(row.scheduled_season_name) : undefined,
    scheduledSeasonEnd: row.scheduled_season_end ? Number(row.scheduled_season_end) : undefined,
    scheduledSeasonResetMode: row.scheduled_season_reset_mode ? String(row.scheduled_season_reset_mode) : undefined,
    hallOfFameChannelId: row.hall_of_fame_channel_id ? String(row.hall_of_fame_channel_id) : undefined,
    hallOfFameRoleId: row.hall_of_fame_role_id ? String(row.hall_of_fame_role_id) : undefined,
    topRoleIds: Array.isArray(row.top_role_ids) ? row.top_role_ids.map(String) : [],
    currentTopUsers: Array.isArray(row.current_top_users) ? row.current_top_users.map(String) : [],
    defaultDailyRoleId: row.default_daily_role_id ? String(row.default_daily_role_id) : undefined,
  };
}

export async function getSettings(guildId: string): Promise<LadderSettings> {
  await ensureSchema();
  const [row] = await query(`SELECT * FROM ryusei_ladder_settings WHERE guild_id = $1`, [guildId]);
  return row ? settingsFrom(row) : { guildId, modRoleIds: [], resultTimeoutMinutes: 10 };
}

export async function setSettings(
  guildId: string,
  modRoleIds: string[],
  resultTimeoutMinutes: number,
  logChannelId?: string,
  matchCategoryId?: string,
): Promise<LadderSettings> {
  await ensureSchema();
  const uniqueRoleIds = [...new Set(modRoleIds)].slice(0, 5);
  if (!uniqueRoleIds.length) throw new Error('Cần cấu hình ít nhất một role Mod.');
  const [row] = await query(`INSERT INTO ryusei_ladder_settings
    (guild_id, mod_role_id, mod_role_ids, result_timeout_minutes, log_channel_id, match_category_id, updated_at)
    VALUES ($1, $2, $3::text[], $4, $5, $6, $7)
    ON CONFLICT (guild_id) DO UPDATE SET mod_role_id = EXCLUDED.mod_role_id,
      mod_role_ids = EXCLUDED.mod_role_ids, result_timeout_minutes = EXCLUDED.result_timeout_minutes,
      log_channel_id = EXCLUDED.log_channel_id,
      match_category_id = COALESCE(EXCLUDED.match_category_id, ryusei_ladder_settings.match_category_id),
      updated_at = EXCLUDED.updated_at
    RETURNING *`, [guildId, uniqueRoleIds[0], uniqueRoleIds, resultTimeoutMinutes, logChannelId || null, matchCategoryId || null, Date.now()]);
  if (!row) throw new Error('Không lưu được cấu hình ladder.');
  return settingsFrom(row);
}

export async function setMatchCategory(guildId: string, categoryId?: string): Promise<void> {
  await ensureSchema();
  await query(
    `UPDATE ryusei_ladder_settings SET match_category_id = $2 WHERE guild_id = $1`,
    [guildId, categoryId || null],
  );
}

export async function setLeaderboardMessage(
  guildId: string,
  channelId: string | undefined,
  messageId: string | undefined,
  scope: 'server' | 'global' = 'global',
): Promise<void> {
  await ensureSchema();
  await query(
    `UPDATE ryusei_ladder_settings SET leaderboard_channel_id = $2, leaderboard_message_id = $3, leaderboard_scope = $4 WHERE guild_id = $1`,
    [guildId, channelId || null, messageId || null, scope],
  );
}

export async function getAllLiveBoardSettings(): Promise<{ guildId: string; channelId: string; messageId: string; scope: 'server' | 'global' }[]> {
  await ensureSchema();
  const rows = await query(
    `SELECT guild_id, leaderboard_channel_id, leaderboard_message_id, COALESCE(leaderboard_scope, 'global') as scope 
     FROM ryusei_ladder_settings 
     WHERE leaderboard_channel_id IS NOT NULL AND leaderboard_message_id IS NOT NULL`
  );
  return rows.map(r => ({
    guildId: String(r.guild_id),
    channelId: String(r.leaderboard_channel_id),
    messageId: String(r.leaderboard_message_id),
    scope: (r.scope === 'server' ? 'server' : 'global') as 'server' | 'global',
  }));
}

export async function setScheduledSeason(guildId: string, name?: string, endTime?: number, resetMode?: string): Promise<void> {
  await ensureSchema();
  await query(
    `UPDATE ryusei_ladder_settings SET scheduled_season_name = $2, scheduled_season_end = $3, scheduled_season_reset_mode = $4 WHERE guild_id = $1`,
    [guildId, name || null, endTime || null, resetMode || null],
  );
}

export async function clearScheduledSeasonIfMatching(guildId: string, name: string): Promise<boolean> {
  await ensureSchema();
  const rows = await query(
    `UPDATE ryusei_ladder_settings 
     SET scheduled_season_name = NULL, scheduled_season_end = NULL, scheduled_season_reset_mode = NULL 
     WHERE guild_id = $1 AND scheduled_season_name = $2 
     RETURNING guild_id`,
    [guildId, name]
  );
  return rows.length > 0;
}

export async function setHallOfFameConfig(guildId: string, channelId: string | undefined, roleId: string | undefined): Promise<void> {
  await ensureSchema();
  await query(`UPDATE ryusei_ladder_settings SET hall_of_fame_channel_id = $2, hall_of_fame_role_id = $3 WHERE guild_id = $1`,
    [guildId, channelId || null, roleId || null]);
}

export async function setTopRoles(guildId: string, roleIds: string[]): Promise<void> {
  await ensureSchema();
  // Khởi tạo row nếu chưa có bằng update on conflict do nothing hoặc dùng một query insert
  // Nhưng vì config thường setup sau nên UPDATE
  await query(
    `UPDATE ryusei_ladder_settings SET top_role_ids = $2::text[] WHERE guild_id = $1`,
    [guildId, roleIds]
  );
}

export async function updateCurrentTopUsers(guildId: string, userIds: string[]): Promise<void> {
  await ensureSchema();
  await query(
    `UPDATE ryusei_ladder_settings SET current_top_users = $2::text[] WHERE guild_id = $1`,
    [guildId, userIds]
  );
}

export async function getOverdueSeasons(timestamp: number): Promise<LadderSettings[]> {
  await ensureSchema();
  const rows = await query(
    `SELECT * FROM ryusei_ladder_settings WHERE scheduled_season_end IS NOT NULL AND scheduled_season_end <= $1`,
    [timestamp]
  );
  return rows.map(settingsFrom);
}

export async function getDailyMatchCountBetween(
  guildId: string,
  userAId: string,
  userBId: string,
): Promise<number> {
  await ensureSchema();
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const rows = await query(
    `SELECT COUNT(*)::int AS count FROM ryusei_ladder_matches
     WHERE guild_id = $1
       AND status IN ('finished', 'active', 'accepted', 'awaiting_confirmation', 'disputed')
       AND created_at >= $4
       AND ((challenger_id = $2 AND opponent_id = $3) OR (challenger_id = $3 AND opponent_id = $2))`,
    [guildId, userAId, userBId, startOfDay]
  );
  return Number(rows[0]?.count || 0);
}

export async function createChallenge(input: {
  id: string;
  guildId: string;
  channelId: string;
  challengerId: string;
  challengerName: string;
  opponentId: string;
  opponentName: string;
}): Promise<LadderMatch> {
  await ensureSchema();
  await expirePendingChallenges();

  const dailyCount = await getDailyMatchCountBetween(input.guildId, input.challengerId, input.opponentId);
  if (dailyCount >= 3) {
    throw new Error('Hai bạn đã thi đấu 3 trận với nhau trong ngày! Hãy tái đấu vào ngày mai nhé.');
  }

  const now = Date.now();
  const lockKeys = [input.challengerId, input.opponentId]
    .sort()
    .map(userId => `${input.guildId}:${userId}`);
  const results = await executeTx(tx => [
    tx.query(`SELECT pg_advisory_xact_lock(hashtextextended(lock_key, 0))
      FROM unnest($1::text[]) AS keys(lock_key) ORDER BY lock_key`, [lockKeys]),
    tx.query(`INSERT INTO ryusei_global_ratings (user_id, updated_at)
      VALUES ($1, $2) ON CONFLICT DO NOTHING`, [input.challengerId, now]),
    tx.query(`INSERT INTO ryusei_global_ratings (user_id, updated_at)
      VALUES ($1, $2) ON CONFLICT DO NOTHING`, [input.opponentId, now]),
    tx.query(`INSERT INTO ryusei_server_members (guild_id, user_id, joined_at, last_active_at)
      VALUES ($1, $2, $3, $4) ON CONFLICT (guild_id, user_id) DO UPDATE SET last_active_at = $4`, [input.guildId, input.challengerId, now, now]),
    tx.query(`INSERT INTO ryusei_server_members (guild_id, user_id, joined_at, last_active_at)
      VALUES ($1, $2, $3, $4) ON CONFLICT (guild_id, user_id) DO UPDATE SET last_active_at = $4`, [input.guildId, input.opponentId, now, now]),
    tx.query(`INSERT INTO ryusei_ladder_matches
      (id, guild_id, channel_id, challenger_id, challenger_name, opponent_id, opponent_name, status, created_at)
      SELECT $1, $2, $3, $4, $5, $6, $7, 'pending', $8
      WHERE NOT EXISTS (
        SELECT 1 FROM ryusei_ladder_matches
        WHERE guild_id = $2 AND status IN ('pending','accepted','active','awaiting_confirmation','disputed')
          AND (challenger_id IN ($4,$6) OR opponent_id IN ($4,$6))
      ) RETURNING *`, [input.id, input.guildId, input.channelId, input.challengerId, input.challengerName, input.opponentId, input.opponentName, now]),
  ]) as unknown as DbRow[][];
  const inserted = results[5]?.[0];
  if (!inserted) {
    // Match bị kẹt (thread có thể đã xoá) chặn thách đấu mới. Trả về Match ID + status +
    // tên 2 người để Mod dùng /match cancel id:<...> gỡ kẹt ngay, không cần dò thủ công.
    const blocking = await query(
      `SELECT id, status, challenger_id, challenger_name, opponent_id, opponent_name
       FROM ryusei_ladder_matches
       WHERE guild_id = $1 AND status IN ('pending','accepted','active','awaiting_confirmation','disputed')
         AND (challenger_id IN ($2,$3) OR opponent_id IN ($2,$3))
       ORDER BY created_at DESC`,
      [input.guildId, input.challengerId, input.opponentId]
    );
    if (blocking.length > 0) {
      const lines = blocking
        .map(m => `• \`${String(m.id)}\` (${String(m.status)}) — ${String(m.challenger_name || m.challenger_id)} vs ${String(m.opponent_name || m.opponent_id)}`)
        .join('\n');
      throw new Error(
        `Một trong hai người đang có lời thách đấu hoặc trận chưa xử lý:\n${lines}\n\n👉 Mod dùng \`/match cancel\` với Match ID ở trên để hủy trận kẹt.`
      );
    }
    throw new Error('Một trong hai người đang có lời thách đấu hoặc trận chưa xử lý.');
  }
  return matchFrom(inserted);
}

export async function getMatch(id: string): Promise<LadderMatch | undefined> {
  await ensureSchema();
  const [row] = await query('SELECT * FROM ryusei_ladder_matches WHERE id = $1', [id]);
  return row ? matchFrom(row) : undefined;
}

export async function getMatchByChannelId(channelId: string): Promise<LadderMatch | undefined> {
  await ensureSchema();
  const [row] = await query(`SELECT * FROM ryusei_ladder_matches 
    WHERE thread_id = $1 
    ORDER BY created_at DESC LIMIT 1`, [channelId]);
  return row ? matchFrom(row) : undefined;
}

export async function getOpenMatchForUser(guildId: string, userId: string): Promise<LadderMatch | undefined> {
  await ensureSchema();
  const [row] = await query(`SELECT * FROM ryusei_ladder_matches
    WHERE guild_id = $1 AND (challenger_id = $2 OR opponent_id = $2)
      AND status IN ('pending','accepted','active','awaiting_confirmation','disputed')
    ORDER BY created_at DESC LIMIT 1`, [guildId, userId]);
  return row ? matchFrom(row) : undefined;
}

export async function acceptChallenge(id: string, opponentId: string): Promise<LadderMatch | undefined> {
  await ensureSchema();
  const [row] = await query(`UPDATE ryusei_ladder_matches SET status = 'accepted'
    WHERE id = $1 AND opponent_id = $2 AND status = 'pending' AND CAST(created_at AS BIGINT) > $3
    RETURNING *`, [id, opponentId, Date.now() - 2 * 60_000]);
  return row ? matchFrom(row) : undefined;
}

export async function declineChallenge(id: string, userId: string): Promise<boolean> {
  await ensureSchema();
  return (await query(`UPDATE ryusei_ladder_matches SET status = 'declined', ended_at = $3
    WHERE id = $1 AND (opponent_id = $2 OR challenger_id = $2) AND status = 'pending' RETURNING id`,
    [id, userId, Date.now()])).length > 0;
}

export async function startAcceptedMatch(id: string, matchChannelId: string): Promise<LadderMatch> {
  await ensureSchema();
  const [row] = await query(`UPDATE ryusei_ladder_matches
    SET status = 'active', thread_id = $2, started_at = $3
    WHERE id = $1 AND status = 'accepted' RETURNING *`, [id, matchChannelId, Date.now()]);
  if (!row) throw new Error('Không thể bắt đầu trận này.');
  return matchFrom(row);
}

export async function cancelAcceptedMatch(id: string, note: string): Promise<void> {
  await ensureSchema();
  await query(`UPDATE ryusei_ladder_matches SET status = 'cancelled', ended_at = $2, resolution_note = $3
    WHERE id = $1 AND status = 'accepted'`, [id, Date.now(), note]);
}

export async function proposeResult(
  id: string,
  reporterId: string,
  winnerUserId: string | undefined,
  timeoutMinutes = 15,
): Promise<LadderMatch> {
  await ensureSchema();
  const match = await getMatch(id);
  if (!match || !['active', 'awaiting_confirmation'].includes(match.status)) {
    throw new Error('Trận không ở trạng thái chờ báo kết quả.');
  }
  if (![match.challengerId, match.opponentId].includes(reporterId)) {
    throw new Error('Bạn không phải người chơi trong trận này.');
  }
  if (match.status === 'awaiting_confirmation' && match.proposedById !== reporterId) {
    throw new Error('Đối thủ đã gửi kết quả trước. Vui lòng bấm Xác Nhận hoặc Phản Đối.');
  }
  if (winnerUserId && ![match.challengerId, match.opponentId].includes(winnerUserId)) {
    throw new Error('Người thắng không thuộc trận này.');
  }
  const [row] = await query(`UPDATE ryusei_ladder_matches SET status = 'awaiting_confirmation',
    proposed_winner_id = $2, proposed_by_id = $3, confirmation_deadline = $4
    WHERE id = $1 AND (status = 'active' OR (status = 'awaiting_confirmation' AND proposed_by_id = $3)) RETURNING *`,
    [id, winnerUserId || null, reporterId, Date.now() + timeoutMinutes * 60_000]);
  if (!row) throw new Error('Không thể cập nhật kết quả.');
  return matchFrom(row);
}

export async function cancelProposedResult(id: string, userId: string): Promise<import('./types').LadderMatch> {
  const match = await getMatch(id);
  if (!match || match.status !== 'awaiting_confirmation') throw new Error('Không có kết quả nào đang chờ xác nhận để hủy.');
  if (match.proposedById !== userId) {
    throw new Error('Chỉ người gửi kết quả mới có thể hủy nó.');
  }
  const [row] = await query(`UPDATE ryusei_ladder_matches
    SET status = 'active', proposed_winner_id = NULL, proposed_by_id = NULL, confirmation_deadline = NULL
    WHERE id = $1 AND status = 'awaiting_confirmation' RETURNING *`, [id]);
  if (!row) throw new Error('Không thể hủy kết quả vào lúc này.');
  return matchFrom(row);
}

export async function disputeResult(id: string, userId: string): Promise<LadderMatch> {
  const match = await getMatch(id);
  if (!match || match.status !== 'awaiting_confirmation') throw new Error('Không có kết quả nào đang chờ xác nhận.');
  if (![match.challengerId, match.opponentId].includes(userId)) {
    throw new Error('Bạn không phải người chơi trong trận này.');
  }
  const [row] = await query(`UPDATE ryusei_ladder_matches
    SET status = 'disputed', confirmation_deadline = NULL
    WHERE id = $1 AND status = 'awaiting_confirmation' RETURNING *`, [id]);
  if (!row) throw new Error('Kết quả đã được xử lý.');
  return matchFrom(row);
}

export async function confirmResult(id: string, confirmerId: string): Promise<FinalResult> {
  const match = await getMatch(id);
  if (!match || match.status !== 'awaiting_confirmation') throw new Error('Không có kết quả nào đang chờ xác nhận.');
  if (![match.challengerId, match.opponentId].includes(confirmerId) || match.proposedById === confirmerId) {
    throw new Error('Chỉ đối thủ mới có thể xác nhận kết quả.');
  }
  return finishAndRate(match, match.proposedWinnerId, 'Hai người chơi đã xác nhận.', confirmerId);
}

export async function resolveResult(id: string, winnerUserId: string | undefined, note: string): Promise<FinalResult> {
  const match = await getMatch(id);
  if (!match || !['active', 'awaiting_confirmation', 'disputed'].includes(match.status)) {
    throw new Error('Trận này không thể được xử lý.');
  }
  if (winnerUserId && ![match.challengerId, match.opponentId].includes(winnerUserId)) {
    throw new Error('Người thắng không thuộc trận này.');
  }
  return finishAndRate(match, winnerUserId, note);
}

export async function cancelMatch(id: string, note = 'Hủy trận đấu theo yêu cầu của Mod.'): Promise<LadderMatch> {
  await ensureSchema();
  const match = await getMatch(id);
  if (!match) throw new Error('Không tìm thấy trận đấu với Match ID này.');
  if (match.status === 'cancelled') throw new Error('Trận đấu này đã bị hủy trước đó.');

  const now = Date.now();

  if (match.status === 'finished') {
    const scoreP1: 0 | 0.5 | 1 = !match.winnerUserId ? 0.5 : match.winnerUserId === match.challengerId ? 1 : 0;
    const scoreP2 = 1 - scoreP1;
    const ryuP1 = scoreP1 === 1 ? 12 : scoreP1 === 0 ? 6 : 0;
    const ryuP2 = scoreP2 === 1 ? 12 : scoreP2 === 0 ? 6 : 0;

    const [p1, p2] = await Promise.all([
      getRating(match.guildId, match.challengerId, match.challengerName),
      getRating(match.guildId, match.opponentId, match.opponentName),
    ]);

    const change = calculateElo(p1, p2, scoreP1);

    await executeTx(tx => [
      tx.query(
        `UPDATE ryusei_global_ratings SET
           rating = GREATEST(100, rating - $1),
           wins = GREATEST(0, wins - $2),
           losses = GREATEST(0, losses - $3),
           draws = GREATEST(0, draws - $4),
           ryucoin = GREATEST(0, ryucoin - $5),
           updated_at = $6
         WHERE user_id = $7`,
        [change.p1.delta, scoreP1 === 1 ? 1 : 0, scoreP1 === 0 ? 1 : 0, scoreP1 === 0.5 ? 1 : 0, ryuP1, now, match.challengerId]
      ),
      tx.query(
        `UPDATE ryusei_global_ratings SET
           rating = GREATEST(100, rating - $1),
           wins = GREATEST(0, wins - $2),
           losses = GREATEST(0, losses - $3),
           draws = GREATEST(0, draws - $4),
           ryucoin = GREATEST(0, ryucoin - $5),
           updated_at = $6
         WHERE user_id = $7`,
        [change.p2.delta, scoreP2 === 1 ? 1 : 0, scoreP2 === 0 ? 1 : 0, scoreP2 === 0.5 ? 1 : 0, ryuP2, now, match.opponentId]
      ),
      tx.query(
        `UPDATE ryusei_ladder_matches SET status = 'cancelled', resolution_note = $2, ended_at = $3
         WHERE id = $1 RETURNING *`,
        [id, note, now]
      ),
    ]);
  } else {
    await query(
      `UPDATE ryusei_ladder_matches SET status = 'cancelled', resolution_note = $2, ended_at = $3
       WHERE id = $1 RETURNING *`,
      [id, note, now]
    );
  }

  const updatedMatch = await getMatch(id);
  if (!updatedMatch) throw new Error('Gặp lỗi khi hủy trận đấu.');
  return updatedMatch;
}

async function finishAndRate(
  match: LadderMatch,
  winnerUserId: string | undefined,
  note: string,
  confirmerId?: string,
): Promise<FinalResult> {
  const [p1, p2] = await Promise.all([
    getRating(match.guildId, match.challengerId, match.challengerName),
    getRating(match.guildId, match.opponentId, match.opponentName),
  ]);
  const scoreP1: 0 | 0.5 | 1 = !winnerUserId ? 0.5 : winnerUserId === match.challengerId ? 1 : 0;
  const change = calculateElo(p1, p2, scoreP1);
  const scoreP2 = 1 - scoreP1;
  const ryuP1 = scoreP1 === 1 ? 15 : scoreP1 === 0 ? 7 : 0;
  const ryuP2 = scoreP2 === 1 ? 15 : scoreP2 === 0 ? 7 : 0;
  const resolutionToken = randomUUID();
  const endedAt = Date.now();

  const matchWhere = confirmerId
    ? `WHERE id = $1 AND status = 'awaiting_confirmation' AND proposed_by_id <> $6 AND (challenger_id = $6 OR opponent_id = $6)`
    : `WHERE id = $1 AND status IN ('active','awaiting_confirmation','disputed')`;

  const params = confirmerId
    ? [
      match.id,
      winnerUserId || null,
      endedAt,
      note,
      resolutionToken,
      confirmerId,
      change.p1.next,
      scoreP1 === 1 ? 1 : 0,
      scoreP1 === 0 ? 1 : 0,
      scoreP1 === 0.5 ? 1 : 0,
      ryuP1,
      match.challengerName || null,
      match.challengerId,
      change.p2.next,
      scoreP2 === 1 ? 1 : 0,
      scoreP2 === 0 ? 1 : 0,
      scoreP2 === 0.5 ? 1 : 0,
      ryuP2,
      match.opponentName || null,
      match.opponentId,
    ]
    : [
      match.id,
      winnerUserId || null,
      endedAt,
      note,
      resolutionToken,
      change.p1.next,
      scoreP1 === 1 ? 1 : 0,
      scoreP1 === 0 ? 1 : 0,
      scoreP1 === 0.5 ? 1 : 0,
      ryuP1,
      match.challengerName || null,
      match.challengerId,
      change.p2.next,
      scoreP2 === 1 ? 1 : 0,
      scoreP2 === 0 ? 1 : 0,
      scoreP2 === 0.5 ? 1 : 0,
      ryuP2,
      match.opponentName || null,
      match.opponentId,
    ];

  const p1Offset = confirmerId ? 6 : 5;
  const p2Offset = confirmerId ? 13 : 12;

  const sqlQuery = `
    WITH updated_match AS (
      UPDATE ryusei_ladder_matches
      SET status = 'finished', winner_user_id = $2, ended_at = $3,
          confirmation_deadline = NULL, resolution_note = $4, resolution_token = $5
      ${matchWhere}
      RETURNING *
    ),
    upd_p1 AS (
      UPDATE ryusei_global_ratings
      SET rating = $${p1Offset + 1}, wins = wins + $${p1Offset + 2}, losses = losses + $${p1Offset + 3},
          draws = draws + $${p1Offset + 4}, peak_rating = GREATEST(peak_rating, $${p1Offset + 1}),
          ryucoin = ryucoin + $${p1Offset + 5}, updated_at = $3, user_name = COALESCE($${p1Offset + 6}, user_name)
      WHERE user_id = $${p1Offset + 7} AND EXISTS (SELECT 1 FROM updated_match)
      RETURNING user_id
    ),
    upd_p2 AS (
      UPDATE ryusei_global_ratings
      SET rating = $${p2Offset + 1}, wins = wins + $${p2Offset + 2}, losses = losses + $${p2Offset + 3},
          draws = draws + $${p2Offset + 4}, peak_rating = GREATEST(peak_rating, $${p2Offset + 1}),
          ryucoin = ryucoin + $${p2Offset + 5}, updated_at = $3, user_name = COALESCE($${p2Offset + 6}, user_name)
      WHERE user_id = $${p2Offset + 7} AND EXISTS (SELECT 1 FROM updated_match)
      RETURNING user_id
    )
    SELECT * FROM updated_match;
  `;

  const rows = await query(sqlQuery, params);
  const finalRow = rows[0];
  if (!finalRow) throw new Error('Kết quả đã được xử lý.');
  return { match: matchFrom(finalRow), change };
}

export async function expirePendingChallenges(now = Date.now()): Promise<number> {
  await ensureSchema();
  return (await query(`UPDATE ryusei_ladder_matches SET status = 'expired', ended_at = $1
    WHERE status = 'pending' AND CAST(created_at AS BIGINT) <= $2 RETURNING id`, [now, now - 2 * 60_000])).length;
}

export async function markOverdueConfirmations(now = Date.now()): Promise<LadderMatch[]> {
  await ensureSchema();
  return (await query(`UPDATE ryusei_ladder_matches SET status = 'disputed', confirmation_deadline = NULL
    WHERE status = 'awaiting_confirmation' AND confirmation_deadline <= $1 RETURNING *`, [now])).map(matchFrom);
}

export async function getRating(guildId: string, userId: string, userName?: string): Promise<RatingRow> {
  await ensureSchema();
  const now = Date.now();
  // Upsert global rating
  await query(`INSERT INTO ryusei_global_ratings (user_id, user_name, rating, peak_rating, updated_at)
    VALUES ($1, $2, 1000, 1000, $3) ON CONFLICT (user_id) DO UPDATE SET user_name = COALESCE(EXCLUDED.user_name, ryusei_global_ratings.user_name)`,
    [userId, userName || null, now]);
  if (userName) {
    await query(`UPDATE ryusei_global_ratings SET user_name = $2 WHERE user_id = $1`, [userId, userName]);
  }
  // Register server membership
  if (guildId) {
    await query(`INSERT INTO ryusei_server_members (guild_id, user_id, joined_at, last_active_at)
      VALUES ($1, $2, $3, $4) ON CONFLICT (guild_id, user_id) DO UPDATE SET last_active_at = GREATEST(ryusei_server_members.last_active_at, $4)`,
      [guildId, userId, now, now]);
  }
  const [row] = await query(`SELECT * FROM ryusei_global_ratings WHERE user_id = $1`, [userId]);
  if (!row) throw new Error('Không đọc được rating.');
  return ratingFrom(row);
}

export async function leaderboard(guildId: string, limit = 10, offset = 0): Promise<RatingRow[]> {
  await ensureSchema();

  const rows = (await query(`
    SELECT r.*,
      COALESCE(r.user_name, (
        SELECT challenger_name FROM ryusei_ladder_matches WHERE challenger_id = r.user_id AND challenger_name <> '' AND challenger_name NOT SIMILAR TO '[0-9]+' ORDER BY created_at DESC LIMIT 1
      ), (
        SELECT opponent_name FROM ryusei_ladder_matches WHERE opponent_id = r.user_id AND opponent_name <> '' AND opponent_name NOT SIMILAR TO '[0-9]+' ORDER BY created_at DESC LIMIT 1
      )) AS fallback_name
    FROM ryusei_global_ratings r
    INNER JOIN ryusei_server_members sm ON sm.user_id = r.user_id AND sm.guild_id = $1
    WHERE (r.wins + r.losses + r.draws) > 0
      AND r.user_id != '873563860991365141'
    ORDER BY r.rating DESC, r.wins DESC, r.losses ASC
    LIMIT $2 OFFSET $3`,
    [guildId, limit, offset]
  )).map(row => {
    if (!row.user_name && row.fallback_name) row.user_name = row.fallback_name;
    return ratingFrom(row);
  });

  await autoFetchMissingNames(rows);
  return rows;
}

export async function globalLeaderboard(limit = 10, offset = 0): Promise<RatingRow[]> {
  await ensureSchema();

  const rows = (await query(`
    SELECT r.*,
      COALESCE(r.user_name, (
        SELECT challenger_name FROM ryusei_ladder_matches WHERE challenger_id = r.user_id AND challenger_name <> '' AND challenger_name NOT SIMILAR TO '[0-9]+' ORDER BY created_at DESC LIMIT 1
      ), (
        SELECT opponent_name FROM ryusei_ladder_matches WHERE opponent_id = r.user_id AND opponent_name <> '' AND opponent_name NOT SIMILAR TO '[0-9]+' ORDER BY created_at DESC LIMIT 1
      )) AS fallback_name
    FROM ryusei_global_ratings r
    WHERE (r.wins + r.losses + r.draws) > 0
      AND r.user_id != '873563860991365141'
    ORDER BY r.rating DESC, r.wins DESC, r.losses ASC
    LIMIT $1 OFFSET $2`,
    [limit, offset]
  )).map(row => {
    if (!row.user_name && row.fallback_name) row.user_name = row.fallback_name;
    return ratingFrom(row);
  });

  await autoFetchMissingNames(rows);
  return rows;
}

export async function leaderboardCount(guildId: string): Promise<number> {
  await ensureSchema();
  const [row] = await query(`
    SELECT COUNT(*)::int as total
    FROM ryusei_global_ratings r
    INNER JOIN ryusei_server_members sm ON sm.user_id = r.user_id AND sm.guild_id = $1
    WHERE (r.wins + r.losses + r.draws) > 0
      AND r.user_id != '873563860991365141'`,
    [guildId]
  );
  return row ? Number(row.total) : 0;
}

export async function globalLeaderboardCount(): Promise<number> {
  await ensureSchema();
  const [row] = await query(`
    SELECT COUNT(*)::int as total
    FROM ryusei_global_ratings r
    WHERE (r.wins + r.losses + r.draws) > 0
      AND r.user_id != '873563860991365141'`
  );
  return row ? Number(row.total) : 0;
}

export async function rankPosition(guildId: string, userId: string): Promise<number | undefined> {
  if (userId === '873563860991365141') return undefined;
  const rating = await getRating(guildId, userId);
  if (!rating.matches) return undefined;
  const [row] = await query(
    `WITH raw_ranked AS (
       SELECT r.user_id, r.rating, r.wins, r.losses,
         ROW_NUMBER() OVER (ORDER BY r.rating DESC, r.wins DESC, r.losses ASC) AS position
       FROM ryusei_global_ratings r
       INNER JOIN ryusei_server_members sm ON sm.user_id = r.user_id AND sm.guild_id = $1
       WHERE (r.wins + r.losses + r.draws) > 0
         AND r.user_id != '873563860991365141'
     )
     SELECT position::int FROM raw_ranked WHERE user_id = $2`,
    [guildId, userId]
  );
  return row ? Number(row.position) : undefined;
}

export async function coinLeaderboard(guildId: string, limit = 10, offset = 0): Promise<RatingRow[]> {
  await ensureSchema();
  const rows = (await query(`
    SELECT r.*,
      COALESCE(r.user_name, (
        SELECT challenger_name FROM ryusei_ladder_matches WHERE challenger_id = r.user_id AND challenger_name <> '' AND challenger_name NOT SIMILAR TO '[0-9]+' ORDER BY created_at DESC LIMIT 1
      ), (
        SELECT opponent_name FROM ryusei_ladder_matches WHERE opponent_id = r.user_id AND opponent_name <> '' AND opponent_name NOT SIMILAR TO '[0-9]+' ORDER BY created_at DESC LIMIT 1
      )) AS fallback_name
    FROM ryusei_global_ratings r
    INNER JOIN ryusei_server_members sm ON sm.user_id = r.user_id AND sm.guild_id = $1
    WHERE r.ryucoin > 0
    ORDER BY ryucoin DESC, updated_at DESC
    LIMIT $2 OFFSET $3`,
    [guildId, limit, offset]
  )).map(row => {
    if (!row.user_name && row.fallback_name) row.user_name = row.fallback_name;
    return ratingFrom(row);
  });

  await autoFetchMissingNames(rows);
  return rows;
}

export async function globalCoinLeaderboard(limit = 10, offset = 0): Promise<RatingRow[]> {
  await ensureSchema();
  const rows = (await query(`
    SELECT r.*,
      COALESCE(r.user_name, (
        SELECT challenger_name FROM ryusei_ladder_matches WHERE challenger_id = r.user_id AND challenger_name <> '' AND challenger_name NOT SIMILAR TO '[0-9]+' ORDER BY created_at DESC LIMIT 1
      ), (
        SELECT opponent_name FROM ryusei_ladder_matches WHERE opponent_id = r.user_id AND opponent_name <> '' AND opponent_name NOT SIMILAR TO '[0-9]+' ORDER BY created_at DESC LIMIT 1
      )) AS fallback_name
    FROM ryusei_global_ratings r
    WHERE r.ryucoin > 0
    ORDER BY ryucoin DESC, updated_at DESC
    LIMIT $1 OFFSET $2`,
    [limit, offset]
  )).map(row => {
    if (!row.user_name && row.fallback_name) row.user_name = row.fallback_name;
    return ratingFrom(row);
  });

  await autoFetchMissingNames(rows);
  return rows;
}

export async function coinLeaderboardCount(guildId: string): Promise<number> {
  await ensureSchema();
  const [row] = await query(
    `SELECT COUNT(*)::int as total FROM ryusei_global_ratings r
     INNER JOIN ryusei_server_members sm ON sm.user_id = r.user_id AND sm.guild_id = $1
     WHERE r.ryucoin > 0`,
    [guildId]
  );
  return row ? Number(row.total) : 0;
}

export async function globalCoinLeaderboardCount(): Promise<number> {
  await ensureSchema();
  const [row] = await query(
    `SELECT COUNT(*)::int as total FROM ryusei_global_ratings WHERE ryucoin > 0`
  );
  return row ? Number(row.total) : 0;
}

export async function coinRankPosition(guildId: string, userId: string): Promise<number | undefined> {
  const rating = await getRating(guildId, userId);
  if (!rating || rating.ryucoin <= 0) return undefined;
  const [row] = await query(
    `SELECT COUNT(*)::int + 1 AS position FROM ryusei_global_ratings r
     INNER JOIN ryusei_server_members sm ON sm.user_id = r.user_id AND sm.guild_id = $1
     WHERE r.ryucoin > $2`,
    [guildId, rating.ryucoin]
  );
  return row ? Number(row.position) : undefined;
}

/** Auto-fetch missing usernames from Discord API */
async function autoFetchMissingNames(rows: RatingRow[]): Promise<void> {
  await Promise.all(rows.map(async row => {
    if (!row.userName || /^\d+$/.test(row.userName)) {
      const fetchedName = await fetchUserName(row.userId);
      if (fetchedName) {
        row.userName = fetchedName;
        await query(`UPDATE ryusei_global_ratings SET user_name = $2 WHERE user_id = $1`, [row.userId, fetchedName]).catch(() => null);
      }
    }
  }));
}


export async function getMatchHistory(
  guildId: string,
  userId: string,
  limit = 10,
  offset = 0,
): Promise<LadderMatch[]> {
  await ensureSchema();
  return (await query(
    `SELECT * FROM ryusei_ladder_matches
     WHERE guild_id = $1 AND status = 'finished'
       AND (challenger_id = $2 OR opponent_id = $2)
     ORDER BY ended_at DESC LIMIT $3 OFFSET $4`,
    [guildId, userId, limit, offset],
  )).map(matchFrom);
}

export async function getMatchHistoryCount(
  guildId: string,
  userId: string,
): Promise<number> {
  await ensureSchema();
  const rows = await query(
    `SELECT COUNT(*)::int AS count FROM ryusei_ladder_matches
     WHERE guild_id = $1 AND status = 'finished'
       AND (challenger_id = $2 OR opponent_id = $2)`,
    [guildId, userId],
  );
  return Number(rows[0]?.count || 0);
}

export async function adjustRating(
  guildId: string,
  userId: string,
  delta: number,
  note: string,
): Promise<RatingRow> {
  await ensureSchema();
  await query(`INSERT INTO ryusei_global_ratings (user_id, updated_at)
    VALUES ($1, $2) ON CONFLICT DO NOTHING`, [userId, Date.now()]);
  const [row] = await query(
    `UPDATE ryusei_global_ratings
     SET rating = GREATEST(100, rating + $1), updated_at = $2
     WHERE user_id = $3 RETURNING *`,
    [delta, Date.now(), userId],
  );
  if (!row) throw new Error('Không tìm thấy người chơi.');
  return ratingFrom(row);
}

export async function setRatingManual(
  guildId: string,
  userId: string,
  rating: number,
): Promise<RatingRow> {
  await ensureSchema();
  await query(`INSERT INTO ryusei_global_ratings (user_id, updated_at)
    VALUES ($1, $2) ON CONFLICT DO NOTHING`, [userId, Date.now()]);
  const [row] = await query(
    `UPDATE ryusei_global_ratings
     SET rating = $1, peak_rating = GREATEST(peak_rating, $1), updated_at = $2
     WHERE user_id = $3 RETURNING *`,
    [Math.max(100, rating), Date.now(), userId],
  );
  if (!row) throw new Error('Không tìm thấy người chơi.');
  return ratingFrom(row);
}

export async function resetGuildData(guildId: string): Promise<{ matches: number; ratings: number }> {
  await ensureSchema();
  const matchCount = await query(
    `SELECT COUNT(*) AS cnt FROM ryusei_ladder_matches WHERE guild_id = $1`,
    [guildId],
  ).then(rows => Number(rows[0]?.cnt ?? 0));
  const memberCount = await query(
    `SELECT COUNT(*) AS cnt FROM ryusei_server_members WHERE guild_id = $1`,
    [guildId],
  ).then(rows => Number(rows[0]?.cnt ?? 0));
  await query(`DELETE FROM ryusei_ladder_matches WHERE guild_id = $1`, [guildId]);
  await query(`DELETE FROM ryusei_server_members WHERE guild_id = $1`, [guildId]);
  await query(`DELETE FROM ryusei_ladder_seasons_history WHERE guild_id = $1`, [guildId]);
  return { matches: matchCount, ratings: memberCount };
}

export async function saveSeasonSnapshot(guildId: string, seasonName: string): Promise<import('./types').SeasonHistory> {
  await ensureSchema();
  // Lấy Top 5
  const topRows = await leaderboard(guildId, 5);
  const topPlayers: import('./types').SeasonPlayer[] = topRows.map(r => ({
    userId: r.userId,
    userName: r.userName,
    rating: r.rating,
    wins: r.wins,
    losses: r.losses,
    draws: r.draws,
  }));
  const id = randomUUID();
  const endedAt = Date.now();
  await query(
    `INSERT INTO ryusei_ladder_seasons_history (id, guild_id, season_name, ended_at, top_players_json)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, guildId, seasonName, endedAt, JSON.stringify(topPlayers)],
  );
  return { id, guildId, seasonName, endedAt, topPlayers };
}

export async function getSeasonsHistory(guildId: string): Promise<import('./types').SeasonHistory[]> {
  await ensureSchema();
  const rows = await query(`SELECT * FROM ryusei_ladder_seasons_history WHERE guild_id = $1 ORDER BY ended_at DESC`, [guildId]);
  return rows.map(row => ({
    id: String(row.id),
    guildId: String(row.guild_id),
    seasonName: String(row.season_name),
    endedAt: Number(row.ended_at),
    topPlayers: JSON.parse(String(row.top_players_json)),
  }));
}

export async function deleteSeason(guildId: string, id: string): Promise<boolean> {
  await ensureSchema();
  const rows = await query(
    `DELETE FROM ryusei_ladder_seasons_history WHERE guild_id = $1 AND id = $2 RETURNING id`,
    [guildId, id]
  );
  return rows.length > 0;
}

export async function updateSeasonName(guildId: string, oldName: string, newName: string): Promise<number> {
  await ensureSchema();
  const rows = await query(
    `UPDATE ryusei_ladder_seasons_history
     SET season_name = $3
     WHERE guild_id = $1 AND (season_name = $2 OR season_name LIKE $4)
     RETURNING id`,
    [guildId, oldName, newName, `%${oldName}%`]
  );
  return rows.length;
}

export interface QueuePlayer extends Record<string, unknown> {
  guildId: string;
  userId: string;
  userName: string;
  rating: number;
  joinedAt: number;
  channelId?: string;
  interactionToken?: string;
}

export async function joinQueue(guildId: string, userId: string, userName: string, channelId: string, token?: string): Promise<QueuePlayer | null> {
  await ensureSchema();
  const userRating = await getRating(guildId, userId);
  const currentRating = userRating.rating;

  const candidates = await query<QueuePlayer>(
    `SELECT guild_id AS "guildId", user_id AS "userId", user_name AS "userName", rating, joined_at AS "joinedAt", channel_id AS "channelId", interaction_token AS "interactionToken"
     FROM ryusei_ladder_queue
     WHERE guild_id = $1 AND user_id != $2
     ORDER BY ABS(rating - $3) ASC, joined_at ASC LIMIT 10`,
    [guildId, userId, currentRating]
  );

  let match: QueuePlayer | null = null;
  for (const cand of candidates) {
    const dailyCount = await getDailyMatchCountBetween(guildId, userId, cand.userId);
    if (dailyCount < 3) {
      match = cand;
      break;
    }
  }

  if (match) {
    await query(`DELETE FROM ryusei_ladder_queue WHERE guild_id = $1 AND user_id = $2`, [guildId, match.userId]);
    return match;
  }

  await query(
    `INSERT INTO ryusei_ladder_queue (guild_id, user_id, user_name, rating, joined_at, channel_id, interaction_token)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id) DO UPDATE SET guild_id = $1, user_name = $3, rating = $4, joined_at = $5, channel_id = $6, interaction_token = $7`,
    [guildId, userId, userName, currentRating, Date.now(), channelId || null, token || null]
  );
  return null;
}

export async function leaveQueue(guildId: string, userId: string): Promise<boolean> {
  await ensureSchema();
  const result = await query(`DELETE FROM ryusei_ladder_queue WHERE guild_id = $1 AND user_id = $2 RETURNING user_id`, [guildId, userId]);
  return result.length > 0;
}

export async function expireQueuePlayers(olderThanMs: number): Promise<QueuePlayer[]> {
  await ensureSchema();
  const cutoff = Date.now() - olderThanMs;
  const rows = await query<QueuePlayer>(
    `DELETE FROM ryusei_ladder_queue
     WHERE joined_at < $1
     RETURNING guild_id AS "guildId", user_id AS "userId", user_name AS "userName", rating, joined_at AS "joinedAt", channel_id AS "channelId", interaction_token AS "interactionToken"`,
    [cutoff]
  );
  return rows;
}

export async function countActiveMatches(guildId: string, userId: string): Promise<number> {
  await ensureSchema();
  const rows = await query(`SELECT COUNT(*) as c FROM ryusei_ladder_matches
    WHERE guild_id = $1 AND status IN ('active','awaiting_confirmation','disputed')
      AND (challenger_id = $2 OR opponent_id = $2)`, [guildId, userId]);
  return Number(rows[0]?.c) || 0;
}

export async function addRyucoin(guildId: string, userId: string, amount: number): Promise<RatingRow> {
  await ensureSchema();
  const rows = await query(`UPDATE ryusei_global_ratings SET ryucoin = ryucoin + $2
    WHERE user_id = $1 RETURNING *`, [userId, amount]);
  if (!rows[0]) throw new Error('Người dùng chưa có dữ liệu xếp hạng.');
  return ratingFrom(rows[0]);
}

// Phát hiện kiểu thực tế của cột unlocked_wallpapers (jsonb ở DB cũ, ARRAY/text[] ở DB mới).
// Cache theo tiến trình; migrate() luôn chạy trước lệnh ghi nên kết quả phản ánh trạng thái sau migrate.
async function unlockedColumnIsJsonb(): Promise<boolean> {
  if (unlockedWallpapersIsJsonb === undefined) {
    try {
      const rows = await query<DbRow>(
        `SELECT data_type FROM information_schema.columns
         WHERE table_name = 'ryusei_global_ratings' AND column_name = 'unlocked_wallpapers' LIMIT 1`
      );
      unlockedWallpapersIsJsonb = rows[0]?.data_type === 'jsonb';
    } catch {
      unlockedWallpapersIsJsonb = false;
    }
  }
  return unlockedWallpapersIsJsonb;
}

function toPgTextArrayLiteral(list: string[]): string {
  return `{${list.map(item => `"${String(item).replace(/"/g, '\\"')}"`).join(',')}}`;
}

// Ghi danh sách unlocked_wallpapers một cách thích ứng theo kiểu cột thực tế, tránh lỗi
// "column is of type jsonb but expression is of type text[]" khi prod còn cột jsonb.
async function unlockedWriteExpr(list: string[], paramIndex: number): Promise<{ expr: string; value: string }> {
  if (await unlockedColumnIsJsonb()) {
    return { expr: `$${paramIndex}::jsonb`, value: JSON.stringify(list) };
  }
  return { expr: `$${paramIndex}::text[]`, value: toPgTextArrayLiteral(list) };
}

export async function setWallpaper(guildId: string, userId: string, wallpaperId: string, cost: number): Promise<string> {
  await ensureSchema();
  const check = await getRating(guildId, userId);

  if (check.unlockedWallpapers.includes(wallpaperId)) {
    await query(`UPDATE ryusei_global_ratings SET wallpaper_id = $2 WHERE user_id = $1`, [userId, wallpaperId]);
    return 'Trang bị thành công';
  }

  if (check.ryucoin < cost) {
    throw new Error(`Bạn không đủ Ryucoin. Cần ${cost} nhưng bạn chỉ có ${check.ryucoin} 🪙.`);
  }

  const newUnlocked = check.unlockedWallpapers.includes(wallpaperId)
    ? check.unlockedWallpapers
    : [...check.unlockedWallpapers, wallpaperId];
  const unlocked = await unlockedWriteExpr(newUnlocked, 4);
  await query(`UPDATE ryusei_global_ratings
    SET ryucoin = ryucoin - $2, wallpaper_id = $3, unlocked_wallpapers = ${unlocked.expr}
    WHERE user_id = $1`, [userId, cost, wallpaperId, unlocked.value]);

  if (cost > 0) {
    await depositToBank(MAIN_GUILD_ID, cost).catch(err => console.error('Lỗi nạp doanh thu wallpaper vào bank:', err));
  }

  return 'Mua và trang bị thành công';
}

export async function setUserBackground(guildId: string, userId: string, backgroundUrl: string): Promise<RatingRow> {
  await ensureSchema();
  const check = await getRating(guildId, userId);
  let updatedUnlocked = check.unlockedWallpapers || ['default'];

  const defaultWallpapers = new Set(['default', 'img1', 'img2', 'img3', 'img4', 'img5']);
  if (!defaultWallpapers.has(backgroundUrl)) {
    // Xoá bỏ các URL custom background cũ khỏi danh sách đã mở khóa
    updatedUnlocked = updatedUnlocked.filter(wp => defaultWallpapers.has(wp));
  }

  if (!updatedUnlocked.includes(backgroundUrl)) {
    updatedUnlocked.push(backgroundUrl);
  }
  const unlocked = await unlockedWriteExpr(updatedUnlocked, 3);

  const rows = await query(
    `UPDATE ryusei_global_ratings
     SET wallpaper_id = $2, unlocked_wallpapers = ${unlocked.expr}
     WHERE user_id = $1 RETURNING *`,
    [userId, backgroundUrl, unlocked.value]
  );
  if (!rows[0]) throw new Error('Người dùng chưa có dữ liệu xếp hạng.');
  return ratingFrom(rows[0]);
}

export async function saveCustomBackground(userId: string, imageData: string, mimeType: string): Promise<void> {
  await ensureSchema();
  await query(
    `INSERT INTO ryusei_custom_backgrounds (user_id, image_data, mime_type, updated_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id) DO UPDATE SET image_data = $2, mime_type = $3, updated_at = $4`,
    [userId, imageData, mimeType, Date.now()]
  );
}

export async function getCustomBackground(userId: string): Promise<{ imageData: string; mimeType: string } | null> {
  await ensureSchema();
  const rows = await query<DbRow>(
    `SELECT image_data, mime_type FROM ryusei_custom_backgrounds WHERE user_id = $1`,
    [userId]
  );
  if (!rows[0]) return null;
  return {
    imageData: String(rows[0].image_data),
    mimeType: String(rows[0].mime_type || 'image/png'),
  };
}

export async function getActiveMatchChannels(guildId: string): Promise<string[]> {
  await ensureSchema();
  const rows = await query(`SELECT thread_id FROM ryusei_ladder_matches 
    WHERE guild_id = $1 AND status IN ('accepted', 'active', 'awaiting_confirmation', 'disputed') 
    AND thread_id IS NOT NULL`, [guildId]);
  return rows.map((r: any) => String(r.thread_id));
}

export async function updateUserName(guildId: string, userId: string, userName: string): Promise<void> {
  await ensureSchema();
  await query(`UPDATE ryusei_global_ratings SET user_name = $2 WHERE user_id = $1`, [userId, userName]);
}

export async function softResetGuildRatings(guildId: string, ratio = 0.2): Promise<number> {
  await ensureSchema();
  const rows = await query(
    `UPDATE ryusei_global_ratings r
     SET rating = 1000 + ROUND((rating - 1000)::numeric * $2::numeric)::int,
         wins = 0,
         losses = 0,
         draws = 0,
         updated_at = $3
     FROM ryusei_server_members sm
     WHERE r.user_id = sm.user_id AND sm.guild_id = $1
     RETURNING r.user_id`,
    [guildId, ratio, Date.now()]
  );
  return rows.length;
}

export async function hardResetGuildRatings(guildId: string): Promise<number> {
  await ensureSchema();
  const rows = await query(
    `UPDATE ryusei_global_ratings r
     SET rating = 1000,
         wins = 0,
         losses = 0,
         draws = 0,
         updated_at = $2
     FROM ryusei_server_members sm
     WHERE r.user_id = sm.user_id AND sm.guild_id = $1
     RETURNING r.user_id`,
    [guildId, Date.now()]
  );
  return rows.length;
}

// ==================== BET SYSTEM ====================

export interface BetRow {
  id: string;
  guildId: string;
  channelId: string;
  messageId?: string;
  player1Name: string;
  player2Name: string;
  status: 'open' | 'locked' | 'closed';
  createdBy: string;
  winner?: string;
  createdAt: number;
  endedAt?: number;
}

export interface BetEntry {
  betId: string;
  userId: string;
  playerChoice: string;
  amount: number;
  createdAt: number;
}

function betFrom(row: DbRow): BetRow {
  return {
    id: String(row.id),
    guildId: String(row.guild_id),
    channelId: String(row.channel_id),
    messageId: row.message_id ? String(row.message_id) : undefined,
    player1Name: String(row.player1_name),
    player2Name: String(row.player2_name),
    status: row.status as 'open' | 'locked' | 'closed',
    createdBy: String(row.created_by),
    winner: row.winner ? String(row.winner) : undefined,
    createdAt: Number(row.created_at),
    endedAt: row.ended_at ? Number(row.ended_at) : undefined,
  };
}

export async function createBet(input: {
  id: string;
  guildId: string;
  channelId: string;
  player1Name: string;
  player2Name: string;
  createdBy: string;
}): Promise<BetRow> {
  await ensureSchema();
  // Đảm bảo chỉ có 1 bet đang mở trong guild
  const existing = await getActiveBetInGuild(input.guildId);
  if (existing) throw new Error(`Đang có bet chưa kết thúc: **${existing.player1Name}** vs **${existing.player2Name}**. Hãy dùng \`/ket-thuc-bet\` trước.`);
  const [row] = await query(
    `INSERT INTO ryusei_bets (id, guild_id, channel_id, player1_name, player2_name, status, created_by, created_at)
     VALUES ($1, $2, $3, $4, $5, 'open', $6, $7) RETURNING *`,
    [input.id, input.guildId, input.channelId, input.player1Name, input.player2Name, input.createdBy, Date.now()]
  );
  if (!row) throw new Error('Không tạo được bet.');
  return betFrom(row);
}

export async function getBet(betId: string): Promise<BetRow | undefined> {
  await ensureSchema();
  const [row] = await query(`SELECT * FROM ryusei_bets WHERE id = $1`, [betId]);
  return row ? betFrom(row) : undefined;
}

export async function getActiveBetInGuild(guildId: string): Promise<BetRow | undefined> {
  await ensureSchema();
  const [row] = await query(
    `SELECT * FROM ryusei_bets WHERE guild_id = $1 AND status IN ('open', 'locked') ORDER BY created_at DESC LIMIT 1`,
    [guildId]
  );
  return row ? betFrom(row) : undefined;
}

export async function stopBet(input: {
  betId: string;
  guildId: string;
}): Promise<BetRow> {
  await ensureSchema();
  const bet = await getBet(input.betId);
  if (!bet || bet.status !== 'open') throw new Error('Kèo cược không tồn tại hoặc đã khóa/kết thúc.');

  await query(
    `UPDATE ryusei_bets SET status = 'locked' WHERE id = $1`,
    [input.betId]
  );
  return { ...bet, status: 'locked' };
}

export async function updateBetMessageId(betId: string, messageId: string): Promise<void> {
  await ensureSchema();
  await query(`UPDATE ryusei_bets SET message_id = $2 WHERE id = $1`, [betId, messageId]);
}

export async function updateBetChannelAndMessageId(betId: string, channelId: string, messageId: string): Promise<void> {
  await ensureSchema();
  await query(`UPDATE ryusei_bets SET channel_id = $2, message_id = $3 WHERE id = $1`, [betId, channelId, messageId]);
}

export async function getBetEntries(betId: string): Promise<BetEntry[]> {
  await ensureSchema();
  const rows = await query(`SELECT * FROM ryusei_bet_entries WHERE bet_id = $1 ORDER BY created_at ASC`, [betId]);
  return rows.map(r => ({
    betId: String(r.bet_id),
    userId: String(r.user_id),
    playerChoice: String(r.player_choice),
    amount: Number(r.amount),
    createdAt: Number(r.created_at),
  }));
}

export async function placeBetEntry(input: {
  betId: string;
  guildId: string;
  userId: string;
  playerChoice: string;
  amount: number;
}): Promise<{ entry: BetEntry; newBalance: number }> {
  await ensureSchema();
  if (input.amount < 10) {
    throw new Error('Mức cược tối thiểu khi tham gia đặt cược là 10 🪙 Ryucoin.');
  }

  const bet = await getBet(input.betId);
  if (!bet) throw new Error('Kèo cược không tồn tại.');
  if (bet.status !== 'open') {
    throw new Error(bet.status === 'locked'
      ? '🔒 Kèo cược này đã bị khóa nhận cược (đang thi đấu)! Không thể đặt cược thêm.'
      : '❌ Kèo cược này đã kết thúc!');
  }

  // Lấy rating hiện tại
  const rating = await getRating(input.guildId, input.userId);
  if (rating.ryucoin < input.amount) {
    throw new Error(`Bạn không đủ Ryucoin! Ví hiện có **${rating.ryucoin} 🪙**, cần **${input.amount} 🪙**. Dùng \`/balance\` để kiểm tra số dư.`);
  }
  const entryId = randomUUID();
  // Insert entry (cho phép đặt cược nhiều lần)
  const [entryRow] = await query(
    `INSERT INTO ryusei_bet_entries (id, bet_id, user_id, player_choice, amount, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [entryId, input.betId, input.userId, input.playerChoice, input.amount, Date.now()]
  );
  if (!entryRow) throw new Error('Không thể ghi nhận lượt đặt cược.');
  // Trừ coin từ global ratings
  const [ratingRow] = await query(
    `UPDATE ryusei_global_ratings SET ryucoin = ryucoin - $2 WHERE user_id = $1 RETURNING ryucoin`,
    [input.userId, input.amount]
  );
  return {
    entry: {
      betId: String(entryRow.bet_id),
      userId: String(entryRow.user_id),
      playerChoice: String(entryRow.player_choice),
      amount: Number(entryRow.amount),
      createdAt: Number(entryRow.created_at),
    },
    newBalance: Number(ratingRow?.ryucoin ?? 0),
  };
}

export async function closeBet(input: {
  betId: string;
  guildId: string;
  winner: string;
}): Promise<{ payouts: Array<{ userId: string; amount: number }>; houseKeep: number; totalPool: number }> {
  await ensureSchema();
  const bet = await getBet(input.betId);
  if (!bet || bet.status === 'closed') throw new Error('Bet không tồn tại hoặc đã đóng.');
  const entries = await getBetEntries(input.betId);

  // Đóng bet
  await query(
    `UPDATE ryusei_bets SET status = 'closed', winner = $2, ended_at = $3 WHERE id = $1`,
    [input.betId, input.winner, Date.now()]
  );

  if (!entries.length) {
    return { payouts: [], houseKeep: 0, totalPool: 0 };
  }

  const totalPool = entries.reduce((s, e) => s + e.amount, 0);
  const winnerEntries = entries.filter(e => e.playerChoice === input.winner);
  const winnerPool = winnerEntries.reduce((s, e) => s + e.amount, 0);

  // House edge 10% — phân phối 90%
  const distributable = Math.floor(totalPool * 0.90);
  const houseKeep = totalPool - distributable;

  const payoutsMap = new Map<string, number>();

  if (winnerPool > 0) {
    for (const entry of winnerEntries) {
      // Tỉ lệ đóng góp × pool phân phối
      const payout = Math.floor((entry.amount / winnerPool) * distributable);
      if (payout > 0) {
        await query(
          `UPDATE ryusei_global_ratings SET ryucoin = ryucoin + $2 WHERE user_id = $1`,
          [entry.userId, payout]
        );
        payoutsMap.set(entry.userId, (payoutsMap.get(entry.userId) || 0) + payout);
      }
    }
  }

  const payouts = Array.from(payoutsMap.entries()).map(([userId, amount]) => ({ userId, amount }));

  if (houseKeep > 0) {
    await depositToBank(MAIN_GUILD_ID, houseKeep).catch(err => console.error('Lỗi nạp phí phế bet vào bank chính:', err));
  }

  return { payouts, houseKeep, totalPool };
}

export interface DailyClaimResult {
  alreadyClaimed: boolean;
  reward: number;
  streak: number;
  bonusCoins: number;
  newRyucoin: number;
  nextResetTimestamp: number;
}

export async function setDailyRoleReward(guildId: string, roleId: string, amount: number): Promise<void> {
  await ensureSchema();
  const now = Date.now();
  await query(
    `INSERT INTO ryusei_daily_role_rewards (guild_id, role_id, amount, created_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (guild_id, role_id) DO UPDATE SET amount = EXCLUDED.amount`,
    [guildId, roleId, amount, now],
  );
}

export async function removeDailyRoleReward(guildId: string, roleId: string): Promise<boolean> {
  await ensureSchema();
  const rows = await query(
    `DELETE FROM ryusei_daily_role_rewards WHERE guild_id = $1 AND role_id = $2 RETURNING role_id`,
    [guildId, roleId],
  );
  return rows.length > 0;
}

export async function getDailyRoleRewards(guildId: string): Promise<{ roleId: string; amount: number }[]> {
  await ensureSchema();
  const rows = await query(
    `SELECT role_id, amount FROM ryusei_daily_role_rewards WHERE guild_id = $1 ORDER BY amount DESC`,
    [guildId],
  );
  return rows.map((r: any) => ({
    roleId: String(r.role_id),
    amount: Number(r.amount),
  }));
}

export async function setDefaultDailyRole(guildId: string, roleId: string): Promise<void> {
  await ensureSchema();
  const now = Date.now();
  await query(
    `INSERT INTO ryusei_ladder_settings (guild_id, mod_role_id, mod_role_ids, result_timeout_minutes, default_daily_role_id, updated_at)
     VALUES ($1, '', '{}'::text[], 10, $2, $3)
     ON CONFLICT (guild_id) DO UPDATE SET default_daily_role_id = EXCLUDED.default_daily_role_id, updated_at = EXCLUDED.updated_at`,
    [guildId, roleId, now],
  );
}

export async function getEffectiveDailyRewardForRoles(guildId: string, userRoleIds: string[]): Promise<{ total: number; baseBonus: number }> {
  await ensureSchema();

  const settings = await getSettings(guildId);
  let baseBonus = 20;

  if (settings?.defaultDailyRoleId) {
    const defaultRows = await query(
      `SELECT amount FROM ryusei_daily_role_rewards WHERE guild_id = $1 AND role_id = $2`,
      [guildId, settings.defaultDailyRoleId],
    );
    if (defaultRows && defaultRows[0]) {
      baseBonus = Number(defaultRows[0].amount);
    }
  } else {
    const minRows = await query(
      `SELECT amount FROM ryusei_daily_role_rewards WHERE guild_id = $1 ORDER BY amount ASC LIMIT 1`,
      [guildId],
    );
    if (minRows && minRows[0]) {
      baseBonus = Number(minRows[0].amount);
    }
  }

  if (!userRoleIds || userRoleIds.length === 0) {
    return { total: 0, baseBonus };
  }

  const rows = await query(
    `SELECT SUM(amount)::int AS total FROM ryusei_daily_role_rewards WHERE guild_id = $1 AND role_id = ANY($2::text[])`,
    [guildId, userRoleIds],
  );
  const total = (rows && rows[0] && rows[0].total !== null) ? Number(rows[0].total) : 0;

  return { total, baseBonus };
}

export async function claimDaily(
  guildId: string,
  userId: string,
  userName?: string,
  userRoleIds: string[] = [],
): Promise<DailyClaimResult> {
  await ensureSchema();
  const now = Date.now();
  const OFFSET_MS = 7 * 60 * 60 * 1000; // UTC+7
  const currentDayIndex = Math.floor((now + OFFSET_MS) / (24 * 60 * 60 * 1000));
  const nextResetMs = (currentDayIndex + 1) * (24 * 60 * 60 * 1000) - OFFSET_MS;
  const nextResetTimestamp = Math.floor(nextResetMs / 1000);

  const rating = await getRating(guildId, userId, userName);
  const lastClaimMs = rating.lastDailyClaim || 0;
  const lastClaimDayIndex = lastClaimMs > 0 ? Math.floor((lastClaimMs + OFFSET_MS) / (24 * 60 * 60 * 1000)) : -1;

  if (lastClaimDayIndex === currentDayIndex) {
    return {
      alreadyClaimed: true,
      reward: 0,
      streak: rating.dailyStreak || 0,
      bonusCoins: 0,
      newRyucoin: rating.ryucoin,
      nextResetTimestamp,
    };
  }

  let newStreak = 1;
  if (lastClaimDayIndex === currentDayIndex - 1) {
    newStreak = (rating.dailyStreak || 0) + 1;
  }

  const { total, baseBonus } = await getEffectiveDailyRewardForRoles(guildId, userRoleIds);
  const baseReward = total;
  const bonusCoins = (newStreak % 7 === 0) ? baseBonus : 0;
  const reward = baseReward + bonusCoins;

  const [row] = await query(
    `UPDATE ryusei_global_ratings
     SET ryucoin = ryucoin + $1,
         daily_streak = $2,
         last_daily_claim = $3::bigint,
         updated_at = $4::bigint,
         user_name = COALESCE($5, user_name)
     WHERE user_id = $6
     RETURNING *`,
    [reward, newStreak, now, now, userName || null, userId],
  );

  const updatedRating = row ? ratingFrom(row) : rating;

  return {
    alreadyClaimed: false,
    reward,
    streak: newStreak,
    bonusCoins,
    newRyucoin: updatedRating.ryucoin,
    nextResetTimestamp,
  };
}

export async function transferRyucoin(input: {
  guildId: string;
  senderId: string;
  senderName?: string;
  recipientId: string;
  recipientName?: string;
  amount: number;
}): Promise<{ tax: number; receivedAmount: number; senderNewBalance: number; recipientNewBalance: number }> {
  await ensureSchema();
  const cleanAmount = Math.ceil(input.amount);
  if (cleanAmount < 20) throw new Error('Số lượng Ryucoin chuyển tối thiểu phải từ 20 🪙 trở lên.');

  const [senderRating] = await Promise.all([
    getRating(input.guildId, input.senderId, input.senderName),
    getRating(input.guildId, input.recipientId, input.recipientName),
  ]);

  if (senderRating.ryucoin < cleanAmount) {
    throw new Error(`Bạn không đủ Ryucoin! Ví hiện có **${senderRating.ryucoin} 🪙**, không đủ để chuyển **${cleanAmount} 🪙**.`);
  }

  const tax = Math.ceil(cleanAmount * 0.05);
  const receivedAmount = cleanAmount - tax;
  const now = Date.now();

  const results = await executeTx(tx => [
    tx.query(
      `UPDATE ryusei_global_ratings
       SET ryucoin = ryucoin - $2, updated_at = $3, user_name = COALESCE($4, user_name)
       WHERE user_id = $1
       RETURNING ryucoin`,
      [input.senderId, cleanAmount, now, input.senderName || null]
    ),
    tx.query(
      `UPDATE ryusei_global_ratings
       SET ryucoin = ryucoin + $2, updated_at = $3, user_name = COALESCE($4, user_name)
       WHERE user_id = $1
       RETURNING ryucoin`,
      [input.recipientId, receivedAmount, now, input.recipientName || null]
    ),
  ]) as unknown as DbRow[][];

  if (tax > 0) {
    await depositToBank(MAIN_GUILD_ID, tax).catch(err => console.error('Lỗi nạp thuế 5% vào bank chính:', err));
  }

  const senderRow = results[0]?.[0];
  const recipientRow = results[1]?.[0];

  return {
    tax,
    receivedAmount,
    senderNewBalance: Number(senderRow?.ryucoin ?? 0),
    recipientNewBalance: Number(recipientRow?.ryucoin ?? 0),
  };
}

export interface BankInfo {
  guildId: string;
  balance: number;
  authorizedUserIds: string[];
  updatedAt: number;
}

export async function getBank(guildId: string = MAIN_GUILD_ID): Promise<BankInfo> {
  await ensureSchema();
  // Tất cả các dòng tiền ngân hàng mặc định trỏ về MAIN_GUILD_ID (server chính)
  const targetGuildId = MAIN_GUILD_ID;
  const rows = await query(`SELECT * FROM ryusei_bank WHERE guild_id = $1`, [targetGuildId]);
  if (rows && rows[0]) {
    return {
      guildId: String(rows[0].guild_id),
      balance: Number(rows[0].balance) || 0,
      authorizedUserIds: Array.isArray(rows[0].authorized_user_ids) ? (rows[0].authorized_user_ids as string[]) : [],
      updatedAt: Number(rows[0].updated_at) || Date.now(),
    };
  }
  return {
    guildId: targetGuildId,
    balance: 0,
    authorizedUserIds: [],
    updatedAt: Date.now(),
  };
}

export async function depositToBank(guildId: string = MAIN_GUILD_ID, amount: number): Promise<number> {
  if (amount <= 0) return 0;
  await ensureSchema();
  // Tất cả tiền gửi vào ngân hàng đổ về server chính MAIN_GUILD_ID
  const targetGuildId = MAIN_GUILD_ID;
  const now = Date.now();
  const rows = await query(
    `INSERT INTO ryusei_bank (guild_id, balance, updated_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (guild_id)
     DO UPDATE SET balance = ryusei_bank.balance + $2, updated_at = $3
     RETURNING balance`,
    [targetGuildId, amount, now]
  );
  return Number(rows[0]?.balance ?? 0);
}

export async function setBankManagers(guildId: string, userIds: string[]): Promise<string[]> {
  await ensureSchema();
  // Cấu hình quản lý ngân hàng chính (MAIN_GUILD_ID)
  const targetGuildId = MAIN_GUILD_ID;
  const validUserIds = userIds.slice(0, 2);
  const now = Date.now();
  await query(
    `INSERT INTO ryusei_bank (guild_id, balance, authorized_user_ids, updated_at)
     VALUES ($1, 0, $2, $3)
     ON CONFLICT (guild_id)
     DO UPDATE SET authorized_user_ids = $2, updated_at = $3`,
    [targetGuildId, validUserIds, now]
  );
  return validUserIds;
}

export async function withdrawFromBank(input: {
  guildId: string;
  executorId: string;
  recipientId: string;
  recipientName?: string;
  amount: number;
}): Promise<{ bankBalance: number; recipientNewBalance: number }> {
  await ensureSchema();
  const cleanAmount = Math.ceil(input.amount);
  if (cleanAmount <= 0) throw new Error('Số lượng Ryucoin cấp phải lớn hơn 0.');

  const bank = await getBank(MAIN_GUILD_ID);

  const isSuperAdmin =
    input.executorId === SUPER_ADMIN_ID ||
    input.executorId === '873563860991365141' ||
    (process.env.SUPER_ADMIN_ID && input.executorId === process.env.SUPER_ADMIN_ID) ||
    (process.env.ADMIN_USER_ID && input.executorId === process.env.ADMIN_USER_ID);

  if (bank.authorizedUserIds.length > 0 && !bank.authorizedUserIds.includes(input.executorId) && !isSuperAdmin) {
    throw new Error('🚫 Bạn không có quyền điều phối Ngân Hàng Admin. Chỉ 2 Quản lý Ngân hàng được chỉ định mới có quyền dùng lệnh này.');
  }

  if (bank.balance < cleanAmount) {
    throw new Error(`❌ Quỹ Ngân Hàng Admin không đủ số dư! Quỹ hiện có **${bank.balance} 🪙**, không đủ để cấp **${cleanAmount} 🪙**.`);
  }

  const now = Date.now();

  const results = await executeTx(tx => [
    tx.query(
      `UPDATE ryusei_bank SET balance = balance - $2, updated_at = $3 WHERE guild_id = $1 RETURNING balance`,
      [MAIN_GUILD_ID, cleanAmount, now]
    ),
    tx.query(
      `UPDATE ryusei_global_ratings
       SET ryucoin = ryucoin + $2, updated_at = $3, user_name = COALESCE($4, user_name)
       WHERE user_id = $1
       RETURNING ryucoin`,
      [input.recipientId, cleanAmount, now, input.recipientName || null]
    ),
  ]) as unknown as DbRow[][];

  const bankRow = results[0]?.[0];
  const recipientRow = results[1]?.[0];

  return {
    bankBalance: Number(bankRow?.balance ?? 0),
    recipientNewBalance: Number(recipientRow?.ryucoin ?? 0),
  };
}

export async function updateMatchControlMessageId(id: string, messageId: string): Promise<void> {
  await ensureSchema();
  await query(
    `UPDATE ryusei_ladder_matches SET control_message_id = $2 WHERE id = $1`,
    [id, messageId]
  );
}

export async function updateMatchProofImage(id: string, imageUrl: string): Promise<void> {
  await ensureSchema();
  await query(
    `UPDATE ryusei_ladder_matches SET proof_image_url = $2 WHERE id = $1`,
    [id, imageUrl]
  );
}

export async function isUserBlacklisted(guildId: string, userId: string): Promise<boolean> {
  await ensureSchema();
  const now = Date.now();
  // Xóa các bản ghi đã hết hạn (trừ trường hợp vĩnh viễn expires_at = 0)
  await query(`DELETE FROM ryusei_blacklist WHERE guild_id = $1 AND expires_at > 0 AND expires_at < $2`, [guildId, now]);
  
  const res = await query(`SELECT * FROM ryusei_blacklist WHERE guild_id = $1 AND user_id = $2`, [guildId, userId]);
  return res.length > 0;
}

export async function clearMatchProofImage(matchId: string): Promise<void> {
  await ensureSchema();
  await query(`UPDATE matches SET proof_image_url = NULL WHERE id = $1`, [matchId]);
}


export async function saveCustomThumbnail(userId: string, imageData: string, mimeType: string): Promise<void> {
  await ensureSchema();
  await query(
    `INSERT INTO ryusei_custom_thumbnails (user_id, image_data, mime_type, updated_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id) DO UPDATE SET image_data = $2, mime_type = $3, updated_at = $4`,
    [userId, imageData, mimeType, Date.now()]
  );
}

export async function getCustomThumbnail(userId: string): Promise<{ imageData: string; mimeType: string } | null> {
  await ensureSchema();
  const rows = await query<DbRow>(
    `SELECT image_data, mime_type FROM ryusei_custom_thumbnails WHERE user_id = $1`,
    [userId]
  );
  if (!rows[0]) return null;
  return {
    imageData: String(rows[0].image_data),
    mimeType: String(rows[0].mime_type || 'image/png'),
  };
}

export async function setUserThumbnail(guildId: string, userId: string, url: string): Promise<void> {
  await ensureSchema();
  const now = Date.now();
  await query(
    `INSERT INTO ryusei_global_ratings (user_id, thumbnail_url, updated_at)
     VALUES ($2, $1, $3)
     ON CONFLICT (user_id) DO UPDATE SET thumbnail_url = $1`,
    [url, userId, now]
  );
}

export async function unlockUserAchievement(userId: string, achievementId: string): Promise<boolean> {
  await ensureSchema();
  const now = Date.now();
  // Dùng ON CONFLICT DO NOTHING để bỏ qua nếu đã mở khóa rồi
  const rows = await query(
    `INSERT INTO ryusei_user_achievements (user_id, achievement_id, unlocked_at) 
     VALUES ($1, $2, $3) 
     ON CONFLICT (user_id, achievement_id) DO NOTHING 
     RETURNING user_id`,
    [userId, achievementId, now]
  );
  return rows.length > 0; // Nếu length > 0 tức là mới mở khóa thành công
}

export async function getUserAchievements(userId: string): Promise<string[]> {
  await ensureSchema();
  const rows = await query(
    `SELECT achievement_id FROM ryusei_user_achievements WHERE user_id = $1 ORDER BY unlocked_at ASC`, 
    [userId]
  );
  return rows.map((row: any) => String(row.achievement_id));
}

export async function setSelectedAchievements(userId: string, achievementsList: string[]): Promise<void> {
  await ensureSchema();
  const jsonStr = JSON.stringify(achievementsList);
  await query(
    `UPDATE ryusei_global_ratings SET selected_achievements = $2 WHERE user_id = $1`,
    [userId, jsonStr]
  );
}

export interface AchievementConfigRow {
  id: string;
  category: 'match' | 'economy';
  name: string;
  icon: string;
  description: string;
  rewardCoins: number;
  rewardRoleId?: string;
  conditionType: string;
  conditionValue: string;
}

export async function getAllAchievementsConfig(): Promise<AchievementConfigRow[]> {
  await ensureSchema();
  const rows = await query(`SELECT * FROM ryusei_achievements_config`);
  return rows.map((r: any) => ({
    id: String(r.id),
    category: r.category as 'match' | 'economy',
    name: String(r.name),
    icon: String(r.icon),
    description: String(r.description),
    rewardCoins: Number(r.reward_coins),
    rewardRoleId: r.reward_role_id ? String(r.reward_role_id) : undefined,
    conditionType: String(r.condition_type),
    conditionValue: String(r.condition_value),
  }));
}

export async function getUserWeeklyPass(userId: string): Promise<{ expiresAt: number } | null> {
  const rows = await query(`SELECT expires_at FROM ryu_weekly_passes WHERE user_id = $1`, [userId]);
  if (rows.length === 0) return null;
  const pass = rows[0] as any;
  const expiresAt = Number(pass.expires_at);
  if (expiresAt < Date.now()) {
    // Đã hết hạn thì xóa luôn
    await query(`DELETE FROM ryu_weekly_passes WHERE user_id = $1`, [userId]);
    return null;
  }
  return { expiresAt };
}

export async function buyWeeklyPass(guildId: string, userId: string, durationDays: number = 7): Promise<{ expiresAt: number }> {
  // 1. Kiểm tra xem user có đang có thẻ còn hạn không
  const existing = await getUserWeeklyPass(userId);
  const now = Date.now();

  if (existing && existing.expiresAt > now) {
    throw new Error('Bạn vẫn đang sở hữu một Thẻ Tuần còn hiệu lực. Không thể mua thêm thẻ mới lúc này!');
  }

  // 2. Nếu chưa có hoặc thẻ cũ đã hết hạn (đã tự động xóa ở getUserWeeklyPass), tạo thẻ mới hoàn toàn
  const durationMs = durationDays * 24 * 60 * 60_000;
  const expiresAt = now + durationMs;

  await query(
    `INSERT INTO ryu_weekly_passes (user_id, guild_id, expires_at, purchased_at) 
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id) 
     DO UPDATE SET expires_at = $3, purchased_at = $4`,
    [userId, guildId, expiresAt, now]
  );

  return { expiresAt };
}

export async function checkIfUserClaimedToday(guildId: string, userId: string): Promise<boolean> {
  const rows = await query(
    `SELECT last_daily_claim FROM ryusei_global_ratings WHERE guild_id = $1 AND user_id = $2`,
    [guildId, userId]
  );
  
  if (rows.length === 0) return false;
  
  const row = rows[0] as any;
  if (!row.last_daily_claim) return false;

  const lastClaimMs = Number(row.last_daily_claim);
  if (lastClaimMs <= 0) return false;

  const now = Date.now();
  const OFFSET_MS = 7 * 60 * 60 * 1000; // UTC+7 chuẩn như claimDaily
  
  // Tính index ngày hiện tại và index ngày claim cuối cùng theo đúng công thức của bot
  const currentDayIndex = Math.floor((now + OFFSET_MS) / (24 * 60 * 60 * 1000));
  const lastClaimDayIndex = Math.floor((lastClaimMs + OFFSET_MS) / (24 * 60 * 60 * 1000));

  // Nếu chung một Day Index nghĩa là hôm nay đã điểm danh rồi!
  return lastClaimDayIndex === currentDayIndex;
}

export interface RyuseiBill {
  id: string;
  guildId: string;
  channelId: string;
  messageId?: string;
  creatorId: string;
  customerId?: string;
  title: string;
  packageDuration?: string;
  amount: number;
  status: 'pending' | 'paid' | 'cancelled' | 'expired';
  payerId?: string;
  createdAt: number;
  paidAt?: number;
  expiresAt?: number;
}

export async function createBill(input: {
  id: string;
  guildId: string;
  channelId: string;
  messageId?: string;
  creatorId: string;
  customerId?: string;
  title: string;
  packageDuration?: string;
  amount: number;
  expiresInMinutes?: number;
}): Promise<void> {
  await ensureSchema();
  const now = Date.now();
  const expiresAt = now + (input.expiresInMinutes || 30) * 60 * 1000;
  await query(
    `INSERT INTO ryusei_bills (id, guild_id, channel_id, message_id, creator_id, customer_id, title, package_duration, amount, status, created_at, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', $10, $11)`,
    [
      input.id,
      input.guildId,
      input.channelId,
      input.messageId || null,
      input.creatorId,
      input.customerId || null,
      input.title,
      input.packageDuration || null,
      input.amount,
      now,
      expiresAt,
    ]
  );
}

export async function updateBillMessageId(id: string, messageId: string): Promise<void> {
  await ensureSchema();
  await query(`UPDATE ryusei_bills SET message_id = $1 WHERE id = $2`, [messageId, id]);
}

export async function getBill(id: string): Promise<RyuseiBill | undefined> {
  await ensureSchema();
  const rows = await query(`SELECT * FROM ryusei_bills WHERE id = $1`, [id]);
  if (!rows[0]) return undefined;
  const r = rows[0] as any;
  return {
    id: String(r.id),
    guildId: String(r.guild_id),
    channelId: String(r.channel_id),
    messageId: r.message_id ? String(r.message_id) : undefined,
    creatorId: String(r.creator_id),
    customerId: r.customer_id ? String(r.customer_id) : undefined,
    title: String(r.title),
    packageDuration: r.package_duration ? String(r.package_duration) : undefined,
    amount: Number(r.amount),
    status: String(r.status) as 'pending' | 'paid' | 'cancelled' | 'expired',
    payerId: r.payer_id ? String(r.payer_id) : undefined,
    createdAt: Number(r.created_at),
    paidAt: r.paid_at ? Number(r.paid_at) : undefined,
    expiresAt: r.expires_at ? Number(r.expires_at) : undefined,
  };
}

export async function markBillPaid(id: string, payerId?: string): Promise<RyuseiBill | undefined> {
  await ensureSchema();
  const now = Date.now();
  await query(
    `UPDATE ryusei_bills SET status = 'paid', payer_id = $1, paid_at = $2 WHERE id = $3 AND status = 'pending'`,
    [payerId || null, now, id]
  );
  return getBill(id);
}

export async function cancelBill(id: string): Promise<void> {
  await ensureSchema();
  await query(`UPDATE ryusei_bills SET status = 'cancelled' WHERE id = $1 AND status = 'pending'`, [id]);
}

export async function expireBill(id: string): Promise<void> {
  await ensureSchema();
  await query(`UPDATE ryusei_bills SET status = 'expired' WHERE id = $1 AND status = 'pending'`, [id]);
}

export async function getOverduePendingBills(): Promise<RyuseiBill[]> {
  await ensureSchema();
  const now = Date.now();
  const rows = await query(
    `SELECT * FROM ryusei_bills WHERE status = 'pending' AND expires_at IS NOT NULL AND expires_at < $1`,
    [now]
  );
  return rows.map((r: any) => ({
    id: String(r.id),
    guildId: String(r.guild_id),
    channelId: String(r.channel_id),
    messageId: r.message_id ? String(r.message_id) : undefined,
    creatorId: String(r.creator_id),
    customerId: r.customer_id ? String(r.customer_id) : undefined,
    title: String(r.title),
    packageDuration: r.package_duration ? String(r.package_duration) : undefined,
    amount: Number(r.amount),
    status: String(r.status) as 'pending' | 'paid' | 'cancelled' | 'expired',
    payerId: r.payer_id ? String(r.payer_id) : undefined,
    createdAt: Number(r.created_at),
    paidAt: r.paid_at ? Number(r.paid_at) : undefined,
    expiresAt: r.expires_at ? Number(r.expires_at) : undefined,
  }));
}