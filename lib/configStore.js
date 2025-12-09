const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.join(__dirname, "..");
const SESSION_DIR = path.join(ROOT_DIR, "session");
const CONFIG_PATH = path.join(SESSION_DIR, "config.json");

let config = null;

function ensureSessionDir() {
  if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
  }
}

function getDefaultConfig() {
  return {
    global: {
      // Batas ukuran download global untuk fitur downloader (default 1 GB)
      downloadLimitBytes: 1024 * 1024 * 1024,
    },
    chats: {},
  };
}

function getDefaultChatConfig() {
  return {
    prefix: "/",
    features: {
      downloader: true,
      welcome: true,
      antilink: false,
      translate: true,
      shorten: true,
      sticker: true,
    },
    stickerPack: {
      packname: "Vortex-x",
      author: "Vortex-x",
    },
  };
}

function loadConfig() {
  if (config) return config;

  ensureSessionDir();

  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    config = JSON.parse(raw);

    if (!config.global) {
      config.global = { downloadLimitBytes: 1024 * 1024 * 1024 };
    }
    if (!config.chats) {
      config.chats = {};
    }
  } catch {
    config = getDefaultConfig();
  }

  saveConfig();
  return config;
}

function saveConfig() {
  if (!config) {
    config = getDefaultConfig();
  }
  ensureSessionDir();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function getChatConfig(jid) {
  const cfg = loadConfig();
  if (!cfg.chats[jid]) {
    cfg.chats[jid] = getDefaultChatConfig();
  } else {
    const defaults = getDefaultChatConfig();
    // Pastikan field baru terisi default jika belum ada
    if (!cfg.chats[jid].features) {
      cfg.chats[jid].features = defaults.features;
    }
    if (!cfg.chats[jid].stickerPack) {
      cfg.chats[jid].stickerPack = defaults.stickerPack;
    }
    if (!cfg.chats[jid].prefix) {
      cfg.chats[jid].prefix = defaults.prefix;
    }
    // Bersihkan fitur lama yang sudah tidak dipakai (mis. weather)
    if (cfg.chats[jid].features.weather !== undefined) {
      delete cfg.chats[jid].features.weather;
    }
  }
  saveConfig();
  return cfg.chats[jid];
}

function setChatPrefix(jid, prefix) {
  const chat = getChatConfig(jid);
  chat.prefix = prefix;
  saveConfig();
}

function setChatFeature(jid, featureKey, enabled) {
  const chat = getChatConfig(jid);
  if (!chat.features) {
    chat.features = getDefaultChatConfig().features;
  }
  chat.features[featureKey] = enabled;
  saveConfig();
}

function setChatStickerPack(jid, packname, author) {
  const chat = getChatConfig(jid);
  chat.stickerPack = { packname, author };
  saveConfig();
}

function getDownloadLimitBytes() {
  const cfg = loadConfig();
  const limit = cfg.global && cfg.global.downloadLimitBytes;
  if (typeof limit === "number" && Number.isFinite(limit) && limit > 0) {
    return limit;
  }
  cfg.global.downloadLimitBytes = 1024 * 1024 * 1024;
  saveConfig();
  return cfg.global.downloadLimitBytes;
}

function setDownloadLimitBytes(bytes) {
  const cfg = loadConfig();
  if (!cfg.global) cfg.global = {};
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes <= 0) {
    return;
  }
  cfg.global.downloadLimitBytes = bytes;
  saveConfig();
}

module.exports = {
  loadConfig,
  saveConfig,
  getChatConfig,
  setChatPrefix,
  setChatFeature,
  setChatStickerPack,
  getDownloadLimitBytes,
  setDownloadLimitBytes,
};