# 🎮 Hướng Dẫn Setup Server Mới — Ryusei VGC Ranked Ladder Bot

## 📋 Yêu Cầu Trước Khi Bắt Đầu

- Bot đã được deploy lên Vercel và hoạt động bình thường
- Bạn có quyền **Manage Server** trên server Discord mới
- Bot đã được invite vào server với đầy đủ quyền

---

## 🌐 Phân Loại Phạm Vi Lệnh (Partner Server vs Main Server)

### 🟢 1. Lệnh Dùng Trên Tất Cả Partner Servers
Các server Partner sau khi invite bot có thể tự do dùng các lệnh cơ bản:
- `/challenge @user` — Thách đấu xếp hạng Elo
- `/queue join/leave` — Ghép trận ngẫu nhiên
- `/profile [@user]` — Xem hồ sơ rank & ảnh Profile Card
- `/leaderboard` — Bảng xếp hạng Elo (Chuyển tab 🏠 Server / 🌐 Global)
- `/bxh-coin` / `/top-coin` / `/coin-leaderboard` — Bảng xếp hạng Ryucoin (Chuyển tab 🏠 Server / 🌐 Global)
- `/history [@user]` — Xem lịch sử thi đấu
- `/hall-of-fame` — Bảng Vàng các mùa giải
- `/balance [@user]` — Xem số dư ví Ryucoin
- `/daily` — Điểm danh hàng ngày nhận Ryucoin (dùng được ở bất kỳ server nào)
- `/give @user amount` — Chuyển Ryucoin cho người chơi khác
- `/qr` — Tra cứu mã QR donate ủng hộ bot
- `/pokedex`, `/move`, `/ability` — Tra cứu dữ liệu Pokémon
- `/match resolve` / `/match cancel` — Mod của Partner server xử lý tranh chấp trận đấu tại server đó

---

### 👑 2. Lệnh Chỉ Được Dùng Ở Server Chính TGA (Main Server Only)
Các tính năng tài chính, mua sắm và sự kiện giveaway tập trung tại **Server Chính TGA** (Link invite: https://discord.gg/thegioianime):
- 🏬 **Shop**: `/shop` (Cửa hàng mua Background, Đổi Nickname, Role, Shiny)
- 🎰 **Hệ Thống Bet**: `/tao-bet`, `/show-bet`, `/stop-bet`, `/end-bet`
- 🏦 **Quỹ Ngân Hàng**: `/bank`, `/bank_add`, `/bank_give`, `/set_bank_managers`
- 🎁 **Sự Kiện Giveaway**: `/free-coins`, `/free-shiny`, `/ga-shiny`, `/question-ga`
- 💰 **Nạp/Trừ Coin Admin**: `/add-ryucoin`, `/remove-ryucoin`

---

## 🚀 Bước 1: Invite Bot Vào Server

Dùng link invite với các quyền cần thiết:

```
https://discord.com/oauth2/authorize?client_id=<CLIENT_ID>&permissions=8&scope=bot%20applications.commands
```

> Thay `<CLIENT_ID>` bằng Application ID của bot.

Bot cần các quyền tối thiểu:
- `Manage Channels` — Tạo kênh match private
- `Manage Roles` — Gán role Top 1/2/3
- `Manage Nicknames` — Tính năng đổi nickname
- `Send Messages`, `Embed Links`, `Attach Files`
- `Use Application Commands`

---

## ⚙️ Bước 2: Cấu Hình Ladder (Chỉ Super Admin 983625547076739102 Chạy Setup)

### 2.1. Thiết lập Mod Role Cho Partner Server

```
/ladder setup mod_role:@ModRole
```

| Tham số | Mô tả |
|---------|-------|
| `mod_role` | **(Bắt buộc)** Role Mod chính — sẽ được ping khi có tranh chấp |
| `mod_role_2` → `mod_role_5` | Role Mod bổ sung (tùy chọn, tối đa 5 role) |
| `timeout_minutes` | Thời gian chờ đối thủ xác nhận kết quả (mặc định: 10 phút, tối đa: 1440) |

> **⚠️ QUAN TRỌNG:** Chỉ Super Admin mới có quyền chạy `/ladder setup` để gán Mod role cho các Partner Server.

---

## 📢 Bước 3: Thiết Lập Kênh Cho Partner Server (Tùy Chọn)

### 3.1. Kênh Log Kết Quả Trận Đấu

```
/admin log-channel channel:#match-logs
```

Bot sẽ tự động đăng log kết quả mỗi trận đấu vào kênh này.

### 3.2. Kênh Live Leaderboard

```
/admin live-board channel:#leaderboard
```

Bot sẽ tự động cập nhật bảng xếp hạng trong kênh này sau mỗi trận.

### 3.3. Kênh Hall of Fame (Bảng Vàng)

```
/admin hall-of-fame-setup channel:#hall-of-fame ping_role:@everyone
```

Khi kết thúc mùa giải, Top 5 sẽ được đăng vào kênh này.

---

## 🎖️ Bước 4: Cấu Hình Role Tự Động Top 1/2/3

```
/ladder top-roles rank1_role:@Champion rank2_role:@Runner-Up rank3_role:@Top3
```

---

## 📚 Danh Sách Tất Cả Lệnh

### 👤 Lệnh Người Chơi (Dùng ở mọi Partner Server)

| Lệnh | Mô tả |
|-------|-------|
| `/challenge @user` | Thách đấu xếp hạng |
| `/queue join` / `/queue leave` | Hàng đợi tìm trận tự động |
| `/profile [@user]` | Xem hồ sơ rank & Profile Card |
| `/leaderboard` | Xem bảng xếp hạng Elo (Server / Global) |
| `/bxh-coin` / `/top-coin` / `/coin-leaderboard` | Bảng xếp hạng Ryucoin (Server / Global) |
| `/history [@user]` | Lịch sử trận đấu |
| `/hall-of-fame` | Xem Bảng Vàng các mùa giải |
| `/balance [@user]` | Xem số dư Ryucoin |
| `/daily` | Điểm danh hàng ngày nhận Ryucoin |
| `/give @user amount` | Chuyển Ryucoin (thuế 5%) |
| `/qr` | Thông tin donate MBBank |
| `/pokedex pokemon` | Tra cứu Pokémon |
| `/move name` | Tra cứu chiêu thức |
| `/ability name` | Tra cứu đặc tính |

### 🛡️ Lệnh Mod / Admin (Server Hiện Tại)

| Lệnh | Mô tả |
|-------|-------|
| `/ladder setup` | Cấu hình role Mod + timeout (Chỉ Super Admin) |
| `/ladder top-roles` | Cấu hình role tự động Top 1/2/3 |
| `/match resolve id winner` | Mod xử lý tranh chấp tại server |
| `/match cancel id` | Hủy trận + hoàn trả điểm |
| `/match cleanup` | Dọn dẹp kênh match lỗi |
| `/admin points-add/remove/set` | Điều chỉnh Elo |
| `/admin log-channel` | Đặt kênh log |
| `/admin live-board` | Đặt kênh live leaderboard |
| `/admin hall-of-fame-setup` | Đặt kênh Bảng Vàng |
| `/admin season-end` | Chốt mùa giải |
| `/admin season-schedule` | Lên lịch chốt mùa tự động |

### 👑 Lệnh Dùng Ở Server Chính (Main Server Only)

| Lệnh | Mô tả |
|-------|-------|
| `/shop` | Cửa hàng mua Background, Nickname, Role, Shiny |
| `/tao-bet` | Tạo kèo cược mới |
| `/show-bet` | Hiện lại poll cược |
| `/stop-bet` | Khóa cược |
| `/end-bet winner` | Kết thúc + chọn người thắng |
| `/bank` | Xem quỹ ngân hàng |
| `/bank_add amount` | Nạp tiền vào ngân hàng |
| `/bank_give @user amount` | Rút tiền cho người chơi |
| `/set_bank_managers` | Cấu hình quản lý ngân hàng |
| `/free-coins` | Drop free coins |
| `/free-shiny` | Drop free Shiny Pokémon |
| `/ga-shiny` | Giveaway Shiny (nhanh tay nhất) |
| `/question-ga` | Giveaway câu hỏi |
| `/add-ryucoin` | Bơm coin (Super Admin) |
| `/remove-ryucoin` | Trừ coin (Super Admin) |

---

## ✅ Checklist Setup Nhanh

```
☐ 1. Invite bot vào server
☐ 2. Super Admin chạy: /ladder setup mod_role:@Mod
☐ 3. /admin log-channel channel:#match-logs
☐ 4. /admin live-board channel:#leaderboard
☐ 5. /ladder top-roles rank1_role:@Top1 rank2_role:@Top2 rank3_role:@Top3
☐ 6. Thông báo cho thành viên bắt đầu sử dụng!
```
