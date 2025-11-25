const makeWASocket = require("@whiskeysockets/baileys").default;
const {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  downloadContentFromMessage,
} = require("@whiskeysockets/baileys");
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

// Coba load sharp; jika tidak tersedia (mis. Termux), nanti fallback ke ffmpeg
let sharp = null;
try {
  sharp = require("sharp");
} catch (e) {
  console.warn("sharp tidak tersedia, fallback ke ffmpeg untuk konversi stiker");
}

// Cek ketersediaan yt-dlp di sistem
async function ensureYtDlpAvailable() {
  return new Promise((resolve) => {
    const cp = spawn("yt-dlp", ["--version"], { stdio: ["ignore", "pipe", "pipe"] });
    cp.on("error", () => resolve(false));
    cp.on("close", (code) => resolve(code === 0));
  });
}

// Download video via yt-dlp ke file sementara dengan preferensi MP4 agar playable di WhatsApp
async function getYtDlpVideoFile(url) {
  const tmpPath = path.join(
    os.tmpdir(),
    `yt-${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`,
  );

  const args = [
    "-f",
    "b[ext=mp4]/bv*[ext=mp4]+ba[ext=m4a]/best",
    "--no-playlist",
    "-o",
    tmpPath,
    url,
  ];

  await new Promise((resolve, reject) => {
    const cp = spawn("yt-dlp", args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    cp.stderr.on("data", (d) => (err += d.toString()));
    cp.on("error", (e) => reject(e));
    cp.on("close", (code) => {
      if (code === 0) return resolve();
      reject(new Error(`yt-dlp exit code ${code}: ${err}`));
    });
  });

  const stat = fs.statSync(tmpPath);
  if (!stat.size) throw new Error("File video kosong dari yt-dlp");
  return { path: tmpPath, mimetype: "video/mp4" };
}

// Konversi ke WebP pakai ffmpeg (fallback untuk Termux)
async function imageToWebpWithFfmpeg(buffer) {
  const inPath = path.join(os.tmpdir(), `in-${Date.now()}-${Math.random()}.png`);
  const outPath = path.join(os.tmpdir(), `out-${Date.now()}-${Math.random()}.webp`);
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
    await new Promise((resolve, reject) => {
      const cp = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
      let err = "";
      cp.stderr.on("data", (d) => (err += d.toString()));
      cp.on("error", (e) => reject(e));
      cp.on("close", (code) => {
        if (code === 0) return resolve();
        reject(new Error(`ffmpeg exit code ${code}: ${err}`));
      });
    });
    const outBuf = fs.readFileSync(outPath);
    return outBuf;
  } finally {
    fs.unlink(inPath, () => {});
    fs.unlink(outPath, () => {});
  }
}

// Konversi gambar ke webp 512px agar tampil sebagai sticker
async function imageToWebpSticker(buffer) {
  if (sharp) {
    return sharp(buffer)
      .resize({ width: 512, height: 512, fit: "inside" })
      .webp({ quality: 100, lossless: true })
      .toBuffer();
  }
  // Fallback ke ffmpeg
  return imageToWebpWithFfmpeg(buffer);
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("./session");
  const { version } = await fetchLatestBaileysVersion();

  const ytOk = await ensureYtDlpAvailable();
  if (!ytOk) {
    console.warn("Peringatan: yt-dlp tidak terdeteksi. Fitur download mungkin gagal.");
  }

  const sock = makeWASocket({
    version,
    printQRInTerminal: true,
    auth: state,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) startBot();
    }
    console.log("connection update", update);
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const from = msg.key.remoteJid;
    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      "";

    console.log("Pesan dari", from, ":", text);

    if (text.toLowerCase() === "ping") {
      await sock.sendMessage(from, { text: "pong" }, { quoted: msg });
    }

    if (text.toLowerCase().startsWith("/confess ")) {
      const rest = text.slice(9).trim();
      const [nama, ...pesanParts] = rest.split("|");
      const pesan = pesanParts.join("|").trim();
      if (!nama || !pesan) {
        await sock.sendMessage(
          from,
          { text: "Format salah.\nContoh:\n/confess Nisa|Makasi udah selalu ada, sebenernya aku suka sama kamu..." },
          { quoted: msg },
        );
      } else {
        const template = `Hai ${nama.trim()},\n\nAda seseorang yang mau menyampaikan sesuatu ke kamu:\n\n"${pesan}"\n\n(Identitas pengirim dirahasiakan, tapi mungkin kamu bisa tebak sendiri 🙂)`;
        await sock.sendMessage(from, { text: template }, { quoted: msg });
      }
    }

    // Deteksi URL => downloader
    const urlMatch = text.match(/https?:\/\/\S+/i);
    if (urlMatch) {
      const url = urlMatch[0];
      const lower = url.toLowerCase();
      const isYoutube = /youtu\.be|youtube\.com/.test(lower);
      const isTiktok = /tiktok\.com/.test(lower);
      const isInstagram = /instagram\.com|ig\.me/.test(lower);

      if (isYoutube || isTiktok || isInstagram) {
        try {
          if (!ytOk) throw new Error("yt-dlp tidak tersedia");
          const { path: filePath, mimetype } = await getYtDlpVideoFile(url);
          let videoBuffer;
          try {
            videoBuffer = fs.readFileSync(filePath);
          } finally {
            fs.unlink(filePath, () => {});
          }
          await sock.sendMessage(
            from,
            { video: videoBuffer, mimetype, caption: "Nih videonya 👍" },
            { quoted: msg },
          );
        } catch (e) {
          console.error("Gagal ambil video via yt-dlp:", e);
          await sock.sendMessage(
            from,
            { text: "Gagal download/kirim video. Pastikan yt-dlp (dan ffmpeg) terinstall dan URL valid." },
            { quoted: msg },
          );
        }
      } else {
        try {
          if (lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".png")) {
            await sock.sendMessage(from, { image: { url }, caption: "Nih fotonya 👍" }, { quoted: msg });
          } else if (lower.endsWith(".mp4") || lower.endsWith(".mov") || lower.endsWith(".mkv")) {
            await sock.sendMessage(from, { video: { url }, caption: "Nih videonya 👍" }, { quoted: msg });
          } else if (lower.endsWith(".mp3") || lower.endsWith(".wav") || lower.endsWith(".ogg")) {
            await sock.sendMessage(from, { audio: { url }, mimetype: "audio/mpeg" }, { quoted: msg });
          } else {
            await sock.sendMessage(
              from,
              { text: "Terdeteksi URL, tapi hanya mendukung: YouTube/TikTok/Instagram (yt-dlp) atau direct media (jpg/png/mp4/mp3)." },
              { quoted: msg },
            );
          }
        } catch (e) {
          console.error("Gagal kirim media dari URL:", e);
          await sock.sendMessage(from, { text: "Gagal mengambil media dari URL tersebut." }, { quoted: msg });
        }
      }
    }

    // Deteksi pesan gambar dgn caption "stiker" => convert ke sticker
    const imageMessage = msg.message.imageMessage;
    if (imageMessage) {
      const caption = (imageMessage.caption || "").trim().toLowerCase();
      if (caption === "stiker" || caption === "sticker") {
        try {
          const stream = await downloadContentFromMessage(imageMessage, "image");
          const chunks = [];
          for await (const chunk of stream) chunks.push(chunk);
          const buffer = Buffer.concat(chunks);
          const webp = await imageToWebpSticker(buffer);
          await sock.sendMessage(from, { sticker: webp }, { quoted: msg });
        } catch (e) {
          console.error("Gagal mengonversi gambar ke stiker:", e);
          await sock.sendMessage(from, { text: "Gagal mengonversi gambar ke stiker." }, { quoted: msg });
        }
      }
    }

    // Support reply "stiker" pada gambar yang dikutip
    if (!msg.message.imageMessage) {
      const justText = text.trim().toLowerCase();
      if (justText === "stiker" || justText === "sticker") {
        const quoted =
          msg.message.extendedTextMessage?.contextInfo?.quotedMessage ||
          msg.message.ephemeralMessage?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const quotedImage = quoted?.imageMessage;
        if (quotedImage) {
          try {
            const stream = await downloadContentFromMessage(quotedImage, "image");
            const chunks = [];
            for await (const chunk of stream) chunks.push(chunk);
            const buffer = Buffer.concat(chunks);
            const webp = await imageToWebpSticker(buffer);
            await sock.sendMessage(from, { sticker: webp }, { quoted: msg });
          } catch (e) {
            console.error("Gagal mengonversi gambar (reply) ke stiker:", e);
            await sock.sendMessage(from, { text: "Gagal mengonversi gambar (reply) ke stiker." }, { quoted: msg });
          }
        }
      }
    }
  });
}

startBot();
