const makeWASocket = require("@whiskeysockets/baileys").default;
const {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
} = require("@whiskeysockets/baileys");
const qrcode = require("qrcode-terminal");
const axios = require("axios");

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

    // TODO:
    // - deteksi URL => panggil downloader
    // - deteksi pesan gambar dengan caption "stiker" => convert ke sticker
  });
}

startBot();
