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

  for (const user of participants) {
    const number = user.split("@")[0];
    if (action === "add") {
      const text = `Selamat datang @${number} di *${groupName}* 👋`;
      await sock.sendMessage(id, { text, mentions: [user] });
    } else if (action === "remove") {
      const text = `Selamat tinggal @${number}, semoga betah di tempat baru.`;
      await sock.sendMessage(id, { text, mentions: [user] });
    }
  }
}

async function startBot() {
  loadConfig();

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