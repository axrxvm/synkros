const express = require("express");
const http = require("http");
const cron = require("node-cron");
const app = express();
require("dotenv").config();
const path = require("path");
const cors = require("cors");
const helmet = require('helmet');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;

const corsOptions = {
  origin: process.env.ALLOWED_CLIENTS ? process.env.ALLOWED_CLIENTS.split(",") : [],
};
app.use(cors(corsOptions));
app.disable('x-powered-by');
app.use(helmet());
app.use((req, res, next) => {
  try {
    const nonce = crypto.randomBytes(16).toString('base64');
    res.locals.cspNonce = nonce;

    const directives = [
      `default-src 'self'`,
      `script-src 'self' 'nonce-${nonce}'`,
      `style-src 'self' 'unsafe-inline'`,
      `img-src 'self' data:`,
      `connect-src 'self'`,
      `font-src 'self' data:`,
      `object-src 'none'`
    ].join('; ');

    res.setHeader('Content-Security-Policy', directives);
  } catch (e) {
    // If nonce generation fails for any reason, fall back to a strict policy
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self' data:; object-src 'none'");
  }

  next();
});

app.use(express.json({ limit: '150kb' }));
app.use(express.static("public"));
app.set("views", path.join(__dirname, "/views"));
app.set("view engine", "ejs");

app.use("/", require("./routes/home"));
app.use("/uploaded-files", require("./routes/listing"));
app.use("/cleanup", require("./routes/cleanup"));
app.use("/api/files", require("./routes/files"));
app.use("/files", require("./routes/filePreview"));
app.use("/files/download", require("./routes/download"));
app.use("/api/system", require("./routes/system"));
app.get('/privacy', (req, res) => { res.render('privacy'); });
app.get('/tos', (req, res) => { res.render('tos'); });
app.get("/report", (req, res) => { res.render("abuse"); });
app.get("/license", (req, res) => { res.render("license"); });


const server = app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});

// Cleanup logic
const { cleanupExpiredFiles } = require('./routes/cleanup');
(async () => {
  console.log("Running startup cleanup");
  await cleanupExpiredFiles();
})();
cron.schedule("0 */3 * * *", async () => {
  console.log("Running scheduled cleanup (every 3 hours)");
  await cleanupExpiredFiles();
});
