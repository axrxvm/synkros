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
  // Create session identifier from IP and User-Agent (hashed immediately, never stored)
  const sessionId = req.headers['cf-connecting-ip'] || req.ip || req.connection.remoteAddress;
  const userAgent = req.headers['user-agent'] || '';
  const sessionHash = crypto.createHash('sha256').update(sessionId + userAgent).digest('hex');
  
  if (verifiedCache.has(sessionHash)) {
    logger.info(`Verified session accessing: ${req.path}`, req);
    return next();
  }
  
  // Skip verification for certain routes
  const skipRoutes = ['/verify', '/api/verify', '/css/', '/js/', '/img/', '/favicon', "/api/system", "/api/status"];
  if (skipRoutes.some(route => req.path.startsWith(route))) {
    return next();
  }
  
  logger.info(`Unverified session redirected to verify page from: ${req.path}`, req);
  // Redirect to verify with the original URL as a parameter
  const redirectUrl = encodeURIComponent(req.originalUrl);
  return res.redirect(`/verify?redirect=${redirectUrl}`);
};

// GET /verify - Show verification page
router.get("/", (req, res) => {
  const siteKey = process.env.TURNSTILE_SITE_KEY;
  const redirect = req.query.redirect || '/';
  return res.render("verify", { siteKey, rayId: req.rayId, redirect });
});

// POST /api/verify - Verify Turnstile token
router.post("/api/verify", async (req, res) => {
  const { token } = req.body;
  
  if (!token) {
    logger.warn("Verification attempted without token", req);
    return res.status(400).json({ 
      error: "Missing token",
      rayId: req.rayId
    });
  }
  
  try {
    // Verify token with Cloudflare (remoteip omitted for privacy)
    
    const postData = querystring.stringify({
      secret: TURNSTILE_SECRET_KEY,
      response: token
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
      // Add user to verified sessions (using hashed session identifier, never storing actual IP)
      const sessionId = req.headers['cf-connecting-ip'] || req.ip || req.connection.remoteAddress;
      const userAgent = req.headers['user-agent'] || '';
      const sessionHash = crypto.createHash('sha256').update(sessionId + userAgent).digest('hex');
      
      verifiedCache.set(sessionHash, true);
      logger.info("User successfully verified via Turnstile", req);
      
      return res.json({ 
        success: true,
        rayId: req.rayId
      });
    } else {
      logger.warn("Turnstile verification failed", req);
      return res.status(400).json({ 
        error: "Verification failed", 
        details: result,
        rayId: req.rayId
      });
    }
  } catch (error) {
    logger.error('Turnstile verification error:', error, req);
    return res.status(500).json({ 
      error: "Internal server error",
      rayId: req.rayId
    });
  }
});

module.exports = { router, checkVerification };