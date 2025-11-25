const axios = require("axios");
const { downloadContentFromMessage } = require("@whiskeysockets/baileys");
const {
  imageBufferToWebpSticker,
  webpStickerToPngImage,
  textToSticker,
} = require("./sticker");
const {
  getChatConfig,
  setChatPrefix,
  setChatFeature,
  setChatStickerPack,
  getDownloadLimitBytes,
  setDownloadLimitBytes,
} = require("./configStore");
const { downloadYtDlpVideo, downloadYtDlpAudio } = require("./downloader");

function getTextFromMessage(msg) {
  if (!msg.message) return "";
  const m = msg.message;
  if (m.conversation) return m.conversation;
  if (m.extendedTextMessage && m.extendedTextMessage.text) {
    return m.extendedTextMessage.text;
  }
  if (m.imageMessage && m.imageMessage.caption) {
    return m.imageMessage.caption;
  }
  if (m.videoMessage && m.videoMessage.caption) {
    return m.videoMessage.caption;
  }
  return "";
}

function parseCommand(text, prefix) {
  if (!text.startsWith(prefix)) return null;
  const without = text.slice(prefix.length).trim();
  if (!without) return null;
  const [command, ...rest] = without.split(/\s+/);
  return {
    command: command.toLowerCase(),
    args: rest.join(" ").trim(),
  };
}

function extractFirstUrl(text) {
  if (!text) return null;
  const match = text.match(/https?:\/\/\S+/i);
  return match ? match[0] : null;
}

function isYoutubeUrl(url) {
  const lower = url.toLowerCase();
  return /youtu\.be|youtube\.com/.test(lower);
}

function isTiktokUrl(url) {
  return /tiktok\.com/.test(url.toLowerCase());
}

function isInstagramUrl(url) {
  const lower = url.toLowerCase();
  return /instagram\.com|ig\.me/.test(lower);
}

function isWhatsAppGroupLink(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return /chat\.whatsapp\.com\/\S+/.test(lower) || /whatsapp\.com\/invite\/\S+/.test(lower);
}

async function isUserAdmin(sock, groupJid, userJid) {
  try {
    const meta = await sock.groupMetadata(groupJid);
    const participant = meta.participants.find((p) => p.id === userJid);
    return Boolean(participant && participant.admin);
  } catch (e) {
    console.error("Gagal mengecek admin grup:", e);
    return false;
  }
}

async function isBotAdmin(sock, groupJid) {
  try {
    const meId = sock.user && sock.user.id;
    if (!meId) return false;
    const meta = await sock.groupMetadata(groupJid);
    const participant = meta.participants.find((p) => p.id === meId);
    return Boolean(participant && participant.admin);
  } catch (e) {
    console.error("Gagal mengecek admin bot di grup:", e);
    return false;
  }
}

function isOwnerJid(jid) {
  const ownerNumber = process.env.BOT_OWNER_NUMBER;
  if (!ownerNumber) return false;
  const ownerDigits = ownerNumber.replace(/[^0-9]/g, "");
  if (!ownerDigits) return false;
  const jidDigits = (jid || "").replace(/[^0-9]/g, "");
  if (!jidDigits) return false;
  // JID multi-device biasanya berbentuk 628xxx...:1@s.whatsapp.net
  // Kita anggap pemilik jika digit JID diawali dengan nomor owner.
  return jidDigits.startsWith(ownerDigits);
}

// Statistik sederhana penggunaan command (sejak bot start)
const commandStats = {
  total: 0,
  perCommand: {},
};

function registerCommandUse(command) {
  commandStats.total += 1;
  const key = command || "_unknown";
  commandStats.perCommand[key] = (commandStats.perCommand[key] || 0) + 1;
}

const BOT_NAME = "Vortex-x";
const BOT_START_TIME = Date.now();

async function handleCommand(sock, msg, ctx) {
  const {
    from,
    sender,
    isGroup,
    prefix,
    features,
    stickerPack,
    ytOk,
    command,
    args,
  } = ctx;

  registerCommandUse(command);

  // ping
  if (command === "ping") {
    await sock.sendMessage(from, { text: "pong" }, { quoted: msg });
    return;
  }

  // HELP / MENU
  if (command === "help" || command === "menu") {
    const senderJid = sender;
    const isOwner = isOwnerJid(senderJid);
    let isAdmin = false;

    if (isGroup) {
      isAdmin = await isUserAdmin(sock, from, senderJid);
    }

    let roleLabel;
    if (isOwner && isGroup && isAdmin) {
      roleLabel = "Owner + Admin Grup";
    } else if (isOwner && isGroup) {
      roleLabel = "Owner (di Grup)";
    } else if (isOwner && !isGroup) {
      roleLabel = "Owner (Chat Pribadi)";
    } else if (isGroup && isAdmin) {
      roleLabel = "Admin Grup";
    } else if (isGroup) {
      roleLabel = "Member Grup";
    } else {
      roleLabel = "Pengguna (Chat Pribadi)";
    }

    const lines = [];

    lines.push(`🤖 *${BOT_NAME}*`);
    lines.push("━━━━━━━━━━━━━━━━━━━━");
    lines.push(`👤 Role kamu : *${roleLabel}*`);
    lines.push(`💬 Tipe chat : ${isGroup ? "Grup" : "Pribadi"}`);
    lines.push(`⏱ Prefix    : '${prefix}'`);
    lines.push("");

    // Perintah umum
    lines.push("📌 *Perintah Umum*");
    lines.push(`${prefix}ping  - cek status bot`);
    lines.push(`${prefix}help / ${prefix}menu - daftar perintah`);
    lines.push(`${prefix}about - info bot ${BOT_NAME}`);
    lines.push(`${prefix}owner - info pemilik bot (jika diatur)`);
    lines.push("");

    // Downloader
    lines.push("📥 *Downloader*");
    lines.push(`${prefix}ytv <url>         - download video YouTube / TikTok / Instagram`);
    lines.push(`${prefix}yta <url YouTube> - download audio YouTube (mp3)`);
    lines.push(
      "Kirim URL YouTube / TikTok / Instagram tanpa command juga akan di-download jika fitur downloader aktif.",
    );
    lines.push("");

    // Sticker
    lines.push("🎨 *Sticker*");
    lines.push(`Kirim gambar caption 'stiker' / 'sticker' → jadi sticker`);
    lines.push(`${prefix}stiker <teks>           - buat sticker teks`);
    lines.push(`${prefix}stikerpack Nama|Author - set packname & author sticker`);
    lines.push(`Reply 'stiker' ke gambar → jadi sticker`);
    lines.push(`${prefix}toimg (reply ke stiker) - ubah stiker jadi gambar`);
    lines.push("");

    // Utilitas
    lines.push("🛠 *Utilitas*");
    lines.push(
      `${prefix}tr id-en <teks>  - translate teks (contoh: ${prefix}tr id-en Halo dunia)`,
    );
    lines.push(
      `${prefix}cuaca <kota>    - informasi cuaca (butuh OPENWEATHER_API_KEY di server)`,
    );
    lines.push(`${prefix}short <url>      - pemendek URL (is.gd)`);
    lines.push("");

    // Grup / admin
    if (isGroup) {
      lines.push("👥 *Fitur Grup*");
      lines.push(`${prefix}status - lihat config dan fitur untuk chat ini (semua member)`);

      if (isAdmin || isOwner) {
        lines.push(
          `${prefix}setprefix <prefix>       - ganti prefix untuk chat ini (Admin / Owner)`,
        );
        lines.push(
          `${prefix}toggle <fitur> on|off    - aktif/nonaktif fitur (downloader, welcome, antilink, translate, weather, shorten, sticker)`,
        );
      } else {
        lines.push(
          `${prefix}setprefix <prefix>       - ganti prefix (hanya Admin / Owner)`,
        );
        lines.push(
          `${prefix}toggle <fitur> on|off    - aktif/nonaktif fitur (hanya Admin / Owner)`,
        );
      }
      lines.push("");
    }

    // Owner-only commands
    if (isOwner) {
      lines.push("🛡 *Perintah Owner*");
      lines.push(
        `${prefix}setlimit <MB>  - ubah batas ukuran download global via yt-dlp (misal: ${prefix}setlimit 500)`,
      );
      lines.push(
        `${prefix}logs           - ringkasan penggunaan perintah sejak bot dijalankan`,
      );
      lines.push("");
    }

    lines.push("ℹ️ *Catatan*");
    lines.push("- Beberapa fitur bisa dimatikan per chat via perintah toggle.");
    lines.push("- Batas default download via yt-dlp adalah 1 GB (dapat diubah dengan setlimit).");

    const helpText = lines.join("\n");
    await sock.sendMessage(from, { text: helpText }, { quoted: msg });
    return;
  }

  // ABOUT
  if (command === "about") {
    const limitBytes = getDownloadLimitBytes();
    const limitMb = Math.round(limitBytes / (1024 * 1024));

    const lines = [];
    lines.push(`🤖 *${BOT_NAME}*`);
    lines.push("WhatsApp bot berbasis Baileys.");
    lines.push("");
    lines.push("Fitur utama:");
    lines.push("- ping / menu");
    lines.push("- downloader (YouTube / TikTok / Instagram)");
    lines.push("- sticker (gambar → sticker, teks → sticker, sticker → gambar)");
    lines.push("- translate, cuaca, pemendek URL");
    lines.push("");
    lines.push(`Batas download global saat ini: ~${limitMb} MB.`);
    lines.push("");
    lines.push("Source code dan konfigurasi dapat dimodifikasi sesuai kebutuhan.");

    await sock.sendMessage(from, { text: lines.join("\n") }, { quoted: msg });
    return;
  }

  // OWNER INFO
  if (command === "owner") {
    const ownerName = process.env.BOT_OWNER_NAME || "Belum diatur";
    const ownerNumber = process.env.BOT_OWNER_NUMBER || "";
    const lines = [];
    lines.push("👤 *Owner Bot*");
    lines.push("");
    lines.push(`Nama  : ${ownerName}`);
    if (ownerNumber) {
      lines.push(`Nomor : wa.me/${ownerNumber.replace(/[^0-9]/g, "")}`);
    } else {
      lines.push("Nomor : (belum diatur, set env BOT_OWNER_NUMBER)");
    }
    await sock.sendMessage(from, { text: lines.join("\n") }, { quoted: msg });
    return;
  }

  // YTV
  if (command === "ytv") {
    if (!features.downloader) {
      await sock.sendMessage(
        from,
        { text: "Fitur downloader dimatikan di chat ini." },
        { quoted: msg },
      );
      return;
    }
    if (!ytOk) {
      await sock.sendMessage(
        from,
        { text: "yt-dlp tidak tersedia di server. Tidak bisa mengunduh video." },
        { quoted: msg },
      );
      return;
    }
    const url = args.trim();
    if (!url) {
      await sock.sendMessage(
        from,
        { text: `Gunakan: ${prefix}ytv &lt;url YouTube/TikTok/Instagram&gt;` },
        { quoted: msg },
      );
      return;
    }
    try {
      const limitBytes = getDownloadLimitBytes();
      const limitMb = Math.round(limitBytes / (1024 * 1024));
      await sock.sendMessage(
        from,
        {
          text: `Sedang mengunduh video, harap tunggu...\n(Batas ukuran: ~${limitMb} MB)`,
        },
        { quoted: msg },
      );
      const { buffer, mimetype } = await downloadYtDlpVideo(url, limitBytes);
      await sock.sendMessage(
        from,
        { video: buffer, mimetype, caption: "Nih videonya 👍" },
        { quoted: msg },
      );
    } catch (e) {
      console.error("Gagal download video via yt-dlp:", e);
      const msgText =
        e && e.message && e.message.includes("Ukuran video melebihi")
          ? "Gagal mengunduh: ukuran video melebihi batas yang ditetapkan."
          : "Gagal mengunduh/kirim video. Pastikan yt-dlp (dan ffmpeg) terinstal dan URL valid.";
      await sock.sendMessage(from, { text: msgText }, { quoted: msg });
    }
    return;
  }

  // YTA
  if (command === "yta") {
    if (!features.downloader) {
      await sock.sendMessage(
        from,
        { text: "Fitur downloader dimatikan di chat ini." },
        { quoted: msg },
      );
      return;
    }
    if (!ytOk) {
      await sock.sendMessage(
        from,
        { text: "yt-dlp tidak tersedia di server. Tidak bisa mengunduh audio." },
        { quoted: msg },
      );
      return;
    }
    const url = args.trim();
    if (!url || !isYoutubeUrl(url)) {
      await sock.sendMessage(
        from,
        { text: `Gunakan: ${prefix}yta &lt;url YouTube&gt;` },
        { quoted: msg },
      );
      return;
    }

    try {
      const limitBytes = getDownloadLimitBytes();
      const limitMb = Math.round(limitBytes / (1024 * 1024));
      await sock.sendMessage(
        from,
        {
          text: `Sedang mengunduh audio, harap tunggu...\n(Batas ukuran: ~${limitMb} MB)`,
        },
        { quoted: msg },
      );
      const { buffer, mimetype } = await downloadYtDlpAudio(url, limitBytes);
      await sock.sendMessage(
        from,
        { audio: buffer, mimetype, ptt: false },
        { quoted: msg },
      );
    } catch (e) {
      console.error("Gagal download audio via yt-dlp:", e);
      const msgText =
        e && e.message && e.message.includes("Ukuran audio melebihi")
          ? "Gagal mengunduh: ukuran audio melebihi batas yang ditetapkan."
          : "Gagal mengunduh/kirim audio. Pastikan yt-dlp (dan ffmpeg) terinstal dan URL valid.";
      await sock.sendMessage(from, { text: msgText }, { quoted: msg });
    }
    return;
  }

  // SETPREFIX
  if (command === "setprefix") {
    const newPrefix = args.trim();
    if (!newPrefix) {
      await sock.sendMessage(
        from,
        { text: `Gunakan: ${prefix}setprefix &lt;prefix&gt; (contoh: ${prefix}setprefix !) ` },
        { quoted: msg },
      );
      return;
    }
    if (newPrefix.length > 3) {
      await sock.sendMessage(
        from,
        { text: "Prefix maksimal 3 karakter." },
        { quoted: msg },
      );
      return;
    }
    setChatPrefix(from, newPrefix);
    await sock.sendMessage(
      from,
      { text: `Prefix untuk chat ini diubah menjadi '${newPrefix}'.` },
      { quoted: msg },
    );
    return;
  }

  // TOGGLE FITUR
  if (command === "toggle") {
    if (!isGroup) {
      await sock.sendMessage(
        from,
        { text: "Perintah ini hanya bisa digunakan di grup." },
        { quoted: msg },
      );
      return;
    }

    const [featureNameRaw, valueRaw] = args.split(/\s+/);
    const featureName = featureNameRaw ? featureNameRaw.toLowerCase() : "";
    const value = valueRaw ? valueRaw.toLowerCase() : "";

    if (!featureName || !value || !["on", "off"].includes(value)) {
      await sock.sendMessage(
        from,
        {
          text: [
            `Gunakan: ${prefix}toggle &lt;fitur&gt; on|off`,
            "",
            "Daftar fitur:",
            "- downloader",
            "- welcome",
            "- antilink",
            "- translate",
            "- weather",
            "- shorten",
            "- sticker",
          ].join("\n"),
        },
        { quoted: msg },
      );
      return;
    }

    const featureMap = {
      downloader: "downloader",
      welcome: "welcome",
      antilink: "antilink",
      translate: "translate",
      weather: "weather",
      shorten: "shorten",
      short: "shorten",
      sticker: "sticker",
      stiker: "sticker",
    };

    const key = featureMap[featureName];
    if (!key) {
      await sock.sendMessage(
        from,
        { text: "Nama fitur tidak dikenal. Cek daftar fitur di perintah help." },
        { quoted: msg },
      );
      return;
    }

    const enabled = value === "on";
    setChatFeature(from, key, enabled);
    await sock.sendMessage(
      from,
      { text: `Fitur '${key}' di chat ini sekarang: ${enabled ? "ON" : "OFF"}.` },
      { quoted: msg },
    );
    return;
  }

  // SETLIMIT (Owner only)
  if (command === "setlimit") {
    if (!isOwnerJid(sender)) {
      await sock.sendMessage(
        from,
        { text: "Perintah ini hanya dapat digunakan oleh *Owner* bot." },
        { quoted: msg },
      );
      return;
    }

    const raw = args.trim();
    if (!raw) {
      await sock.sendMessage(
        from,
        {
          text: `Gunakan: ${prefix}setlimit &lt;MB&gt;\nContoh: ${prefix}setlimit 500`,
        },
        { quoted: msg },
      );
      return;
    }

    const mb = parseInt(raw, 10);
    if (!Number.isFinite(mb) || mb <= 0) {
      await sock.sendMessage(
        from,
        { text: "Nilai harus berupa angka MB yang lebih besar dari 0." },
        { quoted: msg },
      );
      return;
    }

    const minMb = 10;
    const maxMb = 4096;
    if (mb < minMb || mb > maxMb) {
      await sock.sendMessage(
        from,
        {
          text: `Batas di luar rentang.\nMinimal: ${minMb} MB\nMaksimal: ${maxMb} MB`,
        },
        { quoted: msg },
      );
      return;
    }

    const bytes = mb * 1024 * 1024;
    setDownloadLimitBytes(bytes);

    await sock.sendMessage(
      from,
      { text: `Batas download global via yt-dlp diubah menjadi ~${mb} MB.` },
      { quoted: msg },
    );
    return;
  }

  // LOGS (Owner only)
  if (command === "logs") {
    if (!isOwnerJid(sender)) {
      await sock.sendMessage(
        from,
        { text: "Perintah ini hanya dapat digunakan oleh *Owner* bot." },
        { quoted: msg },
      );
      return;
    }

    const uptimeMs = Date.now() - BOT_START_TIME;

    function formatDuration(ms) {
      const sec = Math.floor(ms / 1000);
      const d = Math.floor(sec / 86400);
      const h = Math.floor((sec % 86400) / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = sec % 60;
      const parts = [];
      if (d) parts.push(`${d}h`);
      if (h) parts.push(`${h}j`);
      if (m) parts.push(`${m}m`);
      if (s || parts.length === 0) parts.push(`${s}d`);
      return parts.join(" ");
    }

    const entries = Object.entries(commandStats.perCommand);
    entries.sort((a, b) => b[1] - a[1]);

    const lines = [];
    lines.push(`🧾 *Logs ${BOT_NAME}*`);
    lines.push("━━━━━━━━━━━━━━━━━━━━");
    lines.push(`Uptime        : ${formatDuration(uptimeMs)}`);
    lines.push(`Total command : ${commandStats.total}`);
    lines.push("");

    if (entries.length === 0) {
      lines.push("Belum ada perintah yang terekam sejak bot dijalankan.");
    } else {
      lines.push("Top perintah (sementara):");
      const top = entries.slice(0, 10);
      top.forEach(([cmdName, count], idx) => {
        lines.push(`${idx + 1}. ${cmdName} - ${count}x`);
      });
    }

    await sock.sendMessage(from, { text: lines.join("\n") }, { quoted: msg });
    return;
  }

  // STATUS
  if (command === "status") {
    const limitBytes = getDownloadLimitBytes();
    const limitMb = Math.round(limitBytes / (1024 * 1024));
    const lines = [];

    lines.push("📊 *Status Chat Ini*");
    lines.push("━━━━━━━━━━━━━━━━━━━━");
    lines.push(`ID    : ${from}`);
    lines.push(`Tipe  : ${isGroup ? "Grup" : "Pribadi"}`);
    lines.push(`Prefix: '${prefix}'`);
    lines.push("");

    lines.push("⚙️ *Fitur*");
    Object.entries(features).forEach(([name, val]) => {
      lines.push(`- ${name} : ${val ? "ON" : "OFF"}`);
    });
    lines.push("");

    lines.push("🎨 *Sticker pack*");
    lines.push(`- packname : ${stickerPack.packname || "-"}`);
    lines.push(`- author   : ${stickerPack.author || "-"}`);
    lines.push("");

    lines.push(`📥 Batas download via yt-dlp (global): ~${limitMb} MB`);

    await sock.sendMessage(from, { text: lines.join("\n") }, { quoted: msg });
    return;
  }

  // STIKER TEKS
  if (command === "stiker" || command === "sticker") {
    if (!features.sticker) {
      await sock.sendMessage(
        from,
        { text: "Fitur sticker dimatikan di chat ini." },
        { quoted: msg },
      );
      return;
    }
    const text = args.trim();
    if (!text) {
      await sock.sendMessage(
        from,
        { text: `Gunakan: ${prefix}stiker &lt;teks&gt;` },
        { quoted: msg },
      );
      return;
    }
    try {
      console.log("Memproses perintah stiker teks dengan isi:", text);
      const webp = await textToSticker(text, stickerPack);
      console.log("Berhasil membuat buffer stiker teks, ukuran:", webp.length);
      await sock.sendMessage(from, { sticker: webp }, { quoted: msg });
      console.log("Berhasil mengirim stiker teks ke", from);
    } catch (e) {
      console.error("Gagal membuat stiker teks:", e);
      await sock.sendMessage(
        from,
        {
          text:
            "Gagal membuat stiker dari teks. Pastikan ffmpeg terinstal. " +
            "Opsional: pasang juga sharp atau wa-sticker-formatter untuk kualitas lebih baik.",
        },
        { quoted: msg },
      );
    }
    return;
  }

  // STIKERPACK
  if (command === "stikerpack") {
    const parts = args.split("|");
    const packname = (parts[0] || "").trim();
    const author = (parts[1] || "").trim();

    if (!packname || !author) {
      await sock.sendMessage(
        from,
        {
          text: `Gunakan: ${prefix}stikerpack Nama|Author\nContoh: ${prefix}stikerpack ${BOT_NAME}|Sticker Bot`,
        },
        { quoted: msg },
      );
      return;
    }

    setChatStickerPack(from, packname, author);
    await sock.sendMessage(
      from,
      {
        text: `Sticker pack di chat ini diubah menjadi:\n- packname: ${packname}\n- author  : ${author}`,
      },
      { quoted: msg },
    );
    return;
  }

  // TOIMG
  if (command === "toimg") {
    await handleToImg(sock, msg, { from });
    return;
  }

  // TRANSLATE
  if (command === "tr" || command === "translate") {
    if (!features.translate) {
      await sock.sendMessage(
        from,
        { text: "Fitur translate dimatikan di chat ini." },
        { quoted: msg },
      );
      return;
    }
    const parts = args.split(/\s+/);
    const langPair = (parts[0] || "").trim();
    const text = parts.slice(1).join(" ").trim();

    if (!langPair || !text || !langPair.includes("-")) {
      await sock.sendMessage(
        from,
        {
          text: `Gunakan: ${prefix}tr id-en &lt;teks&gt;\nContoh: ${prefix}tr id-en Halo dunia`,
        },
        { quoted: msg },
      );
      return;
    }

    const [fromLang, toLang] = langPair.split("-");
    try {
      const translated = await translateText(text, fromLang, toLang);
      const reply = [
        `Hasil terjemahan (${fromLang} → ${toLang}):`,
        "",
        translated,
      ].join("\n");
      await sock.sendMessage(from, { text: reply }, { quoted: msg });
    } catch (e) {
      console.error("Gagal translate:", e);
      await sock.sendMessage(
        from,
        { text: "Gagal menerjemahkan teks. Coba lagi nanti." },
        { quoted: msg },
      );
    }
    return;
  }

  // CUACA
  if (command === "cuaca") {
    if (!features.weather) {
      await sock.sendMessage(
        from,
        { text: "Fitur cuaca dimatikan di chat ini." },
        { quoted: msg },
      );
      return;
    }

    const city = args.trim();
    if (!city) {
      await sock.sendMessage(
        from,
        { text: `Gunakan: ${prefix}cuaca &lt;kota&gt;\nContoh: ${prefix}cuaca Jakarta` },
        { quoted: msg },
      );
      return;
    }

    const apiKey = process.env.OPENWEATHER_API_KEY;
    if (!apiKey) {
      await sock.sendMessage(
        from,
        {
          text: "OPENWEATHER_API_KEY belum di-set di environment. Set environment variable tersebut untuk mengaktifkan fitur cuaca.",
        },
        { quoted: msg },
      );
      return;
    }

    try {
      const info = await getWeather(city, apiKey);
      await sock.sendMessage(from, { text: info }, { quoted: msg });
    } catch (e) {
      console.error("Gagal mengambil info cuaca:", e);
      await sock.sendMessage(
        from,
        { text: "Gagal mengambil informasi cuaca. Pastikan nama kota benar." },
        { quoted: msg },
      );
    }
    return;
  }

  // SHORT URL
  if (command === "short" || command === "shorten") {
    if (!features.shorten) {
      await sock.sendMessage(
        from,
        { text: "Fitur pemendek URL dimatikan di chat ini." },
        { quoted: msg },
      );
      return;
    }

    const url = args.trim().split(/\s+/)[0];
    if (!url) {
      await sock.sendMessage(
        from,
        { text: `Gunakan: ${prefix}short &lt;url&gt;` },
        { quoted: msg },
      );
      return;
    }

    try {
      const shortUrl = await shortenUrl(url);
      await sock.sendMessage(
        from,
        {
          text: `URL asli : ${url}\nURL pendek: ${shortUrl}`,
        },
        { quoted: msg },
      );
    } catch (e) {
      console.error("Gagal memendekkan URL:", e);
      await sock.sendMessage(
        from,
        { text: "Gagal memendekkan URL. Pastikan URL valid." },
        { quoted: msg },
      );
    }
    return;
  }
}

async function handleToImg(sock, msg, ctx) {
  const { from } = ctx;
  const quoted =
    msg.message.extendedTextMessage?.contextInfo?.quotedMessage ||
    msg.message.ephemeralMessage?.message?.extendedTextMessage?.contextInfo
      ?.quotedMessage;

  const stickerMessage = quoted?.stickerMessage || msg.message.stickerMessage;
  if (!stickerMessage) {
    await sock.sendMessage(
      from,
      { text: "Balas sebuah stiker dengan perintah toimg untuk mengubahnya menjadi gambar." },
      { quoted: msg },
    );
    return;
  }

  try {
    const stream = await downloadContentFromMessage(stickerMessage, "sticker");
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    const image = await webpStickerToPngImage(buffer);
    await sock.sendMessage(from, { image, caption: "Nih gambarnya 👍" }, { quoted: msg });
  } catch (e) {
    console.error("Gagal mengonversi stiker ke gambar:", e);
    await sock.sendMessage(
      from,
      { text: "Gagal mengonversi stiker ke gambar." },
      { quoted: msg },
    );
  }
}

async function handleAutoFeatures(sock, msg, ctx) {
  const { from, isGroup, features, stickerPack, ytOk, trimmedText, lowerText } = ctx;

  // Anti-link (hanya grup)
  if (isGroup && features.antilink && isWhatsAppGroupLink(lowerText)) {
    const sender = ctx.sender;
    const isAdmin = await isUserAdmin(sock, from, sender);
    if (!isAdmin) {
      await sock.sendMessage(
        from,
        { text: "Link grup WhatsApp tidak diperbolehkan di sini." },
        { quoted: msg },
      );
      const botIsAdmin = await isBotAdmin(sock, from);
      if (botIsAdmin) {
        try {
          await sock.sendMessage(from, { delete: msg.key });
        } catch (e) {
          console.error("Gagal menghapus pesan berisi link:", e);
        }
      }
    }
  }

  // Deteksi URL → downloader / direct media
  if (features.downloader && trimmedText) {
    const url = extractFirstUrl(trimmedText);
    if (url) {
      const lowerUrl = url.toLowerCase();
      const isYoutube = isYoutubeUrl(url);
      const isTiktok = isTiktokUrl(url);
      const isInstagram = isInstagramUrl(url);

      if (isYoutube || isTiktok || isInstagram) {
        if (!ytOk) {
          await sock.sendMessage(
            from,
            {
              text: "yt-dlp tidak tersedia di server. Tidak bisa mengunduh video untuk URL ini.",
            },
            { quoted: msg },
          );
          return;
        }
        try {
          const limitBytes = getDownloadLimitBytes();
          await sock.sendMessage(
            from,
            {
              text: "Sedang mengunduh video, harap tunggu...\n(Batas ukuran: 1 GB)",
            },
            { quoted: msg },
          );
          const { buffer, mimetype } = await downloadYtDlpVideo(url, limitBytes);
          await sock.sendMessage(
            from,
            { video: buffer, mimetype, caption: "Nih videonya 👍" },
            { quoted: msg },
          );
        } catch (e) {
          console.error("Gagal ambil video via yt-dlp:", e);
          const msgText =
            e && e.message && e.message.includes("Ukuran video melebihi")
              ? "Gagal mengunduh: ukuran video melebihi batas 1 GB."
              : "Gagal mengunduh/kirim video. Pastikan yt-dlp (dan ffmpeg) terinstal dan URL valid.";
          await sock.sendMessage(from, { text: msgText }, { quoted: msg });
        }
      } else {
        try {
          if (
            lowerUrl.endsWith(".jpg") ||
            lowerUrl.endsWith(".jpeg") ||
            lowerUrl.endsWith(".png")
          ) {
            await sock.sendMessage(
              from,
              { image: { url }, caption: "Nih fotonya 👍" },
              { quoted: msg },
            );
          } else if (
            lowerUrl.endsWith(".mp4") ||
            lowerUrl.endsWith(".mov") ||
            lowerUrl.endsWith(".mkv")
          ) {
            await sock.sendMessage(
              from,
              { video: { url }, caption: "Nih videonya 👍" },
              { quoted: msg },
            );
          } else if (
            lowerUrl.endsWith(".mp3") ||
            lowerUrl.endsWith(".wav") ||
            lowerUrl.endsWith(".ogg")
          ) {
            let mimetype = "audio/mpeg";
            if (lowerUrl.endsWith(".wav")) mimetype = "audio/wav";
            else if (lowerUrl.endsWith(".ogg")) mimetype = "audio/ogg";
            await sock.sendMessage(
              from,
              { audio: { url }, mimetype },
              { quoted: msg },
            );
          } else {
            await sock.sendMessage(
              from,
              {
                text: "Terdeteksi URL, tapi hanya mendukung: YouTube/TikTok/Instagram (yt-dlp) atau direct media (jpg/png/mp4/mp3/wav/ogg).",
              },
              { quoted: msg },
            );
          }
        } catch (e) {
          console.error("Gagal kirim media dari URL:", e);
          await sock.sendMessage(
            from,
            { text: "Gagal mengambil media dari URL tersebut." },
            { quoted: msg },
          );
        }
      }
      return;
    }
  }

  // Deteksi gambar dengan caption "stiker"/"sticker" → sticker
  const imageMessage = msg.message.imageMessage;
  if (imageMessage && features.sticker) {
    const caption = (imageMessage.caption || "").trim().toLowerCase();
    if (caption === "stiker" || caption === "sticker") {
      try {
        const stream = await downloadContentFromMessage(imageMessage, "image");
        const chunks = [];
        for await (const chunk of stream) {
          chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);
        const webp = await imageBufferToWebpSticker(buffer, stickerPack);
        await sock.sendMessage(from, { sticker: webp }, { quoted: msg });
      } catch (e) {
        console.error("Gagal mengonversi gambar ke stiker:", e);
        await sock.sendMessage(
          from,
          { text: "Gagal mengonversi gambar ke stiker." },
          { quoted: msg },
        );
      }
      return;
    }
  }

  // Reply "stiker"/"sticker" pada gambar yang dikutip → sticker
  if (!msg.message.imageMessage && features.sticker) {
    const justText = lowerText.trim();
    if (justText === "stiker" || justText === "sticker") {
      const quoted =
        msg.message.extendedTextMessage?.contextInfo?.quotedMessage ||
        msg.message.ephemeralMessage?.message?.extendedTextMessage?.contextInfo
          ?.quotedMessage;
      const quotedImage = quoted?.imageMessage;
      if (quotedImage) {
        try {
          const stream = await downloadContentFromMessage(quotedImage, "image");
          const chunks = [];
          for await (const chunk of stream) {
            chunks.push(chunk);
          }
          const buffer = Buffer.concat(chunks);
          const webp = await imageBufferToWebpSticker(buffer, stickerPack);
          await sock.sendMessage(from, { sticker: webp }, { quoted: msg });
        } catch (e) {
          console.error("Gagal mengonversi gambar (reply) ke stiker:", e);
          await sock.sendMessage(
            from,
            { text: "Gagal mengonversi gambar (reply) ke stiker." },
            { quoted: msg },
          );
        }
        return;
      }
    }
  }

  // toimg tanpa prefix (teks biasa)
  if (lowerText === "toimg") {
    await handleToImg(sock, msg, { from });
  }
}

async function translateText(text, fromLang, toLang) {
  const res = await axios.get("https://api.mymemory.translated.net/get", {
    params: {
      q: text,
      langpair: `${fromLang}|${toLang}`,
    },
  });
  const data = res.data;
  const translated =
    (data && data.responseData && data.responseData.translatedText) || "";
  if (!translated) {
    throw new Error("Tidak ada hasil terjemahan");
  }
  return translated;
}

async function getWeather(city, apiKey) {
  const res = await axios.get("https://api.openweathermap.org/data/2.5/weather", {
    params: {
      q: city,
      units: "metric",
      lang: "id",
      appid: apiKey,
    },
  });
  const data = res.data;
  const name = data.name;
  const weather = data.weather && data.weather[0];
  const main = data.main || {};
  const wind = data.wind || {};

  const lines = [];
  lines.push(`🌤️ Cuaca di *${name}*`);
  if (weather && weather.description) {
    lines.push(`Kondisi : ${weather.description}`);
  }
  if (typeof main.temp === "number") {
    lines.push(`Suhu    : ${main.temp}°C (feels like ${main.feels_like}°C)`);
  }
  if (typeof main.humidity === "number") {
    lines.push(`Humidity: ${main.humidity}%`);
  }
  if (typeof wind.speed === "number") {
    lines.push(`Angin   : ${wind.speed} m/s`);
  }
  return lines.join("\n");
}

async function shortenUrl(url) {
  const res = await axios.get("https://is.gd/create.php", {
    params: {
      format: "simple",
      url,
    },
  });
  const shortUrl = (res.data || "").toString().trim();
  if (!shortUrl) {
    throw new Error("Tidak ada hasil pemendekan URL");
  }
  return shortUrl;
}

async function handleMessage(sock, msg, context) {
  if (!msg.message || msg.key.fromMe) return;

  const from = msg.key.remoteJid;
  const sender = msg.key.participant || msg.key.remoteJid;
  const isGroup = from.endsWith("@g.us");

  const chatConfig = getChatConfig(from);
  const prefix = chatConfig.prefix || "/";
  const features = chatConfig.features || {};
  const stickerPack = chatConfig.stickerPack || {};

  const text = getTextFromMessage(msg);
  const trimmedText = (text || "").trim();
  const lowerText = trimmedText.toLowerCase();

  console.log("Pesan dari", from, ":", trimmedText);

  // Command dengan prefix
  let cmd = parseCommand(trimmedText, prefix);

  // Fallback: selalu izinkan prefix "/" juga, supaya user tidak terkunci
  // kalau prefix chat berubah.
  if (!cmd && prefix !== "/") {
    cmd = parseCommand(trimmedText, "/");
  }

  if (cmd) {
    await handleCommand(sock, msg, {
      from,
      sender,
      isGroup,
      prefix,
      features,
      stickerPack,
      ytOk: context.ytOk,
      command: cmd.command,
      args: cmd.args,
    });
    return;
  }

  // ping tanpa prefix
  if (lowerText === "ping") {
    await sock.sendMessage(from, { text: "pong" }, { quoted: msg });
    return;
  }

  await handleAutoFeatures(sock, msg, {
    from,
    sender,
    isGroup,
    prefix,
    features,
    stickerPack,
    ytOk: context.ytOk,
    trimmedText,
    lowerText,
  });
}

module.exports = {
  handleMessage,
};