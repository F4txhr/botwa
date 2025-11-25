# botwa

WhatsApp bot sederhana berbasis Baileys.

## Fitur
- ping → pong
- /confess Nama|Pesan → generator teks anonim
- Deteksi URL → downloader
  - YouTube/TikTok/Instagram via yt-dlp (dikirim sebagai video MP4)
  - Direct link media (jpg/png/mp4/mp3)
- Konversi gambar → sticker (caption "stiker"/"sticker" atau reply)

## Prasyarat
- Node.js LTS
- yt-dlp terpasang di sistem (wajib untuk downloader YouTube/TikTok/IG)
- (Direkomendasikan) ffmpeg untuk merge/transcode beberapa video

### Instal yt-dlp (contoh Ubuntu)
```
sudo apt-get update && sudo apt-get install -y yt-dlp ffmpeg
```

### Instal di Termux (Android)
- Pastikan Node 18+.
- Install yt-dlp dan ffmpeg:
```
pkg update && pkg install -y yt-dlp ffmpeg
```
- Di Termux, sharp native sering tidak tersedia. Kode akan otomatis fallback ke ffmpeg untuk konversi sticker, jadi Anda tidak perlu memasang paket WASM.

## Setup & Menjalankan
```
npm install
npm run start
```
- Login dengan scan QR di terminal.

## Catatan
- Video diupayakan dikirim sebagai MP4 agar playable di WhatsApp.
- Sticker dikonversi ke webp 512px; di Termux akan coba menggunakan WASM jika native tidak tersedia.
- Folder sesi tersimpan di `./session`.

## Skrip Pengembangan
```
npm run lint       # ESLint
npm run format     # Prettier write
npm run typecheck  # TypeScript check (JS dengan checkJs)
```
