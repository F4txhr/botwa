#!/usr/bin/env sh

# Set nomor owner bot (format internasional, hanya angka, tanpa spasi/tanda +)
# Contoh: 6281234567890
export BOT_OWNER_NUMBER="6281234567890"

# (Opsional) Nama owner untuk ditampilkan di perintah /owner
export BOT_OWNER_NAME="Nama Owner"

# API key untuk fitur /cuaca (daftar gratis di https://openweathermap.org/api)
export OPENWEATHER_API_KEY="ISI_API_KEY_OPENWEATHER_ANDA"

# Jalankan bot
npm run start