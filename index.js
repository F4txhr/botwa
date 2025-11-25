const { startBot } = require("./lib/bot");

process.on("unhandledRejection", (err) => {
  console.error("Unhandled Rejection:", err);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

startBot().catch((err) => {
  console.error("Gagal menjalankan bot:", err);
});
