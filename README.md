# Vortex-x

WhatsApp bot sederhana berbasis Baileys dengan fitur downloader, sticker, translate, cuaca, dan konfigurasi per-grup.

## Fitur Utama

- ping → pong
- Menu bantuan: `/help` atau `/menu`
- Downloader:
  - Perintah: `/ytv &lt;url&gt;`, `/yta &lt;url YouTube&gt;`
  - Auto deteksi URL: YouTube / TikTok / Instagram via library JS `btch-downloader` (dikirim sebagai video MP4)
  - Direct link media (jpg/png/mp4/mp3/wav/ogg)
  - Batas ukuran download global (default 1 GB, bisa diubah dengan `/setlimit`)
- Sticker:
  - Gambar → sticker (caption "stiker"/"sticker" atau reply "stiker")
  - Teks → sticker (/stiker <teks>)
  - Sticker → gambar (/toimg atau teks "toimg" reply ke sticker)
- Utilitas:
  - /tr id-en <teks> → translate
  - /short <url> → pemendek URL
- Admin / grup:
  - `/setprefix <prefix>` → ganti prefix per chat
  - `/toggle <fitur> on|off` → (downloader, welcome, antilink, translate, weather, shorten, sticker)
  - `/status` → lihat konfigurasi chat ini
  - Welcome / goodbye otomatis di grup (jika fitur `welcome` aktif)
- Owner-only:
  - `/setlimit &lt;MB&gt;` → ubah batas ukuran download global untuk fitur downloader
  - `/logs` → ringkasan penggunaan command sejak bot dijalankan

## Prasyarat

- Node.js LTS (disarankan 18+)
- Jalankan `npm install` untuk menginstal semua library JS yang dibutuhkan (termasuk `btch-downloader`, `sharp`, dan `wa-sticker-formatter`).
- (Opsional) `ffmpeg` hanya sebagai fallback tambahan untuk beberapa operasi sticker jika `sharp` / `wa-sticker-formatter` tidak dapat digunakan.

### Instal ffmpeg (opsional, contoh Ubuntu)

```bash
sudo apt-get update && sudo apt-get install -y ffmpeg
```

### Instal di Termux (Android)

- Pastikan Node 18+.
- (Opsional) Install ffmpeg:

```bash
pkg update && pkg install -y ffmpeg
```

- Di Termux, `sharp` native sering tidak tersedia. Kode akan otomatis fallback ke `ffmpeg` untuk konversi sticker dan stiker teks jika Anda memasangnya.

## Konfigurasi Environment

Beberapa fitur memerlukan environment variable:

- `BOT_OWNER_NUMBER` (disarankan)
  - Nomor WhatsApp owner dalam format internasional, hanya angka.
  - Contoh: `6281234567890`
  - Dipakai untuk:
    - Menentukan siapa yang dianggap Owner
    - Mengizinkan perintah `/setlimit` dan `/logs`
- `BOT_OWNER_NAME` (opsional)
  - Nama owner untuk ditampilkan di `/owner`.
- `BOT_OWNER_JID` (opsional tapi disarankan di multi-device)
  - JID penuh owner (contoh: `99166583808031@lid`), supaya deteksi owner tetap akurat di akun LID/MD.onfigurasi Environment

Beberapa fitur memerlukan environment variable:

- `BOT_OWNER_NUMBER` (disarankan)
  - Nomor WhatsApp owner dalam format internasional, hanya angka.
  - Contoh: `6281234567890`
  - Dipakai untuk:
    - Menentukan siapa yang dianggap Owner
    - Mengizinkan perintah `/setlimit` dan `/logs`
- `BOT_OWNER_NAME` (opsional)
  - Nama owner untuk ditampilkan di `/owner`.

## Cara Menjalankan (Termux / Linux)

### 1. Instal dependensi

```bash
npm install
```

### 2. Set environment & jalankan (cara cepat)

Contoh dari Termux / shell:

```bash
BOT_OWNER_NUMBER=6281234567890 \
BOT_OWNER_NAME="Nama Kamu" \
OPENWEATHER_API_KEY="API_KEY_OPENWEATHER_KAMU" \
npm run start
```

### 3. Menjalankan lewat script `start.sh`

Project ini menyediakan script `start.sh` sebagai shortcut.

Edit dulu isi `start.sh`:

```sh
#!/usr/bin/env sh

export BOT_OWNER_NUMBER="6281234567890"
export BOT_OWNER_NAME="Nama Owner"
export OPENWEATHER_API_KEY="ISI_API_KEY_OPENWEATHER_ANDA"

npm run start
```

Lalu jalankan:

```bash
chmod +x start.sh   # sekali saja
./start.sh
```

- Login dengan scan QR di terminal.

## Catatan

- Video diupayakan dikirim sebagai MP4 agar playable di WhatsApp.
- Sticker dikonversi ke webp 512px; di Termux akan fallback ke `ffmpeg` jika `sharp` tidak tersedia (jika Anda memilih memasang ffmpeg).
- Konfigurasi per-chat (prefix, fitur, sticker pack) tersimpan di `./session/config.json`.
- Folder sesi Baileys tersimpan di `./session`.

## Skrip Pengembangan

```bash
npm run lint       # ESLint
npm run format     # Prettier write
npm run typecheck  # TypeScript check (JS dengan checkJs)
```
