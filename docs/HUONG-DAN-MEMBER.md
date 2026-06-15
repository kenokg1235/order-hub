# Hướng dẫn sử dụng — Nhân viên xử lý đơn (Member / Leader)

> Dành cho người **nhận đơn và xử lý** (mua hàng, điền tracking, nhập thẻ).
> Bạn làm việc trong phạm vi **team của mình**.

---

## 1. Đăng nhập
1. Mở đường link app (người quản lý đưa cho bạn, vd `http://...:4000`).
2. Nhập **email + mật khẩu** được cấp → **Đăng nhập**.
3. Bên trái là menu. Vai trò của bạn hiện ở góc dưới menu.

Menu bạn thấy:
- **📄 Sheet Con** — nơi làm việc chính
- **🚚 Tracking** — theo dõi trạng thái vận chuyển
- **🏆 Leaderboard** — bảng xếp hạng tháng
- **✍️ Yêu cầu thẻ** — xin thẻ để mua hàng
- **📊 Thống kê thẻ** — xem thống kê thẻ của team

---

## 2. Sheet Con — quy trình xử lý 1 đơn

Đây là màn hình chính. Mỗi dòng là 1 đơn đã được chia về team bạn.

### Bước 1 — Nhận đơn
- Tìm đơn chưa có người nhận (cột **Nhận đơn** còn nút xanh).
- Bấm **Nhận đơn** → tên bạn được gắn vào đơn và **khóa lại** (người khác không nhận chồng).
- Mẹo: dùng nút lọc **Chưa nhận** / **Của tôi** ở góc trên phải để lọc nhanh.
- ⚠️ Muốn **đổi/gỡ người nhận** thì phải nhờ Admin/Leader (bạn tự gỡ không được).

### Bước 2 — Xem thông tin đơn (chỉ đọc)
Các cột do Sheet Tổng đưa xuống, bạn **không sửa**:
- **Store, ID Order, Ảnh, Sản phẩm, Link** (bấm 🔗 mở sản phẩm), **Size, Màu, Địa chỉ, SL, Profit, Thời hạn, Note tổng**.
- 📌 Đọc kỹ **Size / Màu / Thời hạn / Note tổng** trước khi mua.

### Bước 3 — Mua hàng & nhập thẻ
1. Bấm **＋ Thẻ** để thêm 1 dòng thẻ cho đơn.
2. Điền các ô (gõ xong bấm ra ngoài là tự lưu):
   - **Thẻ** — số thẻ dùng để mua. ⚠️ Nếu ô viền **đỏ** + chữ "✗ chưa cấp" → thẻ này chưa có trong hệ thống Mua thẻ, kiểm tra lại.
   - **Số tiền** — số tiền tiêu trên thẻ đó.
   - **Tracking** — mã vận đơn.
   - **Order#** — số order trên trang mua.
   - **Email / Phone / Zip** — thông tin tài khoản mua.
   - **TT xử lý** — chọn trạng thái (vd Đã xử lý / Pending / Có Tracking…).
3. **Đơn lớn cần 2–3 thẻ?** → bấm **＋ Thẻ** thêm nhiều dòng, mỗi thẻ điền tracking/order/email riêng. Profit sẽ tự chia theo số tiền từng thẻ.
4. Xóa nhầm 1 dòng thẻ → bấm nút **✕** đỏ ở cuối dòng đó.

### Bước 4 — Ghi chú
- 4 cột **Note 1–4** ở cuối để bạn ghi chú riêng cho đơn.

> 💾 **Lưu tự động:** mọi ô bạn gõ đều lưu ngay khi rời ô — không có nút "Save".

---

## 3. Yêu cầu thẻ (✍️)
Khi cần thẻ để mua hàng:
1. Vào **Yêu cầu thẻ**.
2. Ô **Tạo yêu cầu mới** → mô tả thẻ bạn cần → **＋ Gửi yêu cầu**.
3. Người mua thẻ sẽ cấp thẻ về đúng yêu cầu của bạn → bạn thấy ở mục **Thẻ được cấp**.
4. Cập nhật **Trạng thái** thẻ (vd Live Bill / Sai bill) khi dùng xong.

🔒 Bạn **chỉ thấy yêu cầu của chính mình**, không thấy của người khác. Yêu cầu đã được cấp thẻ sẽ khóa (giữ để đối chiếu).

---

## 4. Tracking (🚚)
- Xem trạng thái vận chuyển các đơn đã có mã tracking. Hệ thống tự cập nhật định kỳ.

## 5. Thống kê thẻ (📊) & Leaderboard (🏆)
- **Thống kê thẻ:** xem thẻ của cả team (🔒 **giá trị thẻ được ẩn** vì bảo mật) — chỉ thấy số lượng, trạng thái, đơn đã xử lý, profit.
- **Leaderboard:** xếp hạng trong tháng — số đơn "Đã Up", số thẻ Live Bill/Sai bill, tổng profit.

---

## 6. Mẹo nhanh
- 🔍 Ô **Tìm** + hàng **lọc** dưới tiêu đề: lọc theo nhiều cột cùng lúc. Bấm **✕ Xóa lọc** để bỏ.
- 🔔 Chuông thông báo (góc dưới menu): báo khi có việc liên quan đến bạn.
- 📅 Ô chọn **tháng**: xem đơn của tháng trước.
- Quên/sai mật khẩu, cần đổi tên người nhận, cần thêm quyền → **báo Admin**.

---

## 6. Nhận thông báo qua Telegram 📲
Liên kết Telegram để nhận thông báo (Note đơn của bạn, đơn quá hạn, thẻ được cấp…) trên điện thoại — **mỗi người làm 1 lần**:
1. Bấm **🔔 Thông báo** (góc dưới menu) → **🔗 Liên kết Telegram để nhận thông báo**.
2. App hiện **mã** dạng `LINK-XXXXXX` + tên bot.
3. Bấm tên bot **@…bot** mở Telegram → bấm **Start** → **gửi mã** đó cho bot.
4. Quay lại app bấm **Tôi đã gửi — Kiểm tra** → thấy **✓ Đã liên kết** là xong.

⚠️ Nếu báo "Telegram chưa được Admin bật" → nhờ Admin bật trước. Mã hết hạn sau 10 phút thì bấm liên kết lại. (Hướng dẫn đầy đủ: xem file **HUONG-DAN-TELEGRAM**.)
