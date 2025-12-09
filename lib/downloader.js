const axios = require("axios");
let youtube = null;
let tiktok = null;
let instagram = null;

// Seluruh downloader sekarang memakai @xct007/frieren-scraper
// agar tidak bergantung pada btch-downloader yang sering berubah.
try {
  // eslint-disable-next-line global-require
  const frieren = require("@xct007/frieren-scraper");
  youtube = frieren.youtube || null;
  tiktok = frieren.tiktok || null;
  instagram = frieren.instagram || null;
} catch (e) {
  console.error("[downloader] Gagal memuat @xct007/frieren-scraper:", e);
  youtube = null;
  tiktok = null;
  instagram = null;
}

/**
 * Cari URL media (video/audio) di dalam object hasil frieren-scraper.
 * Prioritas:
 *  - field spesifik: nowm, no_watermark, url, download, src
 *  - string dengan ekstensi media (mp4, webm, mp3, m4a, dll)
 */
function findMediaUrl(obj, { audio = false } = {}) {
  if (!obj || typeof obj !== "object") return null;

  const videoExt = /\.(mp4|webm|mkv|mov)(\?|$)/i;
  const audioExt = /\.(mp3|m4a|aac|ogg|wav)(\?|$)/i;
  const extPattern = audio ? audioExt : videoExt;

  const preferredKeys = [
    "nowm",
    "no_watermark",
    "download",
    "downloadUrl",
    "url",
    "src",
    "link",
  ];

  let fallback = null;
  const stack = [obj];

  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== "object") continue;

    // 1) cek key-key yang umum
    for (const key of preferredKeys) {
      if (Object.prototype.hasOwnProperty.call(current, key)) {
        const val = current[key];
        if (typeof val === "string" && /^https?:\/\//i.test(val) && extPattern.test(val)) {
          return val;
        }
      }
    }

    // 2) cek semua properti lain
    for (const value of Object.values(current)) {
      if (typeof value === "string") {
        if (/^https?:\/\//i.test(value) && extPattern.test(value)) {
          // Simpan sebagai fallback pertama
          if (!fallback) fallback = value;
        }
      } else if (Array.isArray(value)) {
        value.forEach((v) => {
          if (v && typeof v === "object") stack.push(v);
          if (typeof v === "string") {
            if (/^https?:\/\//i.test(v) && extPattern.test(v)) {
              if (!fallback) fallback = v;
            }
          }
        });
      } else if (value && typeof value === "object") {
        stack.push(value);
      }
    }
  }

  return fallback;
}

/**
 * Download video dari berbagai platform via frieren-scraper.
 * Mengembalikan buffer video yang siap dikirim ke WhatsApp.
 */
async function downloadFrierenVideo(url) {
  if (!youtube && !tiktok && !instagram) {
    throw new Error("Downloader tidak siap (frieren-scraper tidak tersedia).");
  }

  let data;

  if (/youtu\.be|youtube\.com/i.test(url)) {
    if (!youtube || typeof youtube.download !== "function") {
      throw new Error("Downloader YouTube tidak tersedia.");
    }
    data = await youtube.download(url);
  } else if (/tiktok\.com/i.test(url)) {
    if (!tiktok || typeof tiktok.v1 !== "function") {
      throw new Error("Downloader TikTok tidak tersedia.");
    }
    data = await tiktok.v1(url);
  } else if (/instagram\.com|ig\.me/i.test(url)) {
    if (!instagram || typeof instagram.download !== "function") {
      throw new Error("Downloader Instagram tidak tersedia.");
    }
    data = await instagram.download(url);
  } else {
    throw new Error("Platform tidak didukung untuk URL ini.");
  }

  const directUrl = findMediaUrl(data, { audio: false });
  if (!directUrl) {
    console.error("[downloader] Tidak menemukan URL video di respon:", data);
    throw new Error("Tidak menemukan URL video yang bisa dipakai.");
  }

  const res = await axios.get(directUrl, {
    responseType: "arraybuffer",
    maxRedirects: 5,
  });

  return {
    buffer: Buffer.from(res.data),
    mimetype: "video/mp4",
  };
}

/**
 * Download audio dari YouTube via frieren-scraper.
 * Mengembalikan buffer audio yang siap dikirim ke WhatsApp.
 */
async function downloadFrierenAudioFromYoutube(url) {
  if (!youtube || typeof youtube.download !== "function") {
    throw new Error("Downloader YouTube tidak tersedia.");
  }

  const data = await youtube.download(url);
  const directUrl = findMediaUrl(data, { audio: true }) || findMediaUrl(data, { audio: false });

  if (!directUrl) {
    console.error("[downloader] Tidak menemukan URL audio di respon:", data);
    throw new Error("Tidak menemukan URL audio yang bisa dipakai.");
  }

  const res = await axios.get(directUrl, {
    responseType: "arraybuffer",
    maxRedirects: 5,
  });

  return {
    buffer: Buffer.from(res.data),
    mimetype: "audio/mpeg",
  };
}

module.exports = {
  ensureYtDlpAvailable: async () => true,
  downloadYtDlpVideo: downloadFrierenVideo,
  downloadYtDlpAudio: downloadFrierenAudioFromYoutube,
};