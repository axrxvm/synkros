# Synkros AI Development Guide

## Project Overview
Synkros is a privacy-first, end-to-end encrypted file sharing application. Files are encrypted **client-side** before upload using AES-256-GCM, with encryption keys embedded in URL fragments (`#key`) that never reach the server. This creates a true zero-knowledge architecture where the server stores only encrypted data.

## Architecture Philosophy

### Zero-Knowledge E2EE Design
- **Client encrypts → Server stores blobs → Client decrypts**: The server is intentionally blind to file contents
- Encryption keys are generated client-side and passed via URL hash fragments (never sent to server)
- File metadata stored in `data/*.json`, encrypted files in `uploads/` directory
- No database—uses filesystem storage with JSON metadata for simplicity

### Web Worker Architecture
Encryption/decryption runs in dedicated Web Workers (`public/js/crypto-worker.js`) to prevent UI blocking. The main E2EE class (`public/js/e2ee.js`) coordinates operations with progress callbacks. Always use the worker pattern for CPU-intensive crypto operations.

### Ray ID Tracking Pattern
Every request gets a unique `rayId` (UUID v4) for debugging without user tracking:
```javascript
// server.js middleware sets it
req.rayId = rayId;
res.setHeader("ALabs-Ray-Id", rayId);

// All responses/logs include it
logger.error("Error message", req); // Automatically includes rayId
res.json({ error: "Message", rayId: req.rayId });
```
Always include `rayId` in JSON responses and pass `req` to logger functions.

### Verification Flow (Cloudflare Turnstile)
Bot protection via `routes/verify.js` with session caching:
- Unverified users redirected to `/verify` with client-side redirect to preserve URL hash
- Verified sessions cached in-memory (NodeCache, 4hr TTL) using hashed IP+User-Agent
- Middleware `checkVerification` guards all routes except whitelisted paths
- Never use server-side redirects for routes with hash fragments—use client-side JS redirect

## File Storage Pattern

### Metadata Structure
Files have split storage: encrypted data in `uploads/`, metadata in `data/<uuid>.json`:
```javascript
{
  "uuid": "generated-uuid",
  "filename": "timestamped-name.ext",
  "originalName": "user-visible-name.ext",
  "path": "uploads/...",
  "size": 12345,
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601",
  "uploadRayId": "debugging-reference"
}
```
Use `models/file.js` functions: `saveFileMetadata()`, `getFileMetadata()`, `updateFileMetadata()`, `deleteFileMetadata()`.

### Cleanup Mechanism
- **Automated**: `node-cron` runs every 3 hours (`"0 */3 * * *"`) in `server.js`
- **Startup**: Cleanup runs immediately on server start
- Files older than 24 hours deleted based on `createdAt` timestamp (`constants/file-constants.js`)
- Orphaned file cleanup removes uploads without metadata
- Manual trigger via `/cleanup` route (protected by `CLEANUP_CODE` env var)

## Security Hardening

### CSP with Dynamic Nonces
Custom middleware generates per-request nonces for inline scripts:
```javascript
const nonce = crypto.randomBytes(16).toString("base64");
res.locals.cspNonce = nonce;
// CSP: script-src 'self' 'nonce-${nonce}'
```
Always use `cspNonce` in EJS templates: `<script nonce="<%= cspNonce %>">`.

### CORS Configuration
Controlled by `ALLOWED_CLIENTS` env var (comma-separated origins). Development mode auto-adds localhost. Origin validation in `server.js` corsOptions.

### Rate Limiting
Global: 100 requests per 15 minutes per IP (`express-rate-limit`). Adjust limits for specific endpoints if needed.

### HTTPS Enforcement
Production mode forces HTTPS redirect (301) checking `req.secure` and `x-forwarded-proto` header. Always test with `NODE_ENV=production`.

## Development Workflows

### Environment Setup
1. Copy `.env.example` to `.env`
2. Required vars: `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `SMTP_*` for email
3. Run `npm install` then `npm run dev` (nodemon) or `npm start`
4. Check `combined.log` and `error.log` for Winston logs

### Email Service Pattern
Email via `services/emailService.js` (Nodemailer). Templates in `services/emailTemplate.js`. Always use `APP_BASE_URL` from env for generating links in emails.

### File Size Limits
Configured in `constants/file-constants.js`:
- `maxAllowedFileSize`: 500MB (in bytes)
- Multer enforces limit, returns 400 with friendly error
- Update both constant and error message if changing limit

## Key Conventions

### Error Handling
- API routes return JSON: `{ error: "message", rayId: req.rayId }`
- Web routes render EJS error pages: `404.ejs`, `500.ejs`, `error.ejs`
- Specific status codes have dedicated templates (see `server.js` error middleware)
- Development mode exposes error messages; production uses generic messages

### Logging Pattern
Winston logger (`services/logger.js`) with structured fields:
```javascript
logger.info("Message", req); // Auto-includes rayId, method, path
logger.error("Error message", req);
// Outputs: [rayId] Message { rayId, method, path, message, timestamp }
```

### Route Organization
- `/api/*`: JSON endpoints for file operations, status checks
- `/files/*`: File preview and download routes
- Web routes render EJS views directly
- Verification middleware applied globally except whitelisted paths

### Client-Side Crypto
E2EE implementation in `public/js/`:
- `e2ee.js`: Main E2EE class with worker coordination
- `crypto-worker.js`: Web Worker for heavy operations
- `e2ee-optimizer.js`: Performance optimizations for large files
- Always test with files >100MB to validate worker performance

## Common Pitfalls

1. **Never** generate encryption keys server-side—they must be client-generated and URL-embedded
2. **Always** use client-side redirects when URL hash contains encryption keys
3. **Don't** log or store raw IPs—session identifiers are hashed immediately
4. **Remember** to clean up uploaded files if metadata save fails (see `routes/files.js`)
5. **Check** file existence before operations—metadata and file can be out of sync
6. Test verification flow in production mode—development mode bypasses some checks

## Testing & Debugging
- Use Ray ID from response headers (`ALabs-Ray-Id`) to trace requests in logs
- Check `combined.log` for info-level events, `error.log` for errors
- Monitor `uploads/` and `data/` directories for cleanup effectiveness
- Verify CSP headers with browser DevTools (Console shows violations)
- Test E2EE with various file sizes: <1MB (fast path), 10-100MB (chunked), >100MB (worker stress test)
