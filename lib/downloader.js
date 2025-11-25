const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

function tmpFile(prefix, ext) {
  return path.join(
    os.tmpdir(),
    `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`,
  );
}

function formatMaxSize(maxBytes) {
  if (!maxBytes) return "1G";
  const gb = maxBytes / (1024 * 1024 * 1024);
  if (gb >= 1 && Number.isInteger(gb)) {
    return `${gb}G`;
  }
  const mb = Math.max(1, Math.round(maxBytes / (1024 * 1024)));
  return `${mb}M`;
}

function runYtDlp(args) {
  return new Promise((resolve, reject) => {
    const cp = spawn("yt-dlp", args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    cp.stderr.on("data", (d) => {
      err += d.toString();
    });
    cp.on("error", (e) => reject(e));
    cp.on("close", (code) => {
      if (code === 0) return resolve();
      reject(new Error(`yt-dlp exit code ${code}: ${err}`));
    });
  });
}

async function ensureYtDlpAvailable() {
  return new Promise((resolve) => {
    const cp = spawn("yt-dlp", ["--version"], { stdio: ["ignore", "pipe", "pipe"] });
    cp.on("error", () => resolve(false));
    cp.on("close", (code) => resolve(code === 0));
  });
}

// Download video via yt-dlp, batasi ukuran file
async function downloadYtDlpVideo(url, maxBytes) {
  const tmpPath = tmpFile("yt-video", "mp4");
  const args = [
    "-f",
    "b[ext=mp4]/bv*[ext=mp4]+ba[ext=m4a]/best",
    "--no-playlist",
    "--max-filesize",
    formatMaxSize(maxBytes),
    "-o",
    tmpPath,
    url,
  ];

  await runYtDlp(args);

  const stat = fs.statSync(tmpPath);
  if (!stat.size) {
    fs.unlink(tmpPath, () => {});
    throw new Error("File video kosong dari yt-dlp");
  }
  if (maxBytes && stat.size > maxBytes) {
    fs.unlink(tmpPath, () => {});
    throw new Error("Ukuran video melebihi batas download");
  }
  const buffer = fs.readFileSync(tmpPath);
  fs.unlink(tmpPath, () => {});
  return {
    buffer,
    mimetype: "video/mp4",
    size: stat.size,
  };
}

// Download audio (mp3) via yt-dlp, batasi ukuran file
async function downloadYtDlpAudio(url, maxBytes) {
  const tmpPath = tmpFile("yt-audio", "mp3");
  const args = [
    "-x",
    "--audio-format",
    "mp3",
    "--audio-quality",
    "0",
    "--no-playlist",
    "--max-filesize",
    formatMaxSize(maxBytes),
    "-o",
    tmpPath,
    url,
  ];

  await runYtDlp(args);

  const stat = fs.statSync(tmpPath);
  if (!stat.size) {
    fs.unlink(tmpPath, () => {});
    throw new Error("File audio kosong dari yt-dlp");
  }
  if (maxBytes && stat.size > maxBytes) {
    fs.unlink(tmpPath, () => {});
    throw new Error("Ukuran audio melebihi batas download");
  }

  const buffer = fs.readFileSync(tmpPath);
  fs.unlink(tmpPath, () => {});
  return {
    buffer,
    mimetype: "audio/mpeg",
    size: stat.size,
  };
}

module.exports = {
  ensureYtDlpAvailable,
  downloadYtDlpVideo,
  downloadYtDlpAudio,
};