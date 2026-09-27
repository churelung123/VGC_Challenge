const fs = require('fs');
let code = fs.readFileSync('src/serverless/interactions.ts', 'utf8');

// 1. Thêm import
code = code.replace(
  "updateCurrentTopUsers,\n} from './database';",
  "updateCurrentTopUsers,\n  addRyucoin,\n  setWallpaper,\n} from './database';\n\nconst WALLPAPERS: Record<string, {name: string, url: string, cost: number}> = {\n  'default': { name: 'Mặc định (Red-Cyan Gradient)', url: '', cost: 0 },\n  'img1': { name: 'Cô gái cầm kiếm', url: 'https://images6.alphacoders.com/613/thumb-1920-613932.png', cost: 20 },\n  'img2': { name: 'Mặt trăng đỏ', url: 'https://images5.alphacoders.com/389/thumb-1920-389247.png', cost: 20 },\n  'img3': { name: 'Thành phố tương lai', url: 'https://images3.alphacoders.com/648/thumb-1920-648583.jpg', cost: 20 },\n  'img4': { name: 'Kỵ sĩ rồng', url: 'https://images.alphacoders.com/662/thumb-1920-662177.jpg', cost: 20 },\n  'img5': { name: 'Vũ trụ', url: 'https://images4.alphacoders.com/137/thumb-1920-1377211.jpg', cost: 20 },\n};\n"
);

// 2. Thêm router
code = code.replace(
  "    case 'say':\n      await handleSay(interaction);\n      return;\n    default:",
  "    case 'say':\n      await handleSay(interaction);\n      return;\n    case 'shop':\n      await handleShop(interaction);\n      return;\n    case 'add-ryucoin':\n      await handleAddRyucoin(interaction);\n      return;\n    default:"
);

// 3. Thêm hàm
code += `
async function handleAddRyucoin(interaction: DiscordInteraction): Promise<void> {
  const actor = actorUser(interaction);
  if (actor.id !== '873563860991365141') {
    await reply(interaction, { content: '🚫 Bạn không có quyền thần thánh này!', flags: 64 });
    return;
  }
  const targetId = stringOption(interaction, 'user');
  const amount = integerOption(interaction, 'amount');
  if (!targetId || !amount) return;
  const guildId = requireGuild(interaction);
  await addRyucoin(guildId, targetId, amount);
  await reply(interaction, { content: \`Đã bơm **\${amount} Ryucoin** cho <@\${targetId}>! 🪙💸\` });
}

async function handleShop(interaction: DiscordInteraction): Promise<void> {
  const options = Object.entries(WALLPAPERS).map(([id, wp]) => ({
    label: wp.name,
    value: id,
    description: id === 'default' ? 'Miễn phí' : \`Giá: \${wp.cost} Ryucoin\`,
  }));
  
  await reply(interaction, {
    content: '🛒 **Cửa Hàng Ryucoin**\\nHãy chọn một hình nền bạn muốn mua từ danh sách bên dưới:',
    components: [{
      type: 1,
      components: [{
        type: 3,
        custom_id: 'shop_select_wallpaper',
        options,
        placeholder: 'Chọn hình nền...',
      }]
    }],
    flags: 64
  });
}
`;

fs.writeFileSync('src/serverless/interactions.ts', code);
