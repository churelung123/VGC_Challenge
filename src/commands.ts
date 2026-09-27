import { PermissionFlagsBits, SlashCommandBuilder, ApplicationIntegrationType, InteractionContextType } from 'discord.js';

export const commandBuilders = [
  new SlashCommandBuilder()
    .setName('challenge')
    .setDescription('Thách đấu một thành viên để leo rank')
    .addUserOption(option => option
      .setName('user')
      .setDescription('Đối thủ bạn muốn thách đấu')
      .setRequired(true)),

  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Xem bảng xếp hạng của server hoặc toàn hệ thống')
    .addStringOption(option => option
      .setName('type')
      .setDescription('Loại bảng xếp hạng (Elo hoặc Ryucoin)')
      .setRequired(false)
      .addChoices(
        { name: '🏆 Rank Elo (Trình độ)', value: 'elo' },
        { name: '🪙 Ryucoin (Phú hộ)', value: 'coin' },
      ))
    .addStringOption(option => option
      .setName('scope')
      .setDescription('Phạm vi bảng xếp hạng (Server hiện tại hoặc Elo Tổng)')
      .setRequired(false)
      .addChoices(
        { name: '🏠 Server hiện tại', value: 'server' },
        { name: '🌐 Elo Tổng (Toàn hệ thống)', value: 'global' },
      ))
    .addIntegerOption(option => option
      .setName('limit')
      .setDescription('Số người muốn xem (5–25)')
      .setMinValue(5)
      .setMaxValue(25)),

  new SlashCommandBuilder()
    .setName('bxh-coin')
    .setDescription('Xem Bảng Xếp Hạng Ryucoin (Phú hộ) của server'),

  new SlashCommandBuilder()
    .setName('top-coin')
    .setDescription('Xem Bảng Xếp Hạng Ryucoin (Phú hộ) của server'),

  new SlashCommandBuilder()
    .setName('coin-leaderboard')
    .setDescription('Xem Bảng Xếp Hạng Ryucoin (Phú hộ) của server'),


  new SlashCommandBuilder()
    .setName('profile')
    .setDescription('Xem hồ sơ rank của một thành viên')
    .addUserOption(option => option
      .setName('user')
      .setDescription('Để trống để xem hồ sơ của bạn')),

  new SlashCommandBuilder()
    .setName('pokedex')
    .setDescription('Tra cứu chỉ số và dữ liệu meta trận đấu của Pokémon')
    .addStringOption(option => option
      .setName('pokemon')
      .setDescription('Tên Pokémon cần tra cứu (ví dụ: Garchomp, Raichu, Incineroar)')
      .setAutocomplete(true)
      .setRequired(true)),

  new SlashCommandBuilder()
    .setName('move')
    .setDescription('Tra cứu chỉ số và hiệu ứng chiêu thức')
    .addStringOption(option => option
      .setName('name')
      .setDescription('Tên chiêu thức (ví dụ: Earthquake, Volt Switch)')
      .setAutocomplete(true)
      .setRequired(true)),

  new SlashCommandBuilder()
    .setName('ability')
    .setDescription('Tra cứu tác dụng đặc tính của Pokémon')
    .addStringOption(option => option
      .setName('name')
      .setDescription('Tên đặc tính (ví dụ: Intimidate, Surge Surfer, No Guard)')
      .setAutocomplete(true)
      .setRequired(true)),


  new SlashCommandBuilder()
    .setName('qr')
    .setDescription('Xem thông tin Donate ủng hộ Ryusei Bot (MBBank 0828006916)'),

  new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Nhận phần thưởng điểm danh hàng ngày (Reset 0:00 UTC+7)'),

  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Hướng dẫn sử dụng hệ thống Ranked Ladder'),

  new SlashCommandBuilder()
    .setName('match')
    .setDescription('Xem hoặc xử lý trận đấu')
    .addSubcommand(sub => sub
      .setName('status')
      .setDescription('Xem trận đang chờ/đang diễn ra của bạn')
      .addStringOption(option => option
        .setName('id')
        .setDescription('Match ID; để trống để xem trận của bạn')))
    .addSubcommand(sub => sub
      .setName('resolve')
      .setDescription('Mod xác nhận kết quả hoặc HỦY trận đấu')
      .addStringOption(option => option.setName('id').setDescription('Match ID').setRequired(true))
      .addUserOption(option => option.setName('winner').setDescription('Người thắng; bỏ trống nếu hòa'))
      .addBooleanOption(option => option.setName('draw').setDescription('Đặt true nếu trận hòa'))
      .addBooleanOption(option => option.setName('cancel').setDescription('Đặt true nếu muốn HỦY TRẬN và hoàn trả điểm')))
    .addSubcommand(sub => sub
      .setName('cancel')
      .setDescription('Hủy trận đấu và hoàn trả điểm (áp dụng cho cả trận quá khứ)')
      .addStringOption(option => option.setName('id').setDescription('Match ID').setRequired(true))
      .addStringOption(option => option.setName('reason').setDescription('Lý do hủy (tuỳ chọn)')))
    .addSubcommand(sub => sub
      .setName('cleanup')
      .setDescription('Dọn dẹp tối đa 10 kênh match lỗi/rác trong server')),

  new SlashCommandBuilder()
    .setName('ladder')
    .setDescription('Cấu hình ranked ladder của server')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub => sub
      .setName('top-roles')
      .setDescription('Thiết lập role tự động cho top 3 bảng xếp hạng')
      .addRoleOption(option => option.setName('rank1_role').setDescription('Role cho Top 1'))
      .addRoleOption(option => option.setName('rank2_role').setDescription('Role cho Top 2'))
      .addRoleOption(option => option.setName('rank3_role').setDescription('Role cho Top 3')))
    .addSubcommand(sub => sub
      .setName('setup')
      .setDescription('Chọn các role Mod và thời gian chờ xác nhận kết quả')
      .addRoleOption(option => option
        .setName('mod_role')
        .setDescription('Role Mod chính sẽ được ping khi có tranh chấp')
        .setRequired(true))
      .addRoleOption(option => option
        .setName('mod_role_2')
        .setDescription('Role Mod bổ sung thứ 2'))
      .addRoleOption(option => option
        .setName('mod_role_3')
        .setDescription('Role Mod bổ sung thứ 3'))
      .addRoleOption(option => option
        .setName('mod_role_4')
        .setDescription('Role Mod bổ sung thứ 4'))
      .addRoleOption(option => option
        .setName('mod_role_5')
        .setDescription('Role Mod bổ sung thứ 5'))
      .addIntegerOption(option => option
        .setName('timeout_minutes')
        .setDescription('Thời gian chờ đối thủ xác nhận (5–1440 phút)')
        .setMinValue(5)
        .setMaxValue(1440))
      .addChannelOption(option => option
        .setName('category')
        .setDescription('Danh mục (Category) chứa kênh phòng đấu ẩn'))),

  new SlashCommandBuilder()
    .setName('ladder-help')
    .setDescription('Hướng dẫn dùng ranked ladder'),

  new SlashCommandBuilder()
    .setName('history')
    .setDescription('Xem lịch sử trận đấu của một thành viên')
    .addUserOption(option => option
      .setName('user')
      .setDescription('Để trống để xem lịch sử của bạn'))
    .addIntegerOption(option => option
      .setName('limit')
      .setDescription('Số trận muốn xem (1–20)')
      .setMinValue(1)
      .setMaxValue(20)),

  new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Lệnh quản trị ladder dành cho Mod')
    .addSubcommand(sub => sub
      .setName('points-add')
      .setDescription('Cộng điểm Elo cho người chơi')
      .addUserOption(o => o.setName('user').setDescription('Người chơi').setRequired(true))
      .addIntegerOption(o => o.setName('amount').setDescription('Số điểm cộng thêm').setMinValue(1).setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Lý do (tuỳ chọn)')))
    .addSubcommand(sub => sub
      .setName('points-remove')
      .setDescription('Trừ điểm Elo của người chơi')
      .addUserOption(o => o.setName('user').setDescription('Người chơi').setRequired(true))
      .addIntegerOption(o => o.setName('amount').setDescription('Số điểm trừ').setMinValue(1).setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Lý do (tuỳ chọn)')))
    .addSubcommand(sub => sub
      .setName('points-set')
      .setDescription('Đặt điểm Elo chính xác cho người chơi')
      .addUserOption(o => o.setName('user').setDescription('Người chơi').setRequired(true))
      .addIntegerOption(o => o.setName('amount').setDescription('Giá trị Elo mới').setMinValue(100).setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Lý do (tuỳ chọn)')))
    .addSubcommand(sub => sub
      .setName('log-channel')
      .setDescription('Đặt kênh để bot đăng log kết quả trận đấu')
      .addChannelOption(o => o.setName('channel').setDescription('Kênh log; để trống để tắt').setRequired(false)))
    .addSubcommand(sub => sub
      .setName('match-category')
      .setDescription('Đặt Danh mục (Category) Discord để tạo các phòng đấu ẩn')
      .addChannelOption(o => o.setName('category').setDescription('Danh mục (Category) chứa phòng đấu ẩn; để trống để reset').setRequired(false)))
    .addSubcommand(sub => sub
      .setName('live-board')
      .setDescription('Đặt kênh live leaderboard — bot tự cập nhật bảng xếp hạng')
      .addChannelOption(o => o.setName('channel').setDescription('Kênh live board; để trống để tắt').setRequired(false))
      .addStringOption(o => o
        .setName('scope')
        .setDescription('Phạm vi bảng xếp hạng (Mặc định: Global - Liên server)')
        .setRequired(false)
        .addChoices(
          { name: '🌐 Global (Bảng xếp hạng Elo liên server)', value: 'global' },
          { name: '🏠 Server (Bảng xếp hạng Elo server này)', value: 'server' }
        )))
    .addSubcommand(sub => sub
      .setName('hall-of-fame-setup')
      .setDescription('Đặt kênh và role thông báo Bảng Vàng (khi kết thúc mùa giải)')
      .addChannelOption(o => o.setName('channel').setDescription('Kênh Bảng Vàng; để trống để tắt').setRequired(false))
      .addRoleOption(o => o.setName('ping_role').setDescription('Role sẽ được ping khi thông báo').setRequired(false)))
    .addSubcommand(sub => sub
      .setName('reset-server')
      .setDescription('⚠️ XÓA TOÀN BỘ điểm và lịch sử đấu (Chỉ Super Admin)')
      .addStringOption(o => o
        .setName('confirm')
        .setDescription('Gõ RESET để xác nhận xóa toàn bộ dữ liệu')
        .setRequired(true)))
    .addSubcommand(sub => sub
      .setName('season-schedule')
      .setDescription('Đặt lịch tự động chốt mùa giải')
      .addStringOption(o => o.setName('name').setDescription('Tên mùa giải (VD: Mùa Thu 2026)').setRequired(true))
      .addStringOption(o => o.setName('date').setDescription('Ngày chốt (Định dạng DD/MM/YYYY)').setRequired(true))
      .addStringOption(o => o.setName('time').setDescription('Giờ chốt (VD: 08:00, 21:30). Để trống mặc định là 23:59').setRequired(false))
      .addStringOption(o => o
        .setName('reset_mode')
        .setDescription('Chế độ reset Elo (Mặc định: Soft Reset 1100->1020, 900->980)')
        .setRequired(false)
        .addChoices(
          { name: 'Soft Reset (Cân bằng về 1000: 1100->1020, 900->980)', value: 'soft' },
          { name: 'Hard Reset (Tất cả về 1000)', value: 'hard' },
          { name: 'Không reset (Chỉ lưu Bảng Vàng)', value: 'none' },
        )))
    .addSubcommand(sub => sub
      .setName('season-end')
      .setDescription('Chốt mùa giải: lưu Top 5 vào Bảng Vàng và Soft Reset Elo về 1000')
      .addStringOption(o => o
        .setName('name')
        .setDescription('Tên mùa giải (VD: Mùa Hè 2026)')
        .setRequired(true))
      .addStringOption(o => o
        .setName('reset_mode')
        .setDescription('Chế độ reset Elo (Mặc định: Soft Reset 1100->1020, 900->980)')
        .setRequired(false)
        .addChoices(
          { name: 'Soft Reset (Cân bằng về 1000: 1100->1020, 900->980)', value: 'soft' },
          { name: 'Hard Reset (Tất cả về 1000)', value: 'hard' },
          { name: 'Không reset (Chỉ lưu Bảng Vàng)', value: 'none' },
        )))
    .addSubcommand(sub => sub
      .setName('soft-reset')
      .setDescription('Soft Reset cân bằng Elo về 1000 (VD: 1100 -> 1020, 900 -> 980)')
      .addIntegerOption(o => o
        .setName('percent')
        .setDescription('Phần trăm độ giữ lại Elo lệch (Mặc định: 20%)')
        .setMinValue(0)
        .setMaxValue(100)
        .setRequired(false)))
    .addSubcommand(sub => sub
      .setName('debug-seasons')
      .setDescription('Xem danh sách tất cả các mùa giải đã lưu trong Database (để phục vụ xoá/bảo trì)'))
    .addSubcommand(sub => sub
      .setName('debug-schedule')
      .setDescription('Xem lịch hẹn chốt mùa giải đang được cài đặt cho máy chủ này'))
    .addSubcommand(sub => sub
      .setName('season-delete')
      .setDescription('Xóa một mùa giải bằng ID')
      .addStringOption(o => o.setName('id').setDescription('ID của mùa giải (xem bằng lệnh debug-seasons)').setRequired(true)))
    .addSubcommand(sub => sub
      .setName('season-rename')
      .setDescription('Đổi tên mùa giải trong Database và cập nhật tin nhắn Bảng Vàng')
      .addStringOption(o => o.setName('old_name').setDescription('Tên mùa giải cũ (VD: Season M-5. Regulation M-B)').setRequired(true))
      .addStringOption(o => o.setName('new_name').setDescription('Tên mùa giải mới (VD: Season M-4. Regulation M-B)').setRequired(true)))
    .addSubcommand(sub => sub
      .setName('daily-role-set')
      .setDescription('Cấu hình số Ryucoin daily nhận được cho 1 Role (Chỉ Bet Admin)')
      .addRoleOption(o => o.setName('role').setDescription('Role áp dụng').setRequired(true))
      .addIntegerOption(o => o.setName('amount').setDescription('Số Ryucoin daily nhận được').setMinValue(0).setRequired(true)))
    .addSubcommand(sub => sub
      .setName('daily-role-remove')
      .setDescription('Xóa cấu hình số Ryucoin daily của 1 Role (Chỉ Bet Admin)')
      .addRoleOption(o => o.setName('role').setDescription('Role cần xóa cấu hình').setRequired(true)))
    .addSubcommand(sub => sub
      .setName('daily-default-role')
      .setDescription('Chỉ định 1 Role làm Role Daily Mặc Định (Role Trainer) của Server (Chỉ Bet Admin)')
      .addRoleOption(o => o.setName('role').setDescription('Role mặc định (ví dụ: @Trainer)').setRequired(true)))
    .addSubcommand(sub => sub
      .setName('daily-role-list')
      .setDescription('Xem danh sách cấu hình Ryucoin daily theo Role trong Server (Chỉ Bet Admin)'))
    .addSubcommand(sub => sub
      .setName('sync')
      .setDescription('🔄 Đồng bộ tất cả lệnh Slash command của Bot lên Discord')),
  new SlashCommandBuilder()
    .setName('hall-of-fame')
    .setDescription('Xem Bảng Vàng (Top 5) của các mùa giải đã kết thúc'),
  new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Hệ thống Hàng đợi tìm trận (Matchmaking)')
    .addSubcommand(sub => sub
      .setName('join')
      .setDescription('Tham gia hàng đợi tìm đối thủ tự động'))
    .addSubcommand(sub => sub
      .setName('leave')
      .setDescription('Hủy tìm trận và rời khỏi hàng đợi')),
  new SlashCommandBuilder()
    .setName('say')
    .setDescription('Tính năng bí mật dành cho Admin để bot nói thay')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(option => option
      .setName('message')
      .setDescription('Nội dung tin nhắn muốn bot nói (hỗ trợ \\n để xuống dòng)')
      .setRequired(true))
    .addChannelOption(option => option
      .setName('channel')
      .setDescription('Kênh muốn bot gửi tin nhắn vào (để trống: kênh hiện tại)'))
    .addUserOption(option => option
      .setName('user')
      .setDescription('Gửi tin nhắn riêng (DM) tới người dùng này'))
    .addStringOption(option => option
      .setName('kieu')
      .setDescription('Kiểu hiển thị (mặc định: tin nhắn thường)')
      .addChoices(
        { name: '💬 Tin nhắn thường', value: 'msg' },
        { name: '📢 Thông báo (embed)', value: 'thongbao' },
      ))
    .addAttachmentOption(option => option
      .setName('image')
      .setDescription('Ảnh đính kèm gửi cùng tin nhắn')
      .setRequired(false))
    .addRoleOption(option => option
      .setName('role')
      .setDescription('Role cần ping thông báo (VD: @Member)')
      .setRequired(false)),
  new SlashCommandBuilder()
    .setName('add-ryucoin')
    .setDescription('Thêm Ryucoin cho người dùng (Chỉ dành cho Admin)')
    .addUserOption(option => option
      .setName('user')
      .setDescription('Người dùng cần thêm')
      .setRequired(true))
    .addIntegerOption(option => option
      .setName('amount')
      .setDescription('Số lượng ryucoin')
      .setRequired(true)),

  new SlashCommandBuilder()
    .setName('remove-ryucoin')
    .setDescription('Trừ Ryucoin của người dùng (Chỉ dành cho Admin)')
    .addUserOption(option => option
      .setName('user')
      .setDescription('Người dùng cần trừ')
      .setRequired(true))
    .addIntegerOption(option => option
      .setName('amount')
      .setDescription('Số lượng ryucoin cần trừ')
      .setRequired(true)),

  new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Xem số dư Ryucoin hiện tại')
    .addUserOption(option => option
      .setName('user')
      .setDescription('Người dùng cần xem')
    ),

  new SlashCommandBuilder()
    .setName('shop')
    .setDescription('Cửa hàng mua dịch vụ Profile, Role, Shiny bằng Ryucoin'),

  new SlashCommandBuilder()
    .setName('set-background')
    .setDescription('🖼️ Đặt ảnh nền Custom Background Profile cho người chơi (Chỉ Admin/Mod)')
    .addUserOption(option => option
      .setName('user')
      .setDescription('Người chơi muốn đặt background')
      .setRequired(true))
    .addStringOption(option => option
      .setName('image_url')
      .setDescription('Link ảnh (HTTP/HTTPS URL)')
      .setRequired(false))
    .addAttachmentOption(option => option
      .setName('image_file')
      .setDescription('Tệp ảnh tải lên từ máy')
      .setRequired(false)),

  new SlashCommandBuilder()
    .setName('give')
    .setDescription('💸 Chuyển Ryucoin cho người chơi khác (Thuế giao dịch 5%)')
    .addUserOption(option => option
      .setName('user')
      .setDescription('Người nhận Ryucoin')
      .setRequired(true))
    .addIntegerOption(option => option
      .setName('amount')
      .setDescription('Số Ryucoin muốn chuyển (tối thiểu 20 🪙)')
      .setMinValue(20)
      .setRequired(true)),

  new SlashCommandBuilder()
    .setName('self-destruct')
    .setDescription('⚠️ Kích hoạt giao thức tự hủy bot và xóa toàn bộ dữ liệu'),

  new SlashCommandBuilder()
    .setName('tao-bet')
    .setDescription('🎰 Tạo kèo cược giữa 2 tuyển thủ (Chỉ Admin)')
    .addStringOption(option => option
      .setName('player1')
      .setDescription('Tên tuyển thủ thứ nhất')
      .setRequired(true))
    .addStringOption(option => option
      .setName('player2')
      .setDescription('Tên tuyển thủ thứ hai')
      .setRequired(true)),

  new SlashCommandBuilder()
    .setName('show-bet')
    .setDescription('🎰 Hiện lại poll cược đang diễn ra trong server (Chỉ Admin)'),

  new SlashCommandBuilder()
    .setName('stop-bet')
    .setDescription('🔒 Đóng cược / Tạm dừng nhận cược để các tuyển thủ bắt đầu thi đấu (Chỉ Admin)'),

  new SlashCommandBuilder()
    .setName('end-bet')
    .setDescription('🏆 Kết thúc kèo cược và chọn người thắng (Chỉ Admin)')
    .addStringOption(option =>
      option
        .setName('winner')
        .setDescription('Tuyển thủ thắng cuộc')
        .setAutocomplete(true)
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName('gui-anh')
    .setDescription('📸 Nộp ảnh minh chứng kết quả trận đấu (Mở khóa nút xác nhận)')
    .addAttachmentOption(option => option
      .setName('anh')
      .setDescription('Tải tệp ảnh chụp màn hình kết quả lên')
      .setRequired(true)),

  new SlashCommandBuilder()
    .setName('bank')
    .setDescription('🏦 Xem Quỹ Ngân Hàng Admin & danh sách Quản lý có quyền sử dụng'),

  new SlashCommandBuilder()
    .setName('bank_give')
    .setDescription('🏛️ Rút Ryucoin từ Quỹ Ngân Hàng Admin phát cho người chơi (Chỉ 2 Quản lý Ngân hàng)')
    .addUserOption(option => option
      .setName('user')
      .setDescription('Người chơi nhận Ryucoin')
      .setRequired(true))
    .addIntegerOption(option => option
      .setName('amount')
      .setDescription('Số Ryucoin cấp từ ngân hàng')
      .setMinValue(1)
      .setRequired(true)),

  new SlashCommandBuilder()
    .setName('set_bank_managers')
    .setDescription('⚙️ Cấu hình 2 Quản lý có quyền điều hành Ngân Hàng Admin (Chỉ Admin Server)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption(option => option
      .setName('user1')
      .setDescription('Quản lý Ngân Hàng thứ nhất')
      .setRequired(true))
    .addUserOption(option => option
      .setName('user2')
      .setDescription('Quản lý Ngân Hàng thứ hai (tùy chọn)')
      .setRequired(false)),

  new SlashCommandBuilder()
    .setName('bank_add')
    .setDescription('➕ Nạp Ryucoin vào Quỹ Ngân Hàng Admin (Chỉ Admin / Quản lý Ngân hàng)')
    .addIntegerOption(option => option
      .setName('amount')
      .setDescription('Số Ryucoin muốn nạp thêm vào quỹ ngân hàng')
      .setMinValue(1)
      .setRequired(true)),

  new SlashCommandBuilder()
    .setName('free-coins')
    .setDescription('Drop free coins cho ai nhanh tay nhất'),

  new SlashCommandBuilder()
    .setName('free-shiny')
    .setDescription('Drop free Pokémon Shiny cho ai nhanh tay nhất 🐱'),

  new SlashCommandBuilder()
    .setName('ga-shiny')
    .setDescription('Giveaway thật! Ai bấm nút nhanh nhất sẽ nhận được 1 Pokémon Shiny ✨')
    .addStringOption(option =>
      option
        .setName('text')
        .setDescription('Mô tả / nội dung phần quà (tùy chọn)')
        .setRequired(false))
    .addAttachmentOption(option =>
      option
        .setName('anh')
        .setDescription('Ảnh Pokémon Shiny sẽ được giveaway (tùy chọn)')
        .setRequired(false))
    .addChannelOption(option =>
      option
        .setName('kenh')
        .setDescription('Kênh gửi bài giveaway (tùy chọn, mặc định là kênh hiện tại)')
        .setRequired(false)),

  new SlashCommandBuilder()
    .setName('question-ga')
    .setDescription('Tạo Giveaway câu hỏi! Ai trả lời đúng & nhanh nhất sẽ nhận được quà ✨')
    .addStringOption(option =>
      option
        .setName('cauhoi')
        .setDescription('Câu hỏi đố mọi người')
        .setRequired(true))
    .addStringOption(option =>
      option
        .setName('dapan')
        .setDescription('Đáp án đúng (không phân biệt hoa/thường)')
        .setRequired(true))
    .addStringOption(option =>
      option
        .setName('phanqua')
        .setDescription('Mô tả phần quà (tùy chọn)')
        .setRequired(false))
    .addAttachmentOption(option =>
      option
        .setName('anh')
        .setDescription('Ảnh minh họa / phần quà (tùy chọn)')
        .setRequired(false))
    .addChannelOption(option =>
      option
        .setName('kenh')
        .setDescription('Kênh gửi bài giveaway (tùy chọn, mặc định là kênh hiện tại)')
        .setRequired(false)),

  new SlashCommandBuilder()
    .setName('sell-shiny')
    .setDescription('✨ Rao bán Pokémon Shiny bằng Ryucoin (Ai nhanh tay mua trước)')
    .addStringOption(option =>
      option
        .setName('ten')
        .setDescription('Tên Pokémon Shiny cần rao bán')
        .setRequired(true))
    .addIntegerOption(option =>
      option
        .setName('gia')
        .setDescription('Giá bán bằng Ryucoin 🪙')
        .setMinValue(1)
        .setRequired(true))
    .addIntegerOption(option =>
      option
        .setName('stock')
        .setDescription('Số lượng tồn kho (mặc định 1)')
        .setMinValue(1)
        .setRequired(false))
    .addAttachmentOption(option =>
      option
        .setName('anh')
        .setDescription('Tải lên hình ảnh Pokémon Shiny (tùy chọn nếu đã điền URL)')
        .setRequired(false))
    .addStringOption(option =>
      option
        .setName('image_url')
        .setDescription('URL hình ảnh Pokémon Shiny (tùy chọn nếu đã tải tệp ảnh)')
        .setRequired(false))
    .addChannelOption(option =>
      option
        .setName('kenh')
        .setDescription('Kênh gửi bài rao bán (tùy chọn, mặc định là kênh hiện tại)')
        .setRequired(false)),
        
  new SlashCommandBuilder()
    .setName('blacklist')
    .setDescription('Cảnh cáo và đưa người dùng vào danh sách đen với thời gian phạt tăng dần (Chỉ Admin)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption(option => option
      .setName('user')
      .setDescription('Người dùng vi phạm')
      .setRequired(true))
    .addStringOption(option => option
      .setName('reason')
      .setDescription('Lý do cảnh cáo')
      .setRequired(true)),

  new SlashCommandBuilder()
    .setName('xoa-canh-cao')
    .setDescription('Xóa toàn bộ lịch sử cảnh cáo và gỡ blacklist của người dùng (Chỉ Admin)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption(option => option
      .setName('user')
      .setDescription('Người dùng cần xóa cảnh cáo')
      .setRequired(true)),

  new SlashCommandBuilder()
    .setName('check-canh-cao')
    .setDescription('Kiểm tra lịch sử cảnh cáo và trạng thái phạt của một người')
    .addUserOption(option => option
      .setName('user')
      .setDescription('Người dùng cần kiểm tra (để trống để xem của bạn)')
      .setRequired(false)),

  new SlashCommandBuilder()
    .setName('list-blacklist')
    .setDescription('Xem danh sách toàn bộ người dùng đang bị Blacklist trong server'),

  new SlashCommandBuilder()
    .setName('gacha-shiny')
    .setDescription('🎟️ Mở bán Vé số Gacha Pokémon Shiny (Đủ slot quay số)')
    .addStringOption(option =>
      option
        .setName('ten')
        .setDescription('Tên Pokémon Shiny mở gacha vé số')
        .setRequired(true))
    .addIntegerOption(option =>
      option
        .setName('gia')
        .setDescription('Giá Ryucoin cho MỖI vé số / slot 🪙')
        .setMinValue(1)
        .setRequired(true))
    .addIntegerOption(option =>
      option
        .setName('slots')
        .setDescription('Số lượng vé / slot cần gom (Mặc định: 10 vé)')
        .setMinValue(2)
        .setMaxValue(100)
        .setRequired(false))
    .addAttachmentOption(option =>
      option
        .setName('anh')
        .setDescription('Tải lên hình ảnh Pokémon Shiny (tùy chọn nếu đã điền URL)')
        .setRequired(false))
    .addStringOption(option =>
      option
        .setName('image_url')
        .setDescription('URL hình ảnh Pokémon Shiny (tùy chọn nếu đã tải tệp ảnh)')
        .setRequired(false))
    .addChannelOption(option =>
      option
        .setName('kenh')
        .setDescription('Kênh gửi bài gacha (tùy chọn, mặc định là kênh hiện tại)')
        .setRequired(false)),
    
    new SlashCommandBuilder()
    .setName('set-thumbnail')
    .setDescription('🖼️ Đặt ảnh Thumbnail (góc phải) cho thẻ Profile (Chỉ Admin/Mod)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption(option => option
      .setName('user')
      .setDescription('Người chơi muốn đặt thumbnail')
      .setRequired(true))
    .addStringOption(option => option
      .setName('image_url')
      .setDescription('Link ảnh (HTTP/HTTPS URL)')
      .setRequired(false))
    .addAttachmentOption(option => option
      .setName('image_file')
      .setDescription('Tệp ảnh tải lên từ máy')
      .setRequired(false)),
    new SlashCommandBuilder()
    .setName('thanh-tuu')
    .setDescription('🏆 Quản lý và chọn hiển thị các Thành tựu của bạn')
    .addSubcommand(sub => sub
      .setName('chon')
      .setDescription('📌 Chọn tối đa 3 thành tựu để trưng bày lên thẻ Profile'))
    .addSubcommand(sub => sub
      .setName('danh-sach')
      .setDescription('📜 Xem tất cả thành tựu bạn đã mở khóa'))
    .addSubcommand(sub => sub
      .setName('all')
      .setDescription('📌 Xem danh sách tất cả thành tựu đang có của bot')),

  new SlashCommandBuilder()
    .setName('form')
    .setDescription('📋 Đăng bảng Form đăng ký/hỗ trợ để người dùng điền và gửi về Super Admin')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(option => option
      .setName('title')
      .setDescription('Tiêu đề của Form (Mặc định: 📝 Đơn Đăng Ký / Hỗ Trợ)')
      .setRequired(false))
    .addStringOption(option => option
      .setName('description')
      .setDescription('Mô tả/hướng dẫn hiển thị trên khung Form')
      .setRequired(false))
    .addStringOption(option => option
      .setName('button_label')
      .setDescription('Nhãn hiển thị trên nút bấm (Mặc định: 📝 Điền Form)')
      .setRequired(false))
    .addStringOption(option => option
      .setName('field1')
      .setDescription('Tên câu hỏi 1 (Mặc định: Họ và tên / In-game Name)')
      .setRequired(false))
    .addStringOption(option => option
      .setName('field2')
      .setDescription('Tên câu hỏi 2 (Mặc định: Lý do / Nội dung đăng ký)')
      .setRequired(false))
    .addStringOption(option => option
      .setName('field3')
      .setDescription('Tên câu hỏi 3 (Tùy chọn)')
      .setRequired(false))
    .addStringOption(option => option
      .setName('field4')
      .setDescription('Tên câu hỏi 4 (Tùy chọn)')
      .setRequired(false))
    .addStringOption(option => option
      .setName('field5')
      .setDescription('Tên câu hỏi 5 (Tùy chọn)')
      .setRequired(false)),

  new SlashCommandBuilder()
    .setName('tao-bill')
    .setDescription('💳 Tạo hóa đơn VietQR thanh toán tự động trong ticket/kênh (Chỉ Admin)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addIntegerOption(option => option
      .setName('amount')
      .setDescription('Số tiền thanh toán (VNĐ, ví dụ: 50000, 120000)')
      .setMinValue(1000)
      .setRequired(true))
    .addStringOption(option => option
      .setName('title')
      .setDescription('Tên gói / dịch vụ (Mặc định: Nạp Pokémon Home Premium)')
      .setRequired(false))
    .addUserOption(option => option
      .setName('customer')
      .setDescription('Tag người dùng / khách hàng cần thanh toán')
      .setRequired(false))
    .addIntegerOption(option => option
      .setName('expires_in')
      .setDescription('Thời gian chờ thanh toán (phút, mặc định: 30 phút)')
      .setMinValue(1)
      .setMaxValue(1440)
      .setRequired(false)),

  new SlashCommandBuilder()
    .setName('sync')
    .setDescription('🔄 Đồng bộ tất cả lệnh Slash command của Bot lên Discord (Chỉ Admin)'),
];

commandBuilders.forEach(command => {
  command
    .setIntegrationTypes([
      ApplicationIntegrationType.GuildInstall,
      ApplicationIntegrationType.UserInstall,
    ])
    .setContexts([
      InteractionContextType.Guild,
      InteractionContextType.BotDM,
      InteractionContextType.PrivateChannel,
    ]);
});

export const commandsJson = commandBuilders.map(command => command.toJSON());
