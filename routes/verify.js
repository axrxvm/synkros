const NodeCache = require('node-cache');
const router = require("express").Router();
const crypto = require("crypto");
const https = require('https');
const querystring = require('querystring');
const logger = require('../services/logger');

// Cloudflare Turnstile verification endpoint
const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY;

// Cache to store verified sessions with a TTL of 4 hours
const verifiedCache = new NodeCache({ stdTTL: 4 * 60 * 60 });

// Middleware to check if user is verified
const checkVerification = (req, res, next) => {
  const sessionId = req.headers['cf-connecting-ip'] || req.ip || req.connection.remoteAddress;
  const userAgent = req.headers['user-agent'] || '';
  const sessionHash = crypto.createHash('sha256').update(sessionId + userAgent).digest('hex');
  
  if (verifiedCache.has(sessionHash)) {
    return next();
  }
  
  // Skip verification for certain routes
  const skipRoutes = ['/verify', '/api/verify', '/css/', '/js/', '/img/', '/favicon', "/api/system"];
  if (skipRoutes.some(route => req.path.startsWith(route))) {
    return next();
  }
  
  return res.redirect('/verify');
};

// GET /verify - Show verification page
router.get("/", (req, res) => {
  const siteKey = process.env.TURNSTILE_SITE_KEY;
  return res.render("verify", { siteKey, rayId: req.rayId });
});

// POST /api/verify - Verify Turnstile token
router.post("/api/verify", async (req, res) => {
  const { token } = req.body;
  
  if (!token) {
    return res.status(400).json({ error: "Missing token" });
  }
  
  try {
    // Verify token with Cloudflare
    
    const postData = querystring.stringify({
      secret: TURNSTILE_SECRET_KEY,
      response: token,
      remoteip: req.headers['cf-connecting-ip'] || req.ip || req.connection.remoteAddress
    });

    const response = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'challenges.cloudflare.com',
        port: 443,
        path: '/turnstile/v0/siteverify',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          resolve({ json: () => JSON.parse(data) });
        });
      });

      req.on('error', reject);
      req.write(postData);
      req.end();
    });
    
    const result = await response.json();
    
    if (result.success) {
      // Add user to verified sessions
      const sessionId = req.headers['cf-connecting-ip'] || req.ip || req.connection.remoteAddress;
      const userAgent = req.headers['user-agent'] || '';
      const sessionHash = crypto.createHash('sha256').update(sessionId + userAgent).digest('hex');
      
      verifiedCache.set(sessionHash, true);
      
      return res.json({ success: true });
    } else {
      return res.status(400).json({ error: "Verification failed", details: result });
    }
  } catch (error) {
    logger.error('Turnstile verification error:', error, req);
    return res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = { router, checkVerification };