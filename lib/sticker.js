const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

let sharp = null;
try {
  sharp = require("sharp");
} catch (e) {
  console.warn(
    "sharp tidak tersedia, beberapa fitur stiker akan menggunakan ffmpeg atau dinonaktifkan",
  );
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
      console.warn(
        "Gagal membuat stiker via wa-sticker-formatter, fallback ke sharp/ffmpeg:",
        e,
      );
    }
  }

  // Fallback ke sharp
  if (sharp) {
    return sharp(buffer)
      .resize({ width: 512, height: 512, fit: "inside" })
      .webp({ quality: 100, lossless: true })
      .toBuffer();
  }

  // Fallback terakhir ke ffmpeg
  const inPath = tmpFile("png");
  const outPath = tmpFile("webp");
  fs.writeFileSync(inPath, buffer);
  try {
    const args = [
      "-y",
      "-i",
      inPath,
      "-vf",
      "scale=512:512:force_original_aspect_ratio=decrease",
      "-vcodec",
      "libwebp",
      "-lossless",
      "1",
      "-preset",
      "picture",
      "-an",
      "-vsync",
      "0",
      outPath,
    ];
    await runFfmpeg(args);
    const outBuf = fs.readFileSync(outPath);
    return outBuf;
  } finally {
    fs.unlink(inPath, () => {});
    fs.unlink(outPath, () => {});
  }
}

// Konversi sticker webp ke gambar PNG
async function webpStickerToPngImage(buffer) {
  if (sharp) {
    return sharp(buffer).png().toBuffer();
  }

  const inPath = tmpFile("webp");
  const outPath = tmpFile("png");
  fs.writeFileSync(inPath, buffer);
  try {
    const args = ["-y", "-i", inPath, outPath];
    await runFfmpeg(args);
    const outBuf = fs.readFileSync(outPath);
    return outBuf;
  } finally {
    fs.unlink(inPath, () => {});
    fs.unlink(outPath, () => {});
  }
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
  const svgBuffer = createTextSvg(text);

  // 1) Coba wa-sticker-formatter (kalau tersedia dan packOptions ada)
  if (Sticker && packOptions) {
    try {
      const sticker = new Sticker(svgBuffer, {
        pack: packOptions.packname,
        author: packOptions.author,
        type: "full",
        quality: 100,
      });
      return await sticker.toBuffer();
    } catch (e) {
      console.warn(
        "Gagal membuat stiker teks via wa-sticker-formatter, fallback ke sharp/ffmpeg:",
        e,
      );
    }
  }

  // 2) Coba sharp kalau tersedia
  if (sharp) {
    return sharp(svgBuffer)
      .resize({ width: 512, height: 512, fit: "inside" })
      .webp({ quality: 100, lossless: true })
      .toBuffer();
  }

  // 3) Fallback terakhir: ffmpeg + drawtext (tanpa SVG)
  //    Ini untuk environment seperti Termux yang ffmpeg-nya tidak bisa decode SVG.
  const outPath = tmpFile("webp");

  // Cari font bawaan Android yang umum
  const fontCandidates = [
    "/system/fonts/Roboto-Regular.ttf",
    "/system/fonts/NotoSans-Regular.ttf",
    "/system/fonts/DroidSans.ttf",
  ];
  const fontFile = fontCandidates.find((p) => fs.existsSync(p));

  if (!fontFile) {
    throw new Error(
      "Tidak menemukan font untuk ffmpeg drawtext. " +
        "Pasang sharp atau wa-sticker-formatter agar fitur stiker teks berjalan.",
    );
  }

  // Escape karakter yang bisa bikin filter ffmpeg error
  const escapeDrawtextText = (t) =>
    t
      .replace(/\\/g, "\\\\")
      .replace(/:/g, "\\:")
      .replace(/'/g, "\\'")
      .replace(/%/g, "\\%");

  const safeText = escapeDrawtextText(text.length > 150 ? `${text.slice(0, 147)}...` : text);

  const filter = [
    `drawtext=fontfile=${fontFile}`,
    `text='${safeText}'`,
    "fontcolor=white",
    "fontsize=40",
    "x=(w-text_w)/2",
    "y=(h-text_h)/2",
  ].join(":");

  const args = [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=c=0x1f2933:s=512x512",
    "-vf",
    filter,
    "-vcodec",
    "libwebp",
    "-lossless",
    "1",
    "-preset",
    "picture",
    "-an",
    "-vsync",
    "0",
    outPath,
  ];

  try {
    await runFfmpeg(args);
    const outBuf = fs.readFileSync(outPath);
    return outBuf;
  } finally {
    fs.unlink(outPath, () => {});
  }
}

module.exports = {
  imageBufferToWebpSticker,
  webpStickerToPngImage,
  textToSticker,
};