import { Client, GatewayIntentBits, Partials, EmbedBuilder, Message } from 'discord.js';
import { joinVoiceChannel, getVoiceConnection } from '@discordjs/voice';
import { config } from 'dotenv';
import { handleTextCommand } from './text-commands.js';

config(); // Nạp .env đầu tiên (chứa DISCORD_TOKEN thực)
config({ path: '.env.real' }); // Nạp .env.real (chứa DATABASE_URL)
config({ path: '.env.production.local' });
config({ path: '.env.local' });

// Nếu DISCORD_TOKEN bị dán nhãn "[SENSITIVE]", lọc bỏ và nạp lại từ .env
if (process.env.DISCORD_TOKEN === '[SENSITIVE]') {
  delete process.env.DISCORD_TOKEN;
  config({ override: true });
}

const token = process.env.DISCORD_TOKEN;
const ADMIN_USER_ID = process.env.ADMIN_USER_ID || '983625547076739102';

if (!token) {
  console.error('Thiếu DISCORD_TOKEN trong file .env');
  process.exit(1);
}

import { ensureSchema } from './serverless/database.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel, Partials.Message],
});

const processedMessageIds = new Set<string>();

client.on('ready', async () => {
  console.log(`✅ [Bot Gateway] Bot ${client.user?.tag} đã kết nối Gateway!`);
  console.log('📌 Tính năng Gateway active:');
  console.log(' - Voice: Chat "@Bot join" hoặc "@Bot leave"');
  console.log(` - Auto-Forward DM: Tự động chuyển tiếp tin nhắn DM của user về Admin (${ADMIN_USER_ID})`);
  
  // Pre-warm Database connection & schema migration ngay khi bot khởi động
  ensureSchema().then(() => {
    console.log('⚡ [Database] Kết nối & Schema Database đã sẵn sàng!');
  }).catch(err => console.error('⚠️ [Database Warmup Error]', err));
});

client.on('messageCreate', async (message: Message) => {
  // Xử lý Text Commands (VD: bank give @user <amount>, bank) cho Super Admin & Bot Account
  const handled = await handleTextCommand(message, client);
  if (handled) return;

  if (message.author.bot) return;

  // 1. Xử lý tin nhắn DM (Direct Message từ người dùng gửi tới Bot)
  if (!message.guild) {
    // Không chuyển tiếp nếu chính Admin nhắn cho Bot
    if (message.author.id === ADMIN_USER_ID) return;

    // Chống gửi lặp tin nhắn nếu sự kiện bị trùng
    if (processedMessageIds.has(message.id)) return;
    processedMessageIds.add(message.id);
    if (processedMessageIds.size > 1000) {
      const firstKey = processedMessageIds.values().next().value;
      if (firstKey) processedMessageIds.delete(firstKey);
    }

    try {
      const adminUser = await client.users.fetch(ADMIN_USER_ID);
      if (adminUser) {
        const attachmentUrls = message.attachments.map(att => att.url).join('\n');
        const contentText = message.content ? message.content : '*(Không có nội dung văn bản)*';
        const fullContent = attachmentUrls ? `${contentText}\n\n📎 **File đính kèm:**\n${attachmentUrls}` : contentText;

        const embed = new EmbedBuilder()
          .setColor(0x3b82f6)
          .setAuthor({
            name: `📩 DM từ ${message.author.tag} (${message.author.username})`,
            iconURL: message.author.displayAvatarURL(),
          })
          .setDescription(fullContent)
          .addFields(
            { name: '🆔 Người gửi ID', value: `\`${message.author.id}\``, inline: true },
            { name: '💬 Cách trả lời lại', value: `Gõ: \`/say user:<@${message.author.id}> message:...\``, inline: false }
          )
          .setFooter({ text: 'Ryusei Bot DM Forwarder' })
          .setTimestamp();

        await adminUser.send({ embeds: [embed] });
        console.log(`[DM Forward] Đã chuyển tiếp DM từ ${message.author.tag} (${message.author.id}) tới Admin.`);
      }
    } catch (err) {
      console.error('Lỗi khi chuyển tiếp DM tới Admin:', err);
    }
    return;
  }

  // 2. Xử lý tin nhắn trong Guild (Voice join/leave)
  if (!client.user) return;
  const botMentionRegex = new RegExp(`<@!?${client.user.id}>`);
  if (botMentionRegex.test(message.content)) {
    const rawContent = message.content;
    const cleanPrompt = rawContent.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '').trim();
    const lowerPrompt = cleanPrompt.toLowerCase();

    // Lệnh Voice join
    if (lowerPrompt === 'join' || lowerPrompt === 'treo' || lowerPrompt.startsWith('join ') || lowerPrompt.startsWith('treo ')) {
      const member = message.guild.members.cache.get(message.author.id);
      const voiceChannel = member?.voice.channel;

      if (!voiceChannel) {
        await message.reply('❌ Bạn phải vào một kênh Voice trước thì mới tham gia được chứ!');
        return;
      }

      try {
        joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId: message.guild.id,
          adapterCreator: message.guild.voiceAdapterCreator as any,
          selfDeaf: true,
          selfMute: false,
        });
        await message.reply(`✅ Đã tham gia vào kênh **${voiceChannel.name}** và bắt đầu treo.`);
      } catch (error) {
        console.error(error);
        await message.reply('❌ Có lỗi xảy ra khi tham gia Voice.');
      }
      return;
    }

    // Lệnh Voice leave
    if (lowerPrompt === 'leave' || lowerPrompt === 'rời' || lowerPrompt === 'cút' || lowerPrompt.startsWith('leave ') || lowerPrompt.startsWith('rời ') || lowerPrompt.startsWith('cút ')) {
      const connection = getVoiceConnection(message.guild.id);
      if (connection) {
        connection.destroy();
        await message.reply('✅ Đã rời khỏi kênh Voice và ngừng treo.');
      } else {
        await message.reply('❌ Mình có đang ở trong Voice nào đâu ta?');
      }
      return;
    }
  }
});

client.login(token);
