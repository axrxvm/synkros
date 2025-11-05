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
    // Allow same-origin requests (when origin is undefined/null)
    if (!origin) {
      return callback(null, true);
    }
    // Allow requests from allowed origins
    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
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
  contentSecurityPolicy: false, // custom CSP via nonce below
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: { policy: "same-origin" },
  crossOriginResourcePolicy: { policy: "same-origin" },
  dnsPrefetchControl: { allow: false },
  frameguard: { action: "deny" },
  hsts: process.env.NODE_ENV === "production" ? {
    maxAge: 63072000,
    includeSubDomains: true,
    preload: true
  } : false,
  ieNoOpen: true,
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
      `worker-src 'self' blob:`,
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
app.use((req, res, next) => {
  res.status(404).render('404', { 
    rayId: req.rayId,
    cspNonce: res.locals.cspNonce 
  });
});
app.use((err, req, res, next) => {
  logger.error(err, req);
  
  // Determine status code
  const statusCode = err.statusCode || err.status || 500;
  
  // For API routes, return JSON
  if (req.path.startsWith('/api/')) {
    return res.status(statusCode).json({ 
      error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error',
      rayId: req.rayId 
    });
  }
  
  // For web routes, render error page
  res.status(statusCode);
  // Render specific error pages for common status codes
  if (statusCode === 404) {
    return res.render('404', { 
      rayId: req.rayId,
      cspNonce: res.locals.cspNonce 
    });
  } else if (statusCode === 500) {
    return res.render('500', { 
      rayId: req.rayId,
      cspNonce: res.locals.cspNonce 
    });
  } else {
    // Generic error page for other status codes
    return res.render('error', {
      statusCode: statusCode,
      title: getErrorTitle(statusCode),
      message: getErrorMessage(statusCode, err),
      rayId: req.rayId,
      cspNonce: res.locals.cspNonce
    });
  }
});

// Helper functions for error messages
function getErrorTitle(statusCode) {
  const titles = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    405: 'Method Not Allowed',
    408: 'Request Timeout',
    413: 'Payload Too Large',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
    504: 'Gateway Timeout'
  };
  return titles[statusCode] || 'Error';
}

function getErrorMessage(statusCode, err) {
  const messages = {
    400: 'The request could not be understood or was missing required parameters.',
    401: 'You need to be authenticated to access this resource.',
    403: 'You don\'t have permission to access this resource.',
    404: 'The page you\'re looking for doesn\'t exist.',
    405: 'The request method is not allowed for this resource.',
    408: 'The request took too long to process.',
    413: 'The file or request is too large.',
    429: 'You\'ve made too many requests. Please try again later.',
    500: 'Something went wrong on our end. We\'re working to fix it.',
    502: 'Bad gateway. Please try again later.',
    503: 'Service temporarily unavailable. Please try again later.',
    504: 'Gateway timeout. Please try again later.'
  };
  
  return process.env.NODE_ENV === 'development' && err.message 
    ? err.message 
    : (messages[statusCode] || 'An unexpected error occurred. Please try again later.');
}

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
const { cleanupExpiredFiles, cleanupOrphanedFiles } = require('./routes/cleanup');
(async () => {
  console.log("Running startup cleanup");
  await cleanupExpiredFiles();
  await cleanupOrphanedFiles();
})();
cron.schedule("0 */3 * * *", async () => {
  console.log("Running scheduled cleanup (every 3 hours)");
  await cleanupExpiredFiles();
  await cleanupOrphanedFiles();
});
