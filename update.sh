#!/usr/bin/env bash
# Cập nhật Order Hub trên host. Chạy trong thư mục project: bash update.sh
# Dữ liệu (server/data.db) KHÔNG bị đụng — chỉ cập nhật code + build lại + restart.
set -e
cd "$(dirname "$0")"

echo "[1/5] Sao lưu data.db..."
if [ -f server/data.db ]; then cp server/data.db "server/data.db.bak-$(date +%F-%H%M%S)"; fi

echo "[2/5] Kéo code mới (git)..."
git pull

echo "[3/5] Cài deps (nếu có thay đổi)..."
npm install

echo "[4/5] Build giao diện..."
npm run build

echo "[5/5] Khởi động lại server..."
pm2 restart orderhub || PORT=4000 pm2 start server/server.js --name orderhub

echo "✅ Cập nhật xong. Dữ liệu được giữ nguyên, schema tự nâng cấp."
