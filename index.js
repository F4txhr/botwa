const makeWASocket = require("@whiskeysockets/baileys").default;
const {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  downloadContentFromMessage,
} = require("@whiskeysockets/baileys");
const qrcode = require("qrcode-terminal");
const axios = require("axios");
const { spawn } = require("child_process");

async function getYtDlpDirectUrl(url) {
  return new Promise((resolve, reject) =&gt; {
    const args = ["-f", "bv*+ba/best/best", "-g", url];
    const cp = spawn("yt-dlp", args, { stdio: ["ignore", "pipe", "pipe"] });

    let out = "";
    let err = "";

    cp.stdout.on("data", (d) =&gt; {
      out += d.toString();
    });
    cp.stderr.on("data", (d) =&gt; {
      err += d.toString();
    });
    cp.on("error", (e) =&gt; reject(e));
    cp.on("close", (code) =&gt; {
      if (code === 0) {
        const lines = out
          .split("\n")
          .map((s) =&gt; s.trim())
          .filter(Boolean);
        if (!lines.length) {
          reject(new Error("yt-dlp tidak mengembalikan URL"));
        } else {
          resolve(lines[0]);
        }
      } else {
        reject(new Error("yt-dlp exit code " + code + " stderr: " + err));
      }
    });
  });
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("./session");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    printQRInTerminal: true,
    auth: state,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      qrcode.generate(qr, { small: true });
    }
    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) {
        startBot();
      }
    }
    console.log("connection update", update);
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const jid = msg.key.remoteJid;
    const from = jid;
    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      "";

    console.log("Pesan dari", from, ":", text);

    // Command: ping
    if (text.toLowerCase() === "ping") {
      await sock.sendMessage(from, { text: "pong" }, { quoted: msg });
    }

    // Command: /confess (sederhana, versi generator teks)
    if (text.toLowerCase().startsWith("/confess ")) {
      const rest = text.slice(9).trim(); // /confess Nisa|Pesan kamu
      const [nama, ...pesanParts] = rest.split("|");
      const pesan = pesanParts.join("|").trim();

      if (!nama || !pesan) {
        await sock.sendMessage(
          from,
          {
            text:
              "Format salah.\nContoh:\n/confess Nisa|Makasi udah selalu ada, sebenernya aku suka sama kamu...",
          },
          { quoted: msg }
        );
        return;
      }

      const template = `Hai ${nama.trim()},\n\nAda seseorang yang mau menyampaikan sesuatu ke kamu:\n\n"${pesan}"\n\n(Identitas pengirim dirahasiakan, tapi mungkin kamu bisa tebak sendiri 🙂)`;

      await sock.sendMessage(from, { text: template }, { quoted: msg });
    }

    // Deteksi URL =&gt; downloader
    const urlMatch = text.match(/https?:\/\/\S+/i);
    if (urlMatch) {
      const url = urlMatch[0];
      const lower = url.toLowerCase();

      // Deteksi platform (YouTube / TikTok / IG / lainnya)
      const isYoutube = /youtu\.be|youtube\.com/.test(lower);
      const isTiktok = /tiktok\.com/.test(lower);
      const isInstagram = /instagram\.com|ig\.me/.test(lower);

      if (isYoutube || isTiktok || isInstagram) {
        try {
          // Gunakan yt-dlp langsung (tidak pakai HTTP server)
          const directUrl = await getYtDlpDirectUrl(url);

          await sock.sendMessage(
            from,
            {
              video: { url: directUrl },
              caption: "Nih videonya 👍",
            },
            { quoted: msg }
          );
        } catch (e) {
          console.error("Gagal ambil URL langsung via yt-dlp:", e);
          await sock.sendMessage(
            from,
            {
              text:
                "Gagal download video dari URL tersebut.\n" +
                "Pastikan yt-dlp terinstall dan URL valid.",
            },
            { quoted: msg }
          );
        }
      } else {
        // Downloader sederhana (direct media: jpg/png/mp4/mp3)
        try {
          if (lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".png")) {
            await sock.sendMessage(
              from,
              { image: { url }, caption: "Nih fotonya 👍" },
              { quoted: msg }
            );
          } else if (lower.endsWith(".mp4") || lower.endsWith(".mov") || lower.endsWith(".mkv")) {
            await sock.sendMessage(
              from,
              { video: { url }, caption: "Nih videonya 👍" },
              { quoted: msg }
            );
          } else if (lower.endsWith(".mp3") || lower.endsWith(".wav") || lower.endsWith(".ogg")) {
            await sock.sendMessage(
              from,
              { audio: { url }, mimetype: "audio/mpeg" },
              { quoted: msg }
            );
          } else {
            await sock.sendMessage(
              from,
              {
                text:
                  "Terdeteksi URL, tapi hanya mendukung:\n" +
                  "- YouTube/TikTok/Instagram via API eksternal, atau\n" +
                  "- direct link media (jpg/png/mp4/mp3).",
              },
              { quoted: msg }
            );
          }
        } catch (e) {
          console.error("Gagal kirim media dari URL:", e);
          await sock.sendMessage(
            from,
            { text: "Gagal mengambil media dari URL tersebut." },
            { quoted: msg }
          );
        }
      }
    }

    // Deteksi pesan gambar dengan caption "stiker" =&gt; convert ke sticker
    const imageMessage = msg.message.imageMessage;
    if (imageMessage) {
      const caption = (imageMessage.caption || "").trim().toLowerCase();
      if (caption === "stiker" || caption === "sticker") {
        try {
          const stream = await downloadContentFromMessage(imageMessage, "image");
          const chunks = [];
          for await (const chunk of stream) {
            chunks.push(chunk);
          }
          const buffer = Buffer.concat(chunks);

          await sock.sendMessage(
            from,
            { sticker: buffer },
            { quoted: msg }
          );
        } catch (e) {
          console.error("Gagal mengonversi gambar ke stiker:", e);
          await sock.sendMessage(
            from,
            { text: "Gagal mengonversi gambar ke stiker." },
            { quoted: msg }
          );
        }
      }
    }

    // Support gambar yang dikirim lalu diminta stiker lewat reply
    // Cara pakai:
    // 1) Kirim gambar
    // 2) Reply gambar itu dengan teks: "stiker" / "sticker"
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
            for await (const chunk of stream) {
              chunks.push(chunk);
            }
            const buffer = Buffer.concat(chunks);

            await sock.sendMessage(
              from,
              { sticker: buffer },
              { quoted: msg }
            );
          } catch (e) {
            console.error("Gagal mengonversi gambar (reply) ke stiker:", e);
            await sock.sendMessage(
              from,
              { text: "Gagal mengonversi gambar (reply) ke stiker." },
              { quoted: msg }
            );
          }
        }
      }
    }
  });
}

startBot();
