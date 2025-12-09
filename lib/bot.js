const makeWASocket = require("@whiskeysockets/baileys").default;
const {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
} = require("@whiskeysockets/baileys");
const { handleMessage } = require("./messageHandler");
const { ensureYtDlpAvailable } = require("./downloader");
const { loadConfig, getChatConfig } = require("./configStore");

async function handleGroupParticipantsUpdate(sock, update) {
  const { id, participants, action } = update;
  const chatConfig = getChatConfig(id);
  const features = chatConfig.features || {};
  if (!features.welcome) return;

  if (action !== "add" && action !== "remove") return;

  let groupName = "grup ini";
  try {
    const meta = await sock.groupMetadata(id);
    if (meta && meta.subject) {
      groupName = meta.subject;
    }
  } catch (e) {
    console.error("Gagal mengambil metadata grup:", e);
  }

  if (!Array.isArray(participants)) return;

  for (const p of participants) {
    const jid =
      typeof p === "string"
        ? p
        : p && typeof p === "object" && typeof p.id === "string"
          ? p.id
          : null;
    if (!jid) continue;

    const number = jid.split("@")[0];

    if (action === "add") {
      const text = `Selamat datang @${number} di *${groupName}* 👋`;
      await sock.sendMessage(id, { text, mentions: [jid] });
    } else if (action === "remove") {
      const text = `Selamat tinggal @${number}, semoga betah di tempat baru.`;
      await sock.sendMessage(id, { text, mentions: [jid] });
    }
  }
}

function getOwnerJidFromEnv() {
  const raw = process.env.BOT_OWNER_NUMBER;
  if (!raw) return null;
  const digits = raw.replace(/[^0-9]/g, "");
  if (!digits) return null;
  // JID user single-device / MD umumnya <number>@s.whatsapp.net
  return `${digits}@s.whatsapp.net`;
}

async function notifyOwnerOnline(sock) {
  const ownerJid = getOwnerJidFromEnv();
  if (!ownerJid) {
    console.log("[Vortex-x] BOT_OWNER_NUMBER belum di-set, tidak mengirim pesan ke owner.");
    return;
  }

  const ownerName = process.env.BOT_OWNER_NAME || "Owner";
  const me = sock.user && sock.user.id;

  const lines = [];
  lines.push(`👋 Hai *${ownerName}*`);
  lines.push("");
  lines.push("Vortex-x baru saja *online*.");
  if (me) {
    lines.push(`ID sesi : ${me}`);
  }
  lines.push("");
  lines.push("Ketik */menu* untuk melihat daftar perintah.");

  try {
    await sock.sendMessage(ownerJid, { text: lines.join("\n") });
    console.log("[Vortex-x] Pesan online terkirim ke owner:", ownerJid);
  } catch (e) {
    console.error("[Vortex-x] Gagal mengirim pesan online ke owner:", e);
  }
}

async function startBot() {
  loadConfig();

  const { state, saveCreds } = await useMultiFileAuthState("./session");
  const { version } = await fetchLatestBaileysVersion();

  const ytOk = await ensureYtDlpAvailable();
  if (!ytOk) {
    console.warn(
      "Peringatan: layanan downloader tidak siap. Fitur download mungkin tidak berfungsi.",
    );
  }

  const sock = makeWASocket({
    version,
    printQRInTerminal: true,
    auth: state,
  });

  sock.ev.on("creds.update", saveCreds);

  let ownerNotified = false;

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === "close") {
      const error = lastDisconnect?.error;
      const statusCode = error && "output" in error ? error.output.statusCode : 0;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      if (shouldReconnect) {
        console.log("Koneksi terputus, mencoba menghubungkan ulang...");
        startBot().catch((e) => {
          console.error("Gagal reconnect:", e);
        });
      } else {
        console.log("Koneksi terputus karena logout. Tidak akan reconnect otomatis.");
      }
    } else if (connection === "connecting") {
      console.log("Menghubungkan ke WhatsApp...");
    } else if (connection === "open") {
      console.log("Tersambung ke WhatsApp sebagai", sock.user?.id);
      if (!ownerNotified) {
        ownerNotified = true;
        notifyOwnerOnline(sock).catch((e) => {
          console.error("Gagal kirim notifikasi online ke owner:", e);
        });
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    const msg = messages[0];
    try {
      await handleMessage(sock, msg, {
        ytOk,
      });
    } catch (e) {
      console.error("Error saat memproses pesan:", e);
    }
  });

  sock.ev.on("group-participants.update", async (update) => {
    try {
      await handleGroupParticipantsUpdate(sock, update);
    } catch (e) {
      console.error("Error di handler group-participants.update:", e);
    }
  });
}

module.exports = {
  startBot,
};