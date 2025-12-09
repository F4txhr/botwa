const { startBot } = require("./lib/bot");

console.log(
  "[Vortex-x] BOT_OWNER_NUMBER:",
  process.env.BOT_OWNER_NUMBER || "(tidak di-set)",
);
console.log(
  "[Vortex-x] BOT_OWNER_NAME  :",
  process.env.BOT_OWNER_NAME || "(tidak di-set)",
);
console.log(
  "[Vortex-x] OPENWEATHER_API_KEY:",
  process.env.OPENWEATHER_API_KEY ? "(di-set)" : "(tidak di-set)",
);

process.on("unhandledRejection", (err) => {
  console.error("Unhandled Rejection:", err);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

startBot().catch((err) => {
  console.error("Gagal menjalankan bot:", err);
});
