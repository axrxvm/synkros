const express = require("express");
const http = require("http");
const cron = require("node-cron");
const app = express();
require("dotenv").config();
const path = require("path");
const cors = require("cors");
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require("uuid");
const crypto = require("crypto");
const logger = require("./services/logger");

const PORT = process.env.PORT || 3000;

// --- Security & Middleware Setup ---
const allowedOrigins = process.env.ALLOWED_CLIENTS
  ? process.env.ALLOWED_CLIENTS.split(",").map(o => o.trim())
  : [];
if (process.env.NODE_ENV === 'development') {
  allowedOrigins.push('http://localhost:3000', 'http://127.0.0.1:3000');
}

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin && process.env.NODE_ENV === 'development') {
      return callback(null, true);
    }
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.disable("x-powered-by");

app.use((req, res, next) => {
  const rayId = uuidv4();
  req.rayId = rayId;
  res.setHeader("ALabs-Ray-Id", rayId);
  next();
});

// Harden HTTP headers
app.use(helmet({
  contentSecurityPolicy: false, // custom CSP defined manually below
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: { policy: "same-origin" },
  crossOriginResourcePolicy: { policy: "same-origin" },
  dnsPrefetchControl: { allow: false },
  frameguard: { action: "deny" },
  hsts: {
    maxAge: 63072000, // 2 years
    includeSubDomains: true,
    preload: true
  },
  noSniff: true,
  referrerPolicy: { policy: "no-referrer" },
  xssFilter: true,
  hidePoweredBy: true,
}));
app.use((req, res, next) => {
  try {
    const nonce = crypto.randomBytes(16).toString("base64");
    res.locals.cspNonce = nonce;
    const directives = [
      `default-src 'self'`,
      `script-src 'self' 'nonce-${nonce}' https://challenges.cloudflare.com`,
      `script-src-elem 'self' 'nonce-${nonce}' https://challenges.cloudflare.com`,
      `style-src 'self' 'unsafe-inline'`,
      `img-src 'self' data:`,
      `connect-src 'self' https://challenges.cloudflare.com`,
      `font-src 'self' data:`,
      `object-src 'none'`,
      `frame-src https://challenges.cloudflare.com`,
      `frame-ancestors 'none'`,
      `base-uri 'self'`,
      `form-action 'self'`
    ].join("; ");

    res.setHeader("Content-Security-Policy", directives);
  } catch (err) {
    logger.error("CSP nonce generation failed:", err, req);
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    );
  }
  next();
});
app.set('trust proxy', 1);
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'development') return next();
  const isSecure = req.secure || (req.headers['x-forwarded-proto'] || '').split(',')[0] === 'https';
  if (isSecure) return next();
  // Permanent redirect to https (preserve host & url)
  const host = req.headers.host;
  const target = `https://${host}${req.originalUrl}`;
  return res.redirect(301, target);
});
app.use(express.json({ limit: '150kb' }));
app.use(express.static(path.join(__dirname, "public"), {
  dotfiles: "ignore",
  etag: true,
  extensions: false,
  index: false,
  maxAge: "7d",
  setHeaders: (res, path) => {
    res.setHeader("Cache-Control", "public, max-age=604800, immutable");
  }
}));
app.use((err, req, res, next) => {
  logger.error(err, req);
  res.status(500).json({ error: "Internal server error" });
});

app.set("views", path.join(__dirname, "/views"));
app.set("view engine", "ejs");

const { router: verifyRouter, checkVerification } = require("./routes/verify");
app.use(checkVerification);

app.use("/verify", verifyRouter);
app.use("/", require("./routes/home"));
app.use("/uploaded-files", require("./routes/listing"));
app.use("/cleanup", require("./routes/cleanup"));
app.use("/api/files", require("./routes/files"));
app.use("/files", require("./routes/filePreview"));
app.use("/files/download", require("./routes/download"));
app.use("/api/system", require("./routes/system"));
app.get('/privacy', (req, res) => { res.render('privacy', { rayId: req.rayId }); });
app.get('/tos', (req, res) => { res.render('tos', { rayId: req.rayId }); });
app.get("/report", (req, res) => { res.render("abuse", { rayId: req.rayId }); });
app.get("/license", (req, res) => { res.render("license", { rayId: req.rayId }); });

// Rate limiting
const limiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: 100,
	standardHeaders: true,
	legacyHeaders: false, 
});
app.use(limiter);

const server = app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
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
