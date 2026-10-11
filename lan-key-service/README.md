# Dịch vụ khóa thẻ cho LAN (máy Admin)

Chạy trên **máy Admin** trong văn phòng. Giữ "khóa thẻ" trong RAM và phục vụ cho các
trình duyệt **trong LAN** để chúng tự giải mã số thẻ ngay trên máy. **Khóa không bao giờ
lên VPS, không ghi ra đĩa.** Đóng chương trình = ngừng phục vụ → thẻ khóa lại khắp nơi.

> Làm các bước này **khi đã sẵn sàng set up LAN**. Trước đó chỉ cần giữ thư mục này.

---

## 1. Cài Node.js (một lần)
Tải bản **LTS** tại https://nodejs.org → cài mặc định. Kiểm tra (mở CMD):
```
node -v
```

## 2. Cài mkcert + tạo chứng chỉ cho IP máy Admin (một lần)
Tải `mkcert.exe` tại https://github.com/FiloSottile/mkcert/releases (bản `windows-amd64`),
để vào thư mục này. Mở **CMD trong thư mục này** rồi chạy (thay `192.168.1.50` bằng **IP LAN
cố định của máy Admin**):

```
mkcert -install
mkdir cert
mkcert -cert-file cert\server.pem -key-file cert\server-key.pem 192.168.1.50
```

- `mkcert -install` tạo một **CA nội bộ** và cài vào máy Admin.
- Lệnh thứ 2 cấp cert HTTPS cho đúng IP máy Admin, lưu vào `cert\`.

## 3. Cài CA nội bộ lên MỖI máy nhân viên (một lần/máy)
Để trình duyệt nhân viên **tin** cert của máy Admin. Trên máy Admin, xem CA ở đâu:
```
mkcert -CAROOT
```
Vào thư mục đó, copy file **`rootCA.pem`** sang từng máy nhân viên, rồi trên **mỗi máy**:
- Đổi tên thành `rootCA.crt` → double-click → **Install Certificate** → **Local Machine**
  (hoặc Current User) → **Place all in**: *Trusted Root Certification Authorities* → Finish.

> Chỉ cài **rootCA** (CA), **không** phát tán `server-key.pem`.

## 4. Mở cổng qua Windows Firewall (máy Admin)
Cho phép cổng **8443** cho mạng **Private**. CMD (Run as Administrator):
```
netsh advfirewall firewall add rule name="OrderHub KeyService" dir=in action=allow protocol=TCP localport=8443 profile=private
```

## 5. Chạy dịch vụ (mỗi lần muốn "chạy khóa")
Mở CMD trong thư mục này:
```
node keyserver.mjs
```
→ Nhập **khóa thẻ** (dán, không hiện ký tự) → Enter. Thấy "DỊCH VỤ KHÓA THẺ ĐANG CHẠY" là xong.
**Đóng cửa sổ = ngừng phục vụ** (thẻ khóa lại trên mọi máy).

## 6. Kiểm tra nhanh
- Trên máy Admin, mở trình duyệt vào: `https://192.168.1.50:8443/ping` → thấy **ok** (không cảnh báo cert).
- Từ **máy nhân viên** cũng vào link đó → thấy **ok** = LAN + cert OK.

---

## Cấu hình & tùy chọn
- Đổi cổng: đặt biến môi trường `KEY_PORT` (mặc định 8443).
- Đổi domain được phép: `ALLOW_ORIGIN` (mặc định `https://tborderhub.space`).
- Nếu reset modem làm **đổi IP máy Admin** → tạo lại cert ở bước 2 với IP mới, và cập nhật
  địa chỉ trong Order Hub.

## Lưu ý
- Máy Admin nên **cắm dây LAN** cho ổn định (nó phục vụ khóa cho cả văn phòng).
- Khóa chỉ nằm trong RAM của tiến trình này → an toàn; đóng là mất.
- Thứ phải giữ kỹ: **khóa thẻ** (bạn nhập ở bước 5) + thư mục `cert\` (đừng để lộ `server-key.pem`).
