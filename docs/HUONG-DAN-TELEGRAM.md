# Hướng dẫn cài đặt thông báo Telegram

Order Hub đẩy thông báo (yêu cầu thẻ, cấp thẻ, đơn quá hạn, Note Sheet Tổng…) về Telegram. Cài 2 phần: **Admin tạo bot 1 lần**, rồi **mỗi người tự liên kết** tài khoản.

---

## PHẦN 1 · ADMIN — Tạo bot & bật Telegram (chỉ làm 1 lần)

### Bước 1 — Tạo bot bằng BotFather
1. Mở Telegram, tìm **@BotFather** (có dấu tích xanh) → bấm **Start**.
2. Gửi lệnh `/newbot`.
3. Nhập **tên hiển thị** của bot (vd *Order Hub Tín*).
4. Nhập **username** cho bot — phải kết thúc bằng `bot` (vd `orderhub_tin_bot`).
5. BotFather trả về **Bot Token** dạng `123456789:AAE...xyz` → **copy** chuỗi này.

> 🔒 Bot Token là "chìa khóa" của bot — không chia sẻ công khai. Nếu lộ, gửi `/revoke` cho BotFather để cấp token mới.

### Bước 2 — Dán token vào Order Hub
1. Đăng nhập **Admin** → vào **⚙️ Cấu hình**.
2. Tới ô **Thông báo Telegram**.
3. Tích **☑️ Bật gửi Telegram**.
4. Dán **Bot Token** vào ô **Bot Token**.
5. Bấm **Lưu Telegram**.

✅ Xong phần Admin. Giờ mỗi người tự liên kết tài khoản ở Phần 2.

---

## PHẦN 2 · MỖI NGƯỜI — Liên kết Telegram (mỗi người làm 1 lần)

1. Trong Order Hub, bấm **🔔 Thông báo** (góc dưới menu trái).
2. Bấm **🔗 Liên kết Telegram để nhận thông báo**.
3. App hiện một **mã** dạng `LINK-XXXXXX` và **tên bot**.
4. Bấm vào tên bot (**@…bot**) để mở trong Telegram → bấm **Start**.
5. **Gửi mã** `LINK-XXXXXX` cho bot (nhắn y nguyên đoạn mã).
6. Quay lại Order Hub → bấm **Tôi đã gửi — Kiểm tra**.
7. Thấy **✓ Đã liên kết Telegram** + bot nhắn "Liên kết thành công" là xong! 🎉

🔄 **Hủy liên kết:** mở **🔔 Thông báo** → bấm **Hủy**.

---

## Khi nào nhận được thông báo?

| Loại thông báo | Gửi cho ai |
|---|---|
| 🎴 Yêu cầu thẻ mới | Admin + người Mua thẻ cùng team |
| ✅ Thẻ được cấp cho yêu cầu của bạn | Người gửi yêu cầu |
| 🔄 Đổi trạng thái thẻ | Admin + người Mua thẻ cùng team |
| 📝 Note ở Sheet Tổng | Người nhận đơn (hoặc cả team nếu chưa ai nhận) |
| ⏰ Đơn quá hạn xử lý | Người nhận đơn + Admin |

Thông báo hiện đồng thời ở chuông 🔔 trong app và trên Telegram (nếu đã liên kết).

---

## Khắc phục sự cố
- **"Telegram chưa được Admin bật"** → Admin chưa làm Phần 1.
- **Bấm Kiểm tra báo "chưa thấy tin nhắn"** → kiểm tra đã bấm **Start** cho bot và gửi **đúng mã**. Mã hết hạn sau **10 phút** — bấm Liên kết lại để lấy mã mới.
- **Đã liên kết nhưng không nhận** → đừng chặn bot; Admin kiểm tra **Bật gửi Telegram** còn tích và token đúng.
- **Đổi điện thoại** → vẫn nhận bình thường (gắn theo tài khoản Telegram, không theo thiết bị).
