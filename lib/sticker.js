const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

let sharp = null;
try {
  sharp = require("sharp");
} catch (e) {
  console.warn("sharp tidak tersedia, beberapa fitur stiker mungkin tidak berfungsi.");
}

let Sticker = null;
try {
  // Opsional: untuk set metadata packname/author jika tersedia
  // Pengguna perlu menjalankan: npm install wa-sticker-formatter
  Sticker = require("wa-sticker-formatter").Sticker;
} catch (e) {
  Sticker = null;
}

function tmpFile(ext) {
  return path.join(
    os.tmpdir(),
    `st-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`,
  );
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const cp = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    cp.stderr.on("data", (d) => {
      err += d.toString();
    });
    cp.on("error", (e) => reject(e));
    cp.on("close", (code) => {
      if (code === 0) return resolve();
      reject(new Error(`ffmpeg exit code ${code}: ${err}`));
    });
  });
}

// Konversi buffer gambar ke webp sticker 512x512
async function imageBufferToWebpSticker(buffer, packOptions) {
  // Coba pakai wa-sticker-formatter dulu supaya packname/author masuk metadata
  if (Sticker && packOptions) {
    try {
      const sticker = new Sticker(buffer, {
        pack: packOptions.packname,
        author: packOptions.author,
        type: "full",
        quality: 100,
      });
      return await sticker.toBuffer();
    } catch (e) {
      console.warn("Gagal membuat stiker via wa-sticker-formatter:", e);
    }
  }

  // Fallback ke sharp
  if (sharp) {
    return sharp(buffer)
      .resize({ width: 512, height: 512, fit: "inside" })
      .webp({ quality: 100, lossless: true })
      .toBuffer();
  }

  // Tidak ada engine yang tersedia
  throw new Error(
    "Tidak ada engine stiker yang tersedia (wa-sticker-formatter/sharp)."
  );
}

// Konversi sticker webp ke gambar PNG
async function webpStickerToPngImage(buffer) {
  if (sharp) {
    return sharp(buffer).png().toBuffer();
  }
  throw new Error("Tidak ada engine untuk konversi stiker ke gambar (sharp).");
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

  // 1) Coba wa-sticker-formatter (kalau tersedia dan packOptions ada)
  if (Sticker && packOptions) {
    console.log("[sticker] Menggunakan wa-sticker-formatter untuk stiker teks.");
    try {
      const sticker = new Sticker(svgBuffer, {
        pack: packOptions.packname,
        author: packOptions.author,
        type: "full",
        quality: 100,
      });
      const buf = await sticker.toBuffer();
      console.log(
        "[sticker] Berhasil membuat stiker teks via wa-sticker-formatter, size:",
        buf.length,
      );
      return buf;
    } catch (e) {
      console.warn("Gagal membuat stiker teks via wa-sticker-formatter:", e);
    }
  } else {
    console.log(
      "[sticker] wa-sticker-formatter tidak tersedia atau packOptions kosong, lewati path ini.",
    );
  }

  // 2) Coba sharp kalau tersedia
  if (sharp) {
    console.log("[sticker] Menggunakan sharp untuk render teks → webp.");
    const buf = await sharp(svgBuffer)
      .resize({ width: 512, height: 512, fit: "inside" })
      .webp({ quality: 100, lossless: true })
      .toBuffer();
    console.log("[sticker] Berhasil membuat stiker teks via sharp, size:", buf.length);
    return buf;
  }

  // Tidak ada engine yang tersedia
  throw new Error("Tidak ada engine stiker teks (wa-sticker-formatter/sharp).");
}

module.exports = {
  imageBufferToWebpSticker,
  webpStickerToPngImage,
  textToSticker,
};