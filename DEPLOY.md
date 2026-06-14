# Triển khai Order Hub lên Host (VPS)

App = **Node + Express + SQLite + React**. Server `server/server.js` vừa chạy API vừa
phục vụ giao diện đã build (`dist/`) trên **một cổng duy nhất** → chỉ cần 1 tiến trình.

> Khuyến nghị **VPS** (Ubuntu) vì dữ liệu nằm trong file SQLite `server/data.db` cần đĩa
> lưu lâu dài. Các nền tảng "serverless" (Vercel) hoặc PaaS có đĩa tạm sẽ **mất dữ liệu** —
> không hợp với SQLite. Nếu dùng Render/Railway phải gắn **Persistent Disk** cho thư mục `server/`.

---

## 0) Yêu cầu trên VPS
- Ubuntu 22.04+ (hoặc tương đương), có quyền sudo
- Node.js 20+ và npm
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs build-essential   # build-essential để biên dịch better-sqlite3 nếu cần
node -v && npm -v
```

## 1) Đưa code lên VPS
KHÔNG copy `node_modules/`, `dist/`, `server/data.db` từ Windows lên (native module +
data riêng). Chỉ đưa mã nguồn. Hai cách:

**A. Dùng Git (khuyên dùng):** push project lên GitHub (private), rồi trên VPS:
```bash
cd /opt
sudo git clone <repo-url> orderhub
sudo chown -R $USER:$USER orderhub
cd orderhub
```

**B. Nén & upload:** trên Windows nén thư mục `order-hub` (BỎ `node_modules`, `dist`,
`server/data.db*`), upload bằng SCP/WinSCP vào `/opt/orderhub`.

## 2) Cài & build
```bash
cd /opt/orderhub
npm install            # cài deps + biên dịch better-sqlite3 cho Linux
npm run build          # tạo thư mục dist/ (giao diện)
```

## 3) Chạy thử
```bash
PORT=4000 node server/server.js
# mở http://<IP_VPS>:4000  → đăng nhập admin@orderhub.local / admin123
# (nhớ ĐỔI MẬT KHẨU admin ngay trong app)
```
Lần đầu chạy sẽ tự tạo `server/data.db` + seed admin + 2 team Tín/V3.

## 4) Giữ chạy nền + tự khởi động lại (PM2)
```bash
sudo npm install -g pm2
cd /opt/orderhub
PORT=4000 pm2 start server/server.js --name orderhub
pm2 save
pm2 startup            # chạy dòng lệnh nó in ra để bật tự-start khi reboot
pm2 logs orderhub      # xem log
```
*(Thay đổi code sau này: `git pull` → `npm install` → `npm run build` → `pm2 restart orderhub`.)*

## 5) Tên miền + HTTPS (nginx + Let's Encrypt)
```bash
sudo apt-get install -y nginx
sudo nano /etc/nginx/sites-available/orderhub
```
Dán cấu hình (đổi `your-domain.com`):
```nginx
server {
  listen 80;
  server_name your-domain.com;
  location / {
    proxy_pass http://127.0.0.1:4000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }
}
```
```bash
sudo ln -s /etc/nginx/sites-available/orderhub /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
# SSL miễn phí:
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```
Trỏ DNS bản ghi **A** của `your-domain.com` về **IP VPS** trước khi chạy certbot.
Mở tường lửa: `sudo ufw allow 80,443/tcp`.

## 6) Sau khi chạy
- Đổi mật khẩu admin (Người dùng → sửa admin)
- Tạo user / team / store / phân quyền
- Cấu hình Telegram (Cấu hình → Telegram) — bot gửi được vì VPS có internet ra ngoài
- Mỗi nhân viên tự liên kết Telegram (chuông 🔔 → Liên kết)

## 7) Sao lưu dữ liệu (QUAN TRỌNG)
Toàn bộ dữ liệu nằm ở `server/data.db`. Sao lưu định kỳ:
```bash
cp /opt/orderhub/server/data.db ~/backup/data.db.$(date +%F-%H%M)
```
(Có thể đặt cron chạy hằng ngày.)

---

## Phương án nhanh hơn (nếu không rành VPS)
- **Render.com / Railway.app**: deploy từ GitHub, Build `npm install && npm run build`,
  Start `node server/server.js`. **Bắt buộc gắn Persistent Disk** mount vào `server/`
  (nếu không sẽ mất `data.db` mỗi lần deploy). Đặt biến môi trường `PORT` theo nền tảng.
- Các bản free thường ngủ khi không dùng + đĩa tạm → chỉ hợp thử nghiệm, không hợp data thật.
