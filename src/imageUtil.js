// Thu nhỏ ảnh (từ file/blob dán vào) → data URL JPEG gọn nhẹ, để upload nhanh & đỡ nặng.
export function fileToResizedDataUrl(file, maxDim = 1400, quality = 0.85) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error("Không có ảnh"));
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (Math.max(width, height) > maxDim) {
          const s = maxDim / Math.max(width, height);
          width = Math.round(width * s); height = Math.round(height * s);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => reject(new Error("Ảnh lỗi"));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error("Không đọc được ảnh"));
    reader.readAsDataURL(file);
  });
}

// Lấy ảnh đầu tiên từ sự kiện paste (Ctrl+V). Trả File hoặc null.
export function imageFromPaste(e) {
  const items = e.clipboardData && e.clipboardData.items ? [...e.clipboardData.items] : [];
  const it = items.find((x) => x.type && x.type.startsWith("image/"));
  return it ? it.getAsFile() : null;
}
