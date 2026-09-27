import { Message, EmbedBuilder, Client } from 'discord.js';
import { withdrawFromBank, getBank, MAIN_GUILD_ID, SUPER_ADMIN_ID } from './serverless/database.js';

const ADMIN_ID = process.env.SUPER_ADMIN_ID || process.env.ADMIN_USER_ID || SUPER_ADMIN_ID;

const THEME = {
  win: 0x4ade80,
  crimson: 0xff4d5e,
  gold: 0xffc24d,
};

export async function handleTextCommand(message: Message, client: Client): Promise<boolean> {
  const content = message.content.trim();
  const lowerContent = content.toLowerCase();

  // 1. Kiểm tra lệnh "bank give" hoặc "!bank give" hoặc "!bank_give" hoặc "bank_give"
  const isBankGive =
    lowerContent.startsWith('bank give') ||
    lowerContent.startsWith('!bank give') ||
    lowerContent.startsWith('bank_give') ||
    lowerContent.startsWith('!bank_give');

  // 2. Kiểm tra lệnh "bank" hoặc "!bank"
  const isBankCheck = lowerContent === 'bank' || lowerContent === '!bank';

  if (!isBankGive && !isBankCheck) {
    return false;
  }

  // 3. Phân quyền: CHỈ Super Admin hoặc chính Bot account (khi dùng DiscordBotClient)
  const isBotAccount = Boolean(client.user?.id && message.author.id === client.user.id);
  const isSuperAdmin = message.author.id === ADMIN_ID || message.author.id === SUPER_ADMIN_ID;

  if (!isBotAccount && !isSuperAdmin) {
    console.log(`[TextCommand] Bỏ qua lệnh từ ${message.author.tag} (${message.author.id}) do không phải Super Admin hoặc Bot Account.`);
    return false;
  }

  const guildId: string = message.guild?.id || MAIN_GUILD_ID;
  const executorId = isBotAccount ? SUPER_ADMIN_ID : message.author.id;

  // Xử lý lệnh bank give
  if (isBankGive) {
    try {
      // 1. Tìm bằng Mention regex <@!?id> hoặc raw numeric ID (17-20 chữ số)
      const userMentionMatch = content.match(/<@!?(\d+)>/) || content.match(/\b(\d{17,20})\b/);
      let targetUserId = userMentionMatch?.[1];

      // 2. Nếu không tìm thấy ID, thử dò người dùng qua tên/nickname khi gõ @Tên (VD: @D)
      if (!targetUserId && message.guild) {
        const atMatch = content.match(/@([^\s]+)/);
        if (atMatch && atMatch[1]) {
          const searchName = atMatch[1].toLowerCase();
          const member = message.guild.members.cache.find(m =>
            m.user.username.toLowerCase().includes(searchName) ||
            m.displayName.toLowerCase().includes(searchName)
          );
          if (member) {
            targetUserId = member.id;
          }
        }
      }

      if (!targetUserId) {
        await message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(THEME.crimson)
              .setTitle('❌ Thao tác thất bại')
              .setDescription('Vui lòng tag người nhận hoặc nhập User ID. Cú pháp: `bank give @user <số_tiền> [lời_nhắn]`'),
          ],
        });
        return true;
      }

      // Trích xuất số tiền (số nguyên dương đầu tiên tìm thấy)
      const args = content.split(/\s+/);
      const amountStr = args.find(arg => /^\d+$/.test(arg) && arg !== targetUserId);
      const amount = amountStr ? parseInt(amountStr, 10) : 0;

      if (!amount || amount <= 0) {
        await message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(THEME.crimson)
              .setTitle('❌ Số tiền không hợp lệ')
              .setDescription('Vui lòng nhập số Ryucoin hợp lệ. Cú pháp: `bank give @user <số_tiền> [lời_nhắn]`'),
          ],
        });
        return true;
      }

      // Trích xuất lời nhắn / ghi chú đi kèm (nếu có)
      let reason = content
        .replace(/^(?:!?(?:bank\s+give|bank_give))/i, '')
        .replace(/<@!?\d+>/, '')
        .replace(/@[^\s]+/, '')
        .replace(/\b\d{17,20}\b/, '')
        .replace(new RegExp(`\\b${amount}\\b`), '')
        .trim();

      // Lấy thông tin người nhận
      let targetUser = client.users.cache.get(targetUserId);
      if (!targetUser) {
        try {
          targetUser = await client.users.fetch(targetUserId);
        } catch {
          // Bỏ qua nếu không fetch được username
        }
      }

      if (targetUser?.bot) {
        await message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(THEME.crimson)
              .setTitle('❌ Thao tác thất bại')
              .setDescription('Không thể cấp Ryucoin từ ngân hàng cho Bot.'),
          ],
        });
        return true;
      }

      // Gọi logic rút ngân hàng từ Database
      const result = await withdrawFromBank({
        guildId,
        executorId,
        recipientId: targetUserId,
        recipientName: targetUser?.username,
        amount,
      });

      const fields: Array<{ name: string; value: string; inline?: boolean }> = [
        { name: '📤 Quỹ Ngân Hàng', value: `Số dư còn lại: **${result.bankBalance.toLocaleString()} 🪙**`, inline: true },
        { name: '📥 Người nhận', value: `<@${targetUserId}>\nSố dư mới: **${result.recipientNewBalance.toLocaleString()} 🪙**`, inline: true },
      ];

      if (reason) {
        fields.push({ name: '💬 Lời nhắn / Ghi chú', value: reason, inline: false });
      }

      const embed = new EmbedBuilder()
        .setColor(THEME.win)
        .setTitle('🏛️ Cấp Thưởng Từ Quỹ Ngân Hàng Admin Thành Công!')
        .setDescription(`<@${executorId}> vừa rút **${amount.toLocaleString()} 🪙 Ryucoin** từ Quỹ Ngân Hàng Admin để trao thưởng cho <@${targetUserId}> (Không trừ thuế)!`)
        .addFields(fields)
        .setFooter({ text: 'Ryusei VGC Bank • Cấp thưởng công khai (miễn thuế)' })
        .setTimestamp();

      await message.reply({
        content: `<@${targetUserId}>`,
        embeds: [embed],
        allowedMentions: { users: [targetUserId] },
      });

      console.log(`[TextCommand] ${message.author.tag} vừa cấp ${amount} Ryucoin cho ${targetUserId}. Ghi chú: "${reason || 'Không có'}"`);
      return true;
    } catch (err: any) {
      console.error('[TextCommand Error]', err);
      await message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(THEME.crimson)
            .setTitle('❌ Lỗi khi thực hiện lệnh')
            .setDescription(err?.message || 'Có lỗi xảy ra khi rút tiền từ ngân hàng.'),
        ],
      });
      return true;
    }
  }

  // Xử lý lệnh bank (xem số dư)
  if (isBankCheck) {
    try {
      const bank = await getBank(MAIN_GUILD_ID);
      const managers = bank.authorizedUserIds.length > 0
        ? bank.authorizedUserIds.map(id => `<@${id}>`).join(', ')
        : 'Chưa cài đặt (Mặc định Admin)';

      const embed = new EmbedBuilder()
        .setColor(THEME.gold)
        .setTitle('🏛️ Quỹ Ngân Hàng Admin Server')
        .setDescription(`Số dư hiện tại của Ngân Hàng: **${bank.balance.toLocaleString()} 🪙 Ryucoin**`)
        .addFields(
          { name: '👥 Quản lý Ngân Hàng', value: managers, inline: false }
        )
        .setFooter({ text: 'Ryusei VGC Bank' })
        .setTimestamp();

      await message.reply({ embeds: [embed] });
      return true;
    } catch (err: any) {
      console.error('[TextCommand Error]', err);
      await message.reply('❌ Không thể lấy thông tin Ngân hàng.');
      return true;
    }
  }

  return false;
}
