let sharp = null;
try {
  sharp = require("sharp");
} catch (e) {
  console.warn("sharp tidak tersedia, beberapa fitur stiker mungkin tidak berfungsi.");
}

/**
 * Konversi buffer gambar ke webp sticker 512x512.
 * Saat ini hanya menggunakan sharp supaya stabil di berbagai environment.
 */
async function imageBufferToWebpSticker(buffer, packOptions) {
  if (!sharp) {
    throw new Error("Tidak ada engine stiker yang tersedia (sharp).");
  }
  return sharp(buffer)
    .resize({ width: 512, height: 512, fit: "inside" })
    .webp({ quality: 100, lossless: true })
    .toBuffer();
}

/**
 * Konversi sticker webp ke gambar PNG.
 */
async function webpStickerToPngImage(buffer) {
  if (!sharp) {
    throw new Error("Tidak ada engine untuk konversi stiker ke gambar (sharp).");
  }
  return sharp(buffer).png().toBuffer();
}

function createTextSvg(text) {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
  <rect width="100%" height="100%" fill="#1f2933"/>
  <foreignObject x="16" y="16" width="480" height="480">
    <body xmlns="http://www.w3.org/1999/xhtml">
      <div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:40px;color:white;text-align:center;word-wrap:break-word;font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
        ${escaped}
      </div>
    </body>
  </foreignObject>
</svg>`;
  return Buffer.from(svg);
}

// Buat stiker dari teks
async function textToSticker(text, packOptions) {
  console.log("[sticker] textToSticker() dipanggil dengan teks:", text);

  const svgBuffer = createTextSvg(text);

  if (!sharp) {
    throw new Error("Tidak ada engine stiker teks (sharp).");
  }

  console.log("[sticker] Menggunakan sharp untuk render teks → webp.");
  const webpBuf = await sharp(svgBuffer)
    .resize({ width: 512, height: 512, fit: "inside" })
    .webp({ quality: 100, lossless: true })
    .toBuffer();
  console.log("[sticker] Berhasil membuat stiker teks via sharp, size:", webpBuf.length);
  return webpBuf;
}

module.exports = {
  imageBufferToWebpSticker,
  webpStickerToPngImage,
  textToSticker,
};