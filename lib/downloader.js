const { youtube, aio } = require("btch-downloader");
let tiktok = null;
let instagram = null;

// Coba require frieren-scraper, tapi jangan paksa jika gagal / API berbeda
try {
  // eslint-disable-next-line global-require
  const frieren = require("@xct007/frieren-scraper");
  tiktok = frieren.tiktok || null;
  instagram = frieren.instagram || null;
} catch (e) {
  // Jika tidak tersedia, kita akan fallback ke btch-downloader (aio)
  tiktok = null;
  instagram = null;
}

/**
 * Cari string URL pertama di dalam object (rekursif) yang tampak seperti URL video.
 * Kita prioritaskan URL dengan ekstensi video umum supaya tidak mengambil link halaman HTML.
 */
function findAnyVideoUrl(obj) {
  if (!obj || typeof obj !== "object") return null;

  const videoExtPattern = /\.(mp4|mov|mkv|webm)(\?|$)/i;

  const stack = [obj];
  let firstHttpUrl = null;

  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== "object") continue;

    for (const [key, value] of Object.entries(current)) {
      if (typeof value === "string") {
        if (/^https?:\/\//i.test(value)) {
          if (!firstHttpUrl) {
            firstHttpUrl = value;
          }
          if (videoExtPattern.test(value)) {
            return value;
          }
        }
      } else if (typeof value === "object" && value !== null) {
        stack.push(value);
      }
    }
  }

  // Jika tidak menemukan yang ber-ekstensi video, fallback ke URL http(s) pertama.
  return firstHttpUrl;
}

/**
 * Pilih URL video terbaik dari hasil btch-downloader.
 * Bentuk data bervariasi per layanan, jadi kita ambil yang paling aman:
 * - cari properti yang berisi array/link dengan kualitas tertinggi.
 */
function pickBestVideoUrlFromBtch(data) {
  if (!data || typeof data !== "object") {
    throw new Error("Respon btch kosong / tidak valid");
  }

  // Banyak layanan di btch-downloader mengembalikan { data: [ { url: \"...\", ... }, ... ] }
  const arr = Array.isArray(data.data) ? data.data : null;
  if (arr && arr.length > 0) {
    const first = arr[0];
    if (first && first.url) {
      return first.url;
    }
  }

  // Beberapa respon punya \"video\" atau \"result\" yang berisi url
  if (data.video && typeof data.video === "string") {
    return data.video;
  }
  if (Array.isArray(data.video) && data.video[0] && data.video[0].url) {
    return data.video[0].url;
  }
  if (data.result && typeof data.result === "string") {
    return data.result;
  }

  // Fallback: cari properti bernama \"url\" di level atas
  if (data.url && typeof data.url === "string") {
    return data.url;
  }

  // Fallback terakhir: cari string yang tampak seperti URL video di seluruh object
  const anyUrl = findAnyVideoUrl(data);
  if (anyUrl) {
    return anyUrl;
  }

  console.error("[downloader] Respon btch tidak mengandung URL yang bisa dipakai:", data);
  throw new Error("Tidak menemukan URL video yang bisa dipakai dari respon btch.");
}

/**
 * Pilih URL audio (jika tersedia) dari hasil btch-downloader YouTube.
 * Jika tidak ada audio khusus, kita pakai video URL biasa.
 */
function pickBestAudioUrlFromYoutubeBtch(data) {
  if (!data || typeof data !== "object") {
    throw new Error("Respon btch YouTube kosong / tidak valid");
  }

  // Coba cari field audio jika ada
  if (Array.isArray(data.data) && data.data.length > 0) {
    const arr = data.data;

    // Cari entri yang bertipe audio saja
    const audioOnly =
      arr.find((x) => x && x.mime && x.mime.startsWith("audio/")) ||
      arr.find((x) => x && x.type === "audio");

    if (audioOnly && audioOnly.url) {
      return audioOnly.url;
    }

    // Kalau tidak ada audio-only, pakai entri pertama (video) untuk dikirim sebagai audio
    if (arr[0] && arr[0].url) {
      return arr[0].url;
    }
  }

  // Fallback ke pemilih video umum
  return pickBestVideoUrlFromBtch(data);
}

/**
 * Download / ambil URL video dari berbagai platform via btch-downloader.
 * Mengembalikan direct URL yang bisa dipakai WhatsApp (video: { url }).
 */
async function downloadBtchVideo(url) {
  let data;

  if (/youtu\.be|youtube\.com/i.test(url)) {
    // YouTube tetap memakai btch-downloader
    data = await youtube(url);
  } else if (/tiktok\.com/i.test(url)) {
    // TikTok: coba frieren-scraper jika tersedia, kalau tidak fallback ke btch (aio)
    if (tiktok && typeof tiktok.v1 === "function") {
      data = await tiktok.v1(url);
    } else {
      data = await aio(url);
    }
  } else if (/instagram\.com|ig\.me/i.test(url)) {
    // Instagram: coba frieren-scraper jika tersedia, kalau tidak fallback ke btch (aio)
    if (instagram && typeof instagram.download === "function") {
      data = await instagram.download(url);
    } else {
      data = await aio(url);
    }
  } else {
    // Fallback: pakai AIO (auto detect) dari btch-downloader
    data = await aio(url);
  }

  const directUrl = pickBestVideoUrlFromBtch(data);

  return {
    directUrl,
    mimetype: "video/mp4", // WhatsApp akan deteksi sendiri; ini hint saja
  };
}

/**
 * Ambil URL audio dari YouTube via btch-downloader.
 * Karena btch tidak melakukan konversi ke mp3 di sisi kita,
 * kita kirim sebagai audio dengan URL langsung.
 */
async function downloadBtchAudioFromYoutube(url) {
  const data = await youtube(url);
  const directUrl = pickBestAudioUrlFromYoutubeBtch(data);

  return {
    directUrl,
    mimetype: "audio/mpeg",
  };
}

module.exports = {
  // Tidak perlu ensureYtDlpAvailable lagi, tapi tetap export stub
  ensureYtDlpAvailable: async () => true,
  downloadYtDlpVideo: downloadBtchVideo,
  downloadYtDlpAudio: downloadBtchAudioFromYoutube,
};