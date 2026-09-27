import { 
  addRyucoin, 
  unlockUserAchievement, 
  getRating, 
  getAllAchievementsConfig, 
  AchievementConfigRow 
} from './database';
import { createMessage, discordRequest } from './discord';

const ACHIEVEMENT_CHANNEL_ID = '1521132436183060530'; 

// ==========================================
// BỘ NHỚ TẠM (CACHE) & HÀM HIỂN THỊ
// ==========================================

// Hàm tự động tải dữ liệu ngầm nếu chưa có
export async function getAchievementsList() {
  try {
    const configs = await getAllAchievementsConfig();
    return configs.map(conf => ({
      id: conf.id,
      category: conf.category,
      name: conf.name,
      icon: conf.icon,
      description: conf.description,
      rewardCoins: conf.rewardCoins,
      rewardRoleId: conf.rewardRoleId,
      check: buildCheckFunction(conf)
    }));
  } catch (e) {
    console.error('[Thành tựu] Lỗi khi tải dữ liệu thành tựu từ Neon DB:', e);
    return [];
  }
}

// Hàm thông báo chung
async function sendAchievementNotification(
  userId: string, 
  ach: { name: string; icon: string; description: string; rewardCoins: number; rewardRoleId?: string }, 
  justReclaimed: boolean = false
) {
  if (!justReclaimed) {
    await createMessage(ACHIEVEMENT_CHANNEL_ID, {
      content: `🎉 **CHÚC MỪNG <@${userId}> NHẬN THÀNH TỰU MỚI!** 🎉`,
      embeds: [{
        color: 0xFFD700,
        title: `${ach.icon} ${ach.name}`,
        description: `<@${userId}> vừa mở khóa thành tựu này!\n\n**Mô tả:** ${ach.description}\n**Phần thưởng:** ${ach.rewardCoins >= 0 ? '+' : ''}${ach.rewardCoins} 🪙 Ryucoin${ach.rewardRoleId ? ` và được phong tước hiệu <@&${ach.rewardRoleId}>` : ''}`,
        footer: { text: 'Ryusei VGC Achievements' }
      }],
      allowed_mentions: { users: [userId] }
    }).catch(err => console.error('Không gửi được log thành tựu:', err));
  } else {
    await createMessage(ACHIEVEMENT_CHANNEL_ID, {
      content: `🔄 <@${userId}> vừa xuất sắc đoạt lại danh hiệu <@&${ach.rewardRoleId}> từ thành tựu **${ach.name}**!`,
      allowed_mentions: { users: [userId] }
    }).catch(err => console.error('Không gửi được log đoạt lại danh hiệu:', err));
  }
}

// ==========================================
// ĐỘNG CƠ DỊCH DỮ LIỆU (CONDITION ENGINE)
// ==========================================

// Máy dịch: Chuyển chuỗi condition_type từ DB thành hàm code
function buildCheckFunction(ach: AchievementConfigRow) {
  return (stats: any, context?: any) => {
    try {
      // 1. Chuẩn bị sẵn một bộ biến môi trường để "truyền" vào biểu thức
      const wins = stats.wins || 0;
      const losses = stats.losses || 0;
      const draws = stats.draws || 0;
      const totalMatches = stats.totalMatches || (wins + losses + draws);
      const ryucoin = stats.ryucoin || 0;
      const dailyStreak = stats.dailyStreak || 0;
      
      // Tính toán sẵn tỷ lệ thắng (Win rate) để trong data chỉ việc gọi biến win_rate
      const win_rate = losses > 0 ? (wins / (losses + wins)) * 100 : 0;
      
      const isWin = context?.isWin ?? false;
      const opponentRoles = context?.opponentRoles || [];
      const opponentId = context?.opponentId || '';

      const condType = (ach.conditionType || '').trim().toLowerCase();

      // 2. Nếu conditionType là 'wins' hoặc 'ryucoin' đơn thuần
      if (condType === 'wins') return wins >= Number(ach.conditionValue);
      if (condType === 'ryucoin') return ryucoin >= Number(ach.conditionValue);

      // 3. Nếu conditionType là 'expression' hoặc conditionValue chứa biểu thức so sánh
      if (condType === 'expression' || /[\><=!&|]/.test(ach.conditionValue || '')) {
        const evaluate = new Function(
          'wins', 'losses', 'draws', 'totalMatches', 'ryucoin', 'dailyStreak', 'win_rate', 'isWin', 'opponentRoles', 'opponentId',
          `return (${ach.conditionValue});`
        );
        return Boolean(evaluate(wins, losses, draws, totalMatches, ryucoin, dailyStreak, win_rate, isWin, opponentRoles, opponentId));
      }

    } catch (e) {
      console.error(`[Thành tựu] Lỗi phân tích biểu thức cho thành tựu [${ach.id}]:`, e);
    }
    return false;
  };
}

// ==========================================
// CÁC HÀM QUÉT KIỂM TRA ĐIỀU KIỆN
// ==========================================

export async function checkMatchAchievements(guildId: string, userId: string, stats: any, matchContext: any) {
  const totalMatches = stats.wins + stats.losses + stats.draws;
  let opponentRoles: string[] = [];
  let userRoles: string[] = [];

  // Lấy Role đối thủ (chỉ khi có opponentId)
  if (matchContext.opponentId) {
    try {
      const oppMember = await discordRequest(`/guilds/${guildId}/members/${matchContext.opponentId}`) as any;
      opponentRoles = oppMember?.roles || [];
    } catch (e) {}
  }

  // Lấy Role của bản thân
  try {
    const userMember = await discordRequest(`/guilds/${guildId}/members/${userId}`) as any;
    userRoles = userMember?.roles || [];
  } catch (e) {}
  
  // 👇 GỌI HÀM LẤY DANH SÁCH MỚI NHẤT TỪ DATABASE TẠI ĐÂY
  const allAchs = await getAchievementsList();
  const matchAchs = allAchs.filter(a => a.category === 'match');

  for (const ach of matchAchs) {
    if (ach.check({ ...stats, totalMatches }, { isWin: matchContext.isWin, opponentRoles, opponentId: matchContext.opponentId })) {
      
      let justReclaimedRole = false;
      if (ach.rewardRoleId && !userRoles.includes(ach.rewardRoleId)) {
        try {
          await discordRequest(`/guilds/${guildId}/members/${userId}/roles/${ach.rewardRoleId}`, { method: 'PUT' });
          justReclaimedRole = true;
        } catch (err) {}
      }
      
      const isNew = await unlockUserAchievement(userId, ach.id);
      if (isNew) {
        await addRyucoin(guildId, userId, ach.rewardCoins).catch(console.error);
        await sendAchievementNotification(userId, ach, false);
      } else if (justReclaimedRole) {
        await sendAchievementNotification(userId, ach, true);
      }
    }
  }
}

export async function checkEconomyAchievements(guildId: string, userId: string) {
  const userRating = await getRating(guildId, userId);
  
  const economyData = {
    ryucoin: userRating.ryucoin,
    dailyStreak: userRating.dailyStreak || 0,
    totalSpends: 0 
  };

  let userRoles: string[] = [];
  try {
    const userMember = await discordRequest(`/guilds/${guildId}/members/${userId}`) as any;
    userRoles = userMember?.roles || [];
  } catch (e) {}

  // GỌI HÀM LẤY DANH SÁCH MỚI NHẤT TỪ DATABASE TẠI ĐÂY
  const allAchs = await getAchievementsList();
  const economyAchs = allAchs.filter(a => a.category === 'economy');

  for (const ach of economyAchs) {
    if (ach.check(economyData)) {
      
      let justReclaimedRole = false;
      if (ach.rewardRoleId && !userRoles.includes(ach.rewardRoleId)) {
        try {
          await discordRequest(`/guilds/${guildId}/members/${userId}/roles/${ach.rewardRoleId}`, { method: 'PUT' });
          justReclaimedRole = true;
        } catch (err) {}
      }

      const isNew = await unlockUserAchievement(userId, ach.id);
      if (isNew) {
        await addRyucoin(guildId, userId, ach.rewardCoins).catch(console.error);
        await sendAchievementNotification(userId, ach, false);
      } else if (justReclaimedRole) {
        await sendAchievementNotification(userId, ach, true);
      }
    }
  }
}