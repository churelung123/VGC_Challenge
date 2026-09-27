# Ryusei Bot

Bot ranked ladder tổng quát cho Discord, chạy bằng HTTP Interactions trên Vercel. Mỗi server có leaderboard Elo, cấu hình Mod và lịch sử trận riêng. Bot phù hợp cho chess, game đối kháng hoặc bất kỳ nội dung 1v1 nào.

## Luồng hoạt động

1. Thành viên chạy `/challenge user:@Opponent`.
2. Đối thủ bấm **Nhận kèo** hoặc **Từ chối**; lời mời hết hạn sau 2 phút.
3. Khi nhận kèo, bot tạo private text channel cho hai người chơi và các role Mod đã cấu hình.
4. Sau trận, một người chọn người thắng hoặc hòa.
5. Người còn lại bấm **Xác nhận**; Elo được cập nhật và match channel tự xóa.
6. Nếu phản đối hoặc quá hạn, trận được chuyển sang chờ role Mod xử lý.
7. Mod dùng `/match resolve` để chốt kết quả; match channel tự xóa sau khi xử lý.

Elo khởi điểm là 1000, K-factor 32. Mỗi thành viên chỉ có một lời mời/trận chưa xử lý trong cùng server.

## Lệnh

- `/challenge user` — thách đấu một thành viên.
- `/leaderboard limit` — bảng xếp hạng server hiện tại.
- `/profile user` — Elo và thành tích.
- `/match status id` — xem trạng thái trận.
- `/match resolve id winner/draw` — Mod chốt kết quả.
- `/ladder setup mod_role mod_role_2…5 timeout_minutes` — Admin chọn tối đa 5 role Mod và thời gian xác nhận.
- `/ladder-help` — hướng dẫn nhanh.

## Deploy Vercel

### 1. Import GitHub repository

Trong Vercel chọn **Add New → Project**, import repository này và giữ mặc định framework **Next.js**.

### 2. Tạo database ngay trong Vercel

Mở project → **Storage / Marketplace → Neon**, tạo Postgres database miễn phí và connect vào project. Vercel sẽ tự thêm `DATABASE_URL`.

### 3. Thêm Environment Variables

Trong **Settings → Environment Variables**, thêm cho Production:

```env
DISCORD_TOKEN=token_mới_sau_khi_reset
DISCORD_CLIENT_ID=application_id
DISCORD_PUBLIC_KEY=public_key_trong_General_Information
CRON_SECRET=chuỗi_ngẫu_nhiên_dài_ít_nhất_32_ký_tự
```

`DATABASE_URL` do Neon integration thêm. Không commit `.env` và không dán token vào chat/public log.

### 4. Deploy và nối Discord endpoint

Sau khi Vercel deploy thành công, lấy production domain và đặt tại Discord Developer Portal → **General Information → Interactions Endpoint URL**:

```text
https://TEN-DOMAIN.vercel.app/api/discord/interactions
```

Discord sẽ gửi PING có chữ ký; endpoint trả PONG và Discord hiển thị dấu xác nhận.

### 5. Đăng ký slash commands

Trên máy local, tạo `.env` chứa token mới, client ID và server test ID rồi chạy:

```bash
npm install
npm run deploy
```

Khi test xong và muốn dùng ở nhiều server:

```bash
npm run deploy:global
```

Lệnh này thay toàn bộ command global cũ bằng bộ command hiện tại. Nếu `.env` vẫn có
`DISCORD_GUILD_ID`, script cũng xóa bản command riêng của server test để Discord
không hiển thị lẫn hoặc trùng command global và guild.

Sau khi mời bot vào server mới, Admin chạy:

```text
/ladder setup mod_role:@Ladder-Mod mod_role_2:@Admin timeout_minutes:60
```

## Quyền Discord

OAuth2 scopes:

- `bot`
- `applications.commands`

Bot permissions:

- View Channels
- Manage Channels
- Send Messages
- Embed Links
- Attach Files
- Read Message History
- Use Application Commands

[Mời hoặc cấp lại quyền cho Ryusei Bot](https://discord.com/oauth2/authorize?client_id=1528333361171660870&permissions=2147601424&integration_type=0&scope=bot+applications.commands). Server đã mời bot từ bản cũ cần cấp thêm **Manage Channels** để tạo và tự xóa private match channel.

Không cần bật Message Content hoặc privileged Gateway intent. Bản Vercel không mở Gateway/WebSocket.

## Lưu ý về timeout trên gói miễn phí

Vercel Hobby chỉ cho cron chạy một lần mỗi ngày và không đảm bảo đúng phút. Bot vì vậy kiểm tra quá hạn theo hai cách:

- mỗi khi có slash command hoặc nút bấm mới;
- cron hằng ngày làm phương án dự phòng.

Trạng thái trận vẫn đổi chính xác theo deadline trong database, nhưng thông báo ping Mod có thể đến muộn nếu server hoàn toàn không có tương tác mới. Muốn ping đúng từng phút cần Vercel Pro hoặc một scheduler bên ngoài.

## Chạy local và kiểm tra

```bash
npm install
npm run dev
```

Trang local ở `http://localhost:3000`. Discord không gọi được localhost trực tiếp nếu không có tunnel HTTPS.

```bash
npm run check
npm test
npm run build
```

Production dùng ba bảng Postgres có prefix `ryusei_ladder_`; schema được tạo tự động ở request đầu tiên.
# VGC_Challenge
