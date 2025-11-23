# Synkros - Complete Technical Documentation

> **Developer-Level Documentation**: This document provides complete transparency and technical details on how Synkros works, covering both Server Mode (Upload) and P2P Mode (Direct).

---

## Table of Contents

1. [System Architecture Overview](#system-architecture-overview)
2. [Technology Stack](#technology-stack)
3. [Server Mode (Upload) - Technical Deep Dive](#server-mode-upload---technical-deep-dive)
4. [P2P Mode (Direct) - Technical Deep Dive](#p2p-mode-direct---technical-deep-dive)
5. [End-to-End Encryption Implementation](#end-to-end-encryption-implementation)
6. [Security Architecture](#security-architecture)
7. [File Storage and Cleanup Mechanisms](#file-storage-and-cleanup-mechanisms)
8. [API Endpoints Reference](#api-endpoints-reference)
9. [Data Flow Diagrams](#data-flow-diagrams)
10. [Environment Configuration](#environment-configuration)
11. [Request Lifecycle](#request-lifecycle)
12. [Dependencies Reference](#dependencies-reference)

---

## System Architecture Overview

Synkros is a **privacy-first**, **end-to-end encrypted** file sharing application built on Node.js/Express with a **zero-knowledge architecture**. The application operates in two distinct modes:

### Mode 1: Server-Based Upload
- Files encrypted client-side (AES-256-GCM) before upload
- Server stores encrypted blobs (max 500MB)
- Encryption keys embedded in URL fragment (never sent to server)
- Auto-deletion after 24 hours
- Uses filesystem storage (no database)

### Mode 2: Peer-to-Peer Direct Transfer
- Files transfer directly between peers via WebRTC
- No file size limit (unlimited)
- Files never touch the server
- Real-time encryption during transfer
- Room-based mesh topology (2-10 peers)

### Architecture Principles

1. **Zero-Knowledge**: Server cannot decrypt files or access plaintext data
2. **Client-Side Encryption**: All cryptographic operations in browser
3. **Web Worker Architecture**: Heavy operations offloaded to prevent UI blocking
4. **No Database**: Filesystem-based storage with JSON metadata
5. **Minimal Server Role**: Server is blind relay/storage, not a trusted party

---

## Technology Stack

### Backend

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Runtime** | Node.js v16+ | JavaScript runtime environment |
| **Framework** | Express.js 4.21.2 | Web application framework |
| **Templating** | EJS 3.1.10 | Server-side template rendering |
| **File Uploads** | Multer 2.0.2 | Multipart/form-data handling |
| **Email** | Nodemailer 7.0.9 | SMTP email delivery |
| **Scheduling** | node-cron 4.0.7 | Automated cleanup tasks |
| **Caching** | NodeCache 5.1.2 | In-memory P2P room management |
| **Logging** | Winston 3.18.3 | Structured logging with Discord webhooks |
| **Security** | Helmet.js 8.1.0 | HTTP security headers |
| **Rate Limiting** | express-rate-limit 7.2.0 | DDoS/abuse prevention |
| **CORS** | cors 2.8.5 | Cross-origin resource sharing |

### Frontend

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Crypto** | Web Crypto API | AES-256-GCM encryption/decryption |
| **Workers** | Web Workers API | Non-blocking crypto operations |
| **P2P** | WebRTC (RTCPeerConnection, RTCDataChannel) | Direct peer-to-peer file transfer |
| **QR Codes** | QRCode.js 1.5.3 | Shareable link QR generation |
| **UI** | Vanilla JavaScript | No framework bloat |

### Infrastructure

- **Filesystem Storage**: `uploads/` for encrypted files, `data/` for JSON metadata
- **STUN Servers**: Cloudflare STUN (primary) + Google STUN (fallback)
- **Bot Protection**: Cloudflare Turnstile (session-based verification)
- **Logging**: File-based (combined.log, error.log) + Discord webhooks

---

## Server Mode (Upload) - Technical Deep Dive

### Upload Flow Architecture

```
┌─────────────┐       ┌──────────────┐       ┌──────────────┐
│   Browser   │──────▶│ Client Crypto│──────▶│ File Upload  │
│ (File Input)│       │  (Web Worker)│       │ (Multer)     │
└─────────────┘       └──────────────┘       └──────────────┘
                             │                       │
                             │ AES-256-GCM           │
                             │ Encrypt               │
                             ▼                       ▼
                      ┌──────────────┐       ┌──────────────┐
                      │ Encryption   │       │  Server      │
                      │ Key (32 bytes)│       │ (Express)    │
                      └──────────────┘       └──────────────┘
                             │                       │
                             │ Embedded in           │ Saves metadata
                             │ URL fragment          │ & encrypted blob
                             ▼                       ▼
                      ┌──────────────┐       ┌──────────────┐
                      │ Share Link   │       │ data/*.json  │
                      │ #<key>       │       │ uploads/*    │
                      └──────────────┘       └──────────────┘
```

### Detailed Upload Process

#### Step 1: Client-Side Encryption

**File**: `public/js/e2ee.js`, `public/js/crypto-worker.js`

```javascript
// User selects file → encryptFile() triggered
1. Generate random 256-bit AES-GCM key: crypto.subtle.generateKey()
2. Generate random 12-byte IV: crypto.getRandomValues(new Uint8Array(12))
3. Read file as ArrayBuffer
4. For files > 10MB → offload to Web Worker
5. Encrypt: crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, fileBuffer)
6. Prepend IV to ciphertext: [IV (12 bytes) || Encrypted Data]
7. Create Blob from encrypted ArrayBuffer
8. Export key as hex string for URL embedding
```

**Chunk Processing for Large Files**:
- Files < 1MB: Single encryption operation
- Files 1MB - 10MB: Chunked with progress updates (simulated, AES-GCM doesn't support streaming)
- Files > 10MB: Web Worker with 16MB chunk size for memory efficiency

#### Step 2: Upload to Server

**Route**: `POST /api/files`  
**Handler**: `routes/files.js`

```javascript
1. Multer receives multipart/form-data
   - Validates file size ≤ 500MB (constants/file-constants.js)
   - Saves to uploads/ with timestamped filename
   
2. Generate UUID for file reference
   - Uses uuid v4 for collision-resistant identifiers
   
3. Create metadata object:
   {
     uuid: "generated-uuid",
     filename: "1732334567890-123456789.ext",
     originalName: "user-file.ext",
     path: "uploads/...",
     size: 12345,
     createdAt: "2024-11-23T02:48:26.969Z",
     updatedAt: "2024-11-23T02:48:26.969Z",
     uploadRayId: "request-tracking-id"
   }
   
4. Save metadata to data/<uuid>.json
   - Atomic write operation
   - If metadata save fails → delete uploaded file (cleanup)
   
5. Generate QR code for share link
   
6. Return response:
   {
     file: "https://domain.com/files/<uuid>#<encryptionKey>",
     qr: "data:image/png;base64,...",
     encryptionKey: "<hex-key>",
     rayId: "<request-id>"
   }
```

**Key Security Detail**: The encryption key is NOT sent in the POST request—it's generated client-side and only embedded in the response URL fragment (which browsers never send to servers).

#### Step 3: Download and Decryption

**Route**: `GET /files/<uuid>` → `routes/filePreview.js`  
**Download**: `GET /files/download/<uuid>` → `routes/download.js`

```javascript
// Preview Page (/files/<uuid>)
1. Server reads data/<uuid>.json
2. Validates file exists
3. Renders preview page with:
   - File metadata (name, size, upload time)
   - Download button
   - URL hash contains encryption key (client-side only)

// Download Flow
1. User clicks download → JavaScript intercepts
2. Extract key from URL fragment: window.location.hash
3. Fetch encrypted file: GET /files/download/<uuid>
4. Server streams file from uploads/<filename>
   - Sets Content-Disposition: attachment
   - Streams raw encrypted bytes
   
5. Client downloads and decrypts:
   - Import key from hex: importKeyFromHex(hash.substring(1))
   - Download with progress tracking
   - Extract IV (first 12 bytes)
   - Decrypt: crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
   - Create download link with decrypted Blob
   - Trigger browser download
```

**Web Worker Decryption** (for files > 1MB):
```javascript
// crypto-worker.js processes decryption
worker.postMessage({
  type: 'decrypt',
  encryptedData: arrayBuffer,
  keyHex: hexKey
});

// Worker returns decrypted data
worker.onmessage = (e) => {
  const { type, data, progress } = e.data;
  if (type === 'progress') updateUI(progress);
  if (type === 'success') triggerDownload(data);
};
```

### Email Sharing Feature

**Route**: `POST /api/files/sendmail`  
**Handler**: `routes/files.js`

```javascript
1. Validate uuid, sender, recipient emails
2. Fetch file metadata from data/<uuid>.json
3. Check if email already sent to recipient (prevent duplicates)
4. Update metadata.recipients array
5. Construct download link with encryption key:
   - Extract key from req.body.originalUrl
   - Build link: ${APP_BASE_URL}/files/${uuid}#${encryptionKey}
6. Send email via Nodemailer:
   - Uses services/emailTemplate.js for HTML formatting
   - SMTP configuration from .env
   - Includes download link, file size, expiry time
```

**Email Security**:
- Encryption key is included in the email link (user must trust email privacy)
- Alternative: Use P2P mode for zero-server-knowledge transfers

---

## P2P Mode (Direct) - Technical Deep Dive

### P2P Architecture Overview

P2P mode enables direct peer-to-peer file transfers via WebRTC, bypassing server storage entirely. The server acts solely as a **signaling relay** for connection establishment.

```
┌─────────────┐                    ┌─────────────┐
│   Peer A    │◀──── WebRTC ──────▶│   Peer B    │
│  (Sender)   │   DataChannel      │ (Receiver)  │
└─────────────┘                    └─────────────┘
       │                                   │
       │                                   │
       ▼                                   ▼
┌─────────────────────────────────────────────┐
│         Server (Signaling Only)             │
│  ┌─────────────────────────────────────┐   │
│  │ Room: ABCD1234                      │   │
│  │ - Peer A: offer/answer/ICE          │   │
│  │ - Peer B: offer/answer/ICE          │   │
│  │ TTL: 5 minutes                      │   │
│  └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

### WebRTC Signaling Flow

**REST-Based Polling Architecture** (No WebSockets):

**Signaling Endpoints** (`routes/p2p.js`):

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/direct/rooms` | POST | Create new P2P room |
| `/direct/rooms/:code` | GET | Validate room and check capacity |
| `/direct/rooms/:code/join` | POST | Join room and get peer ID |
| `/direct/rooms/:code/signal` | POST | Relay WebRTC signaling data |
| `/direct/rooms/:code/poll` | GET | Poll for new signals (1s interval) |
| `/direct/rooms/:code/leave` | POST | Leave room |

#### Step 1: Room Creation

**Client**: `public/js/p2p-manager.js` → `createRoom(password, maxPeers)`

```javascript
// POST /direct/rooms
{
  password: "optional-4-char-min",
  maxPeers: 2-10 // Default: 2
}

// Server Response
{
  success: true,
  roomCode: "ABCD1234", // 8-char hex (crypto.randomBytes(4))
  maxPeers: 2,
  rayId: "request-uuid"
}
```

**Server Processing** (`routes/p2p.js`):
```javascript
1. Validate password (≥4 chars if provided)
2. Validate maxPeers (2-10 range)
3. Generate room code: crypto.randomBytes(4).toString('hex').toUpperCase()
4. Hash password: crypto.createHash('sha256').update(password).digest('hex')
5. Create room object in NodeCache:
   {
     roomCode: "ABCD1234",
     passwordHash: "<sha256-hash>",
     maxPeers: 2,
     peers: [], // Array of peer IDs
     signals: {}, // Per-peer signaling queues
     createdAt: "ISO-8601",
     createdBy: "<rayId>"
   }
6. Set TTL: 5 minutes (auto-cleanup)
```

#### Step 2: Joining a Room

**Client**: `p2p-manager.js` → `joinRoom(roomCode, password)`

```javascript
// Step 1: Validate room
GET /direct/rooms/ABCD1234?password=secret

// Step 2: Join room
POST /direct/rooms/ABCD1234/join
{ password: "secret" }

// Response
{
  success: true,
  peerId: "1a2b3c4d5e6f7g8h", // 16-char hex
  roomCode: "ABCD1234",
  peers: ["existing-peer-id-1", "existing-peer-id-2"], // Other peers in room
  rayId: "request-uuid"
}
```

**Server Processing**:
```javascript
1. Retrieve room from cache
2. Validate password hash matches
3. Check room capacity (peers.length < maxPeers)
4. Generate unique peer ID: crypto.randomBytes(8).toString('hex')
5. Add peer to room.peers array
6. Initialize signal queue: signals[peerId] = { offers: [], answers: [], ice: [] }
7. Return peer ID and list of existing peers
```

#### Step 3: WebRTC Connection Establishment

**Client Side** (`p2p-manager.js`):

```javascript
// 1. Create RTCPeerConnection for each peer in room
for (const remotePeerId of peers) {
  const pc = new RTCPeerConnection({
    iceServers: [
      { urls: 'stun:stun.cloudflare.com:3478' },
      { urls: 'stun:stun.l.google.com:19302' }
    ]
  });
  
  // 2. Create DataChannel for file transfer
  const dc = pc.createDataChannel('file-transfer', {
    ordered: true,
    maxRetransmits: 3
  });
  
  // 3. ICE Candidate handling
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      // Send ICE candidate to server
      POST /direct/rooms/${roomCode}/signal
      {
        peerId: myPeerId,
        targetPeerId: remotePeerId,
        type: 'ice',
        data: event.candidate
      }
    }
  };
  
  // 4. Create and send offer
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  
  POST /direct/rooms/${roomCode}/signal
  {
    peerId: myPeerId,
    targetPeerId: remotePeerId,
    type: 'offer',
    data: pc.localDescription
  }
}

// 5. Poll for incoming signals (1-second interval)
setInterval(async () => {
  const response = await fetch(`/direct/rooms/${roomCode}/poll?peerId=${myPeerId}`);
  const { signals } = await response.json();
  
  // Process offers
  for (const signal of signals.offers) {
    const pc = getPeerConnection(signal.from);
    await pc.setRemoteDescription(signal.data);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    
    // Send answer back
    POST /direct/rooms/${roomCode}/signal
    {
      peerId: myPeerId,
      targetPeerId: signal.from,
      type: 'answer',
      data: pc.localDescription
    }
  }
  
  // Process answers and ICE candidates similarly...
}, 1000);
```

**Mesh Topology**: Each peer establishes a direct connection to every other peer in the room. For N peers, there are N(N-1)/2 total connections.

#### Step 4: Signaling Relay (Server)

**POST /direct/rooms/:code/signal**:
```javascript
1. Validate peerId is in room
2. Validate targetPeerId exists
3. Encrypt signaling data with room password (defense-in-depth):
   - If room has password → AES-256-GCM encryption
   - If no password → plaintext fallback
   
4. Store signal in target peer's queue:
   signals[targetPeerId].offers.push({
     from: peerId,
     data: encryptedSignalData,
     timestamp: Date.now()
   })
   
5. Return success
```

**GET /direct/rooms/:code/poll**:
```javascript
1. Validate peerId is in room
2. Retrieve all signals for peerId
3. Decrypt signals using room password
4. Return signals to client
5. Clear retrieved signals (consume once)
```

**Defense-in-Depth Signaling Encryption**:
```javascript
// Encrypt SDP/ICE metadata (optional, only if room has password)
function encryptSignalData(data, passwordHash) {
  if (!passwordHash) return { encrypted: false, data };
  
  const iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(passwordHash, 'synkros-p2p-signal', 100000, 32, 'sha256');
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(data), 'utf8'),
    cipher.final()
  ]);
  
  return {
    encrypted: true,
    data: {
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
      ciphertext: encrypted.toString('base64')
    }
  };
}
```

### P2P File Transfer Flow

#### Step 1: File Encryption for P2P

**Client**: `public/js/p2p-crypto.js` → `encryptFileForP2P(file, key, progressCallback)`

**Hybrid Worker Approach**:
- **Small files (<10MB)**: Main thread encryption
- **Large files (≥10MB)**: Web Worker pre-encryption

```javascript
// Main thread (small files)
async encryptInMainThread(file, key, progressCallback) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const fileBuffer = await file.arrayBuffer();
  
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    fileBuffer
  );
  
  // Combine IV + ciphertext
  const combined = new Uint8Array(12 + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), 12);
  
  return combined;
}

// Web Worker (large files)
async encryptWithWorker(file, key, progressCallback, keyHex) {
  return new Promise((resolve, reject) => {
    const worker = new Worker('/js/crypto-worker.js');
    
    worker.postMessage({
      type: 'encrypt',
      fileBuffer: await file.arrayBuffer(),
      keyHex: keyHex
    });
    
    worker.onmessage = (e) => {
      if (e.data.type === 'progress') progressCallback(e.data.progress);
      if (e.data.type === 'success') resolve(e.data.data);
      if (e.data.type === 'error') reject(new Error(e.data.error));
    };
  });
}
```

#### Step 2: Broadcasting File via DataChannel

**Client**: `p2p-manager.js` → `broadcastFile(fileData, metadata)`

```javascript
// Metadata packet sent first (JSON)
const metadata = {
  type: 'file-metadata',
  name: file.name,
  size: encryptedFile.byteLength,
  mimeType: file.type,
  encryptionKey: keyHex, // Shared via encrypted WebRTC channel
  timestamp: Date.now()
};

// Send metadata to all connected peers
for (const [peerId, dataChannel] of dataChannels) {
  if (dataChannel.readyState === 'open') {
    dataChannel.send(JSON.stringify(metadata));
  }
}

// Send file in chunks (16KB per chunk for optimal throughput)
const CHUNK_SIZE = 16 * 1024;
const totalChunks = Math.ceil(encryptedFile.byteLength / CHUNK_SIZE);

for (let i = 0; i < totalChunks; i++) {
  const start = i * CHUNK_SIZE;
  const end = Math.min(start + CHUNK_SIZE, encryptedFile.byteLength);
  const chunk = encryptedFile.slice(start, end);
  
  // Send to all peers
  for (const [peerId, dc] of dataChannels) {
    if (dc.readyState === 'open') {
      dc.send(chunk);
    }
  }
  
  // Progress update
  const progress = ((i + 1) / totalChunks) * 100;
  onTransferProgress?.(progress);
  
  // Backpressure handling
  if (dc.bufferedAmount > CHUNK_SIZE * 10) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

// Send completion marker
const endMarker = JSON.stringify({ type: 'file-end' });
for (const [peerId, dc] of dataChannels) {
  if (dc.readyState === 'open') {
    dc.send(endMarker);
  }
}
```

#### Step 3: Receiving and Decrypting File

**Client**: `p2p-manager.js` → DataChannel message handler

```javascript
dataChannel.onmessage = async (event) => {
  const data = event.data;
  
  // Parse JSON messages (metadata, end marker)
  if (typeof data === 'string') {
    const message = JSON.parse(data);
    
    if (message.type === 'file-metadata') {
      // Start receiving file
      incomingFiles.set(peerId, {
        metadata: message,
        chunks: [],
        receivedBytes: 0
      });
    }
    
    if (message.type === 'file-end') {
      // Reconstruct file
      const fileData = incomingFiles.get(peerId);
      const encryptedFile = new Uint8Array(
        fileData.chunks.reduce((acc, chunk) => acc + chunk.byteLength, 0)
      );
      
      let offset = 0;
      for (const chunk of fileData.chunks) {
        encryptedFile.set(new Uint8Array(chunk), offset);
        offset += chunk.byteLength;
      }
      
      // Decrypt file
      const key = await importKeyFromHex(fileData.metadata.encryptionKey);
      const iv = encryptedFile.slice(0, 12);
      const ciphertext = encryptedFile.slice(12);
      
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        ciphertext
      );
      
      // Trigger download
      const blob = new Blob([decrypted], { type: fileData.metadata.mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileData.metadata.name;
      a.click();
      
      incomingFiles.delete(peerId);
    }
  } else {
    // Binary chunk
    const fileData = incomingFiles.get(peerId);
    if (fileData) {
      fileData.chunks.push(data);
      fileData.receivedBytes += data.byteLength;
      
      const progress = (fileData.receivedBytes / fileData.metadata.size) * 100;
      onTransferProgress?.(progress);
    }
  }
};
```

### P2P Security Model

1. **WebRTC DTLS Encryption**: All DataChannel traffic encrypted by default (DTLS 1.2)
2. **Application-Level E2EE**: Files encrypted with AES-256-GCM before P2P transfer
3. **Key Exchange via WebRTC**: Encryption keys transmitted over encrypted DataChannels
4. **Password-Protected Rooms**: SHA-256 hashed passwords for room access control
5. **Signaling Metadata Encryption**: Defense-in-depth encryption of SDP/ICE (optional)
6. **Zero Server Knowledge**: Server never sees file contents, names, sizes, or encryption keys

**Security Layering**:
```
File Data → AES-256-GCM Encryption → DTLS Encryption → Network
```

**Server Visibility**:
- ✅ Room codes, peer IDs, connection timestamps
- ✅ ICE candidates (IP addresses for NAT traversal)
- ✅ SDP offers/answers (connection metadata)
- ❌ File contents, names, sizes
- ❌ Encryption keys
- ❌ Plaintext file metadata

---

## End-to-End Encryption Implementation

### AES-256-GCM Algorithm

Synkros uses **AES-256-GCM** (Galois/Counter Mode) for authenticated encryption:


**Properties**:
- **Confidentiality**: AES-256 encryption
- **Integrity**: GCM authentication tag prevents tampering
- **Performance**: Hardware-accelerated on modern CPUs
- **Security**: NIST-approved, industry standard

### Web Crypto API Implementation

**Key Generation** (`e2ee.js`, `p2p-crypto.js`):
```javascript
const key = await crypto.subtle.generateKey(
  {
    name: 'AES-GCM',
    length: 256, // 256-bit key
  },
  true, // extractable (needed for hex export)
  ['encrypt', 'decrypt']
);
```

**Key Export/Import**:
```javascript
// Export to hex string for URL fragment
async exportKeyToHex(key) {
  const exported = await crypto.subtle.exportKey('raw', key);
  return Array.from(new Uint8Array(exported))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  // Result: 64-character hex string (32 bytes)
}

// Import from hex string
async importKeyFromHex(hexKey) {
  const keyData = new Uint8Array(
    hexKey.match(/.{2}/g).map(byte => parseInt(byte, 16))
  );
  return await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'AES-GCM' },
    true,
    ['encrypt', 'decrypt']
  );
}
```

**Encryption**:
```javascript
// 1. Generate random IV (12 bytes for GCM)
const iv = crypto.getRandomValues(new Uint8Array(12));

// 2. Encrypt file
const encrypted = await crypto.subtle.encrypt(
  {
    name: 'AES-GCM',
    iv: iv,
    tagLength: 128 // 128-bit authentication tag
  },
  key,
  fileBuffer
);

// 3. Prepend IV to ciphertext
// Format: [IV (12 bytes) || Ciphertext || Auth Tag (16 bytes)]
const combined = new Uint8Array(12 + encrypted.byteLength);
combined.set(iv, 0);
combined.set(new Uint8Array(encrypted), 12);
```

**Decryption**:
```javascript
// 1. Extract IV and ciphertext
const iv = encryptedData.slice(0, 12);
const ciphertext = encryptedData.slice(12);

// 2. Decrypt and verify
const decrypted = await crypto.subtle.decrypt(
  {
    name: 'AES-GCM',
    iv: iv
  },
  key,
  ciphertext
);
// Throws exception if authentication fails (tampered data)
```

### Web Worker Architecture

**Why Web Workers?**
- Prevent UI freezing during large file encryption/decryption
- Offload CPU-intensive crypto operations to separate thread
- Enable progress tracking without blocking main thread

**Worker Communication Pattern** (`e2ee.js` ↔ `crypto-worker.js`):

```javascript
// Main Thread
class E2EECrypto {
  constructor() {
    this.worker = new Worker('/js/crypto-worker.js');
    this.operations = new Map(); // Track pending operations
    
    this.worker.onmessage = (e) => {
      const { id, type, progress, data, error } = e.data;
      const operation = this.operations.get(id);
      
      switch (type) {
        case 'progress':
          operation.onProgress?.(progress);
          break;
        case 'success':
          operation.resolve(data);
          this.operations.delete(id);
          break;
        case 'error':
          operation.reject(new Error(error));
          this.operations.delete(id);
          break;
      }
    };
  }
  
  async encryptFile(file, key, onProgress) {
    const id = ++this.operationId;
    
    return new Promise((resolve, reject) => {
      this.operations.set(id, { resolve, reject, onProgress });
      
      this.worker.postMessage({
        id,
        type: 'encrypt',
        fileBuffer: await file.arrayBuffer(),
        keyHex: await this.exportKeyToHex(key)
      }, [fileBuffer]); // Transfer ownership for performance
    });
  }
}

// Worker Thread (crypto-worker.js)
self.onmessage = async (e) => {
  const { id, type, fileBuffer, keyHex } = e.data;
  
  try {
    if (type === 'encrypt') {
      const key = await importKeyFromHex(keyHex);
      
      // Progress updates during encryption
      self.postMessage({ id, type: 'progress', progress: 10 });
      
      const encrypted = await encryptFileChunked(fileBuffer, key, (progress) => {
        self.postMessage({ id, type: 'progress', progress });
      });
      
      // Transfer ownership back to main thread
      self.postMessage({
        id,
        type: 'success',
        data: encrypted
      }, [encrypted.buffer]);
    }
  } catch (error) {
    self.postMessage({ id, type: 'error', error: error.message });
  }
};
```

**Performance Optimization** (`e2ee-optimizer.js`):
- **Small files (<1MB)**: Main thread, single operation
- **Medium files (1-10MB)**: Main thread with simulated progress updates
- **Large files (>10MB)**: Web Worker with 16MB chunk processing
- **Transferable Objects**: Use `ArrayBuffer` transfer instead of copying

### Zero-Knowledge Architecture

**Server Cannot Access**:
1. ❌ Encryption keys (stored in URL fragment, never sent to server)
2. ❌ Plaintext file contents (files encrypted before upload)
3. ❌ Original filenames in encrypted files (metadata separate)
4. ❌ P2P file transfers (direct peer-to-peer, never touch server)

**Server Can Access**:
1. ✅ Encrypted file blobs (meaningless without keys)
2. ✅ File metadata (UUID, upload timestamp, size)
3. ✅ User IP addresses (hashed immediately for session tracking)
4. ✅ P2P room codes and peer IDs (temporary, no file data)

**URL Fragment Security**:
```
https://synkross.alwaysdata.net/files/abc123#64-char-hex-key
                                              └─────────────┘
                                              Never sent to server
                                              (RFC 3986 - browser only)
```

Browsers never include URL fragments in HTTP requests. The server receives:
```
GET /files/abc123 HTTP/1.1
```

The encryption key `#64-char-hex-key` remains client-side only.

---

## Security Architecture

### Security Layers

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Network** | HTTPS | Encrypted transport (TLS 1.2+) |
| **Application** | Helmet.js | HTTP security headers |
| **Content** | CSP with nonces | XSS prevention |
| **Authentication** | Turnstile | Bot protection |
| **Authorization'' | CORS | Origin validation |
| **Rate Limiting** | express-rate-limit | DDoS/abuse prevention |
| **Data** | AES-256-GCM | End-to-end encryption |
| **Privacy** | Ray ID tracking | No user tracking |

### HTTP Security Headers (Helmet.js)

**Configured Headers** (`server.js`):
```javascript
app.use(helmet({
  contentSecurityPolicy: false, // Custom CSP with nonces
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
  ieNoOpen: true,
  noSniff: true,
  referrerPolicy: { policy: "no-referrer" },
  xssFilter: true,
  hidePoweredBy: true,
}));
```

### Content Security Policy (CSP)

**Dynamic Nonce Generation** (per-request):
```javascript
app.use((req, res, next) => {
  const nonce = crypto.randomBytes(16).toString("base64");
  res.locals.cspNonce = nonce;
  
  const directives = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' https://challenges.cloudflare.com https://cdn.jsdelivr.net`,
    `script-src-elem 'self' 'nonce-${nonce}' https://challenges.cloudflare.com`,
    `style-src 'self' 'unsafe-inline'`, // Required for dynamic styles
    `img-src 'self' data:`, // Data URIs for QR codes
    `connect-src 'self' https://challenges.cloudflare.com stun:`, // STUN for WebRTC
    `font-src 'self' data:`,
    `worker-src 'self' blob:`, // Web Workers
    `object-src 'none'`,
    `frame-src https://challenges.cloudflare.com`, // Turnstile iframe
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`
  ].join("; ");
  
  res.setHeader("Content-Security-Policy", directives);
  next();
});
```

**EJS Template Usage**:
```html
<script nonce="<%= cspNonce %>">
  // Inline JavaScript allowed with matching nonce
</script>
```

### CORS Configuration

**Origin Validation** (`server.js`):
```javascript
const allowedOrigins = process.env.ALLOWED_CLIENTS
  ? process.env.ALLOWED_CLIENTS.split(",").map(o => o.trim())
  : [];

// Auto-add localhost in development
if (process.env.NODE_ENV === 'development') {
  allowedOrigins.push('http://localhost:3000', 'http://127.0.0.1:3000');
}

const corsOptions = {
  origin: function (origin, callback) {
    // Allow same-origin requests (origin === undefined)
    if (!origin) {
      return callback(null, true);
    }
    
    // Validate against whitelist
    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};
```

### Rate Limiting

**Global Rate Limit**:
```javascript
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window per IP
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);
```

**IP Identification**:
- Cloudflare: `cf-connecting-ip` header
- Proxy: `x-forwarded-for` header
- Direct: `req.ip`

### Cloudflare Turnstile Verification

**Verification Flow** (`routes/verify.js`):

```javascript
// 1. User visits protected route → redirected to /verify
GET /verify?redirect=/files/abc123

// 2. User completes Turnstile challenge → token generated
// 3. Client submits token
POST /api/verify
{ token: "cloudflare-turnstile-token" }

// 4. Server verifies with Cloudflare
const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
  method: 'POST',
  body: {
    secret: TURNSTILE_SECRET_KEY,
    response: token
    // remoteip omitted for privacy
  }
});

// 5. Cache verification session (4-hour TTL)
const sessionHash = crypto.createHash('sha256')
  .update(ip + userAgent)
  .digest('hex');
verifiedCache.set(sessionHash, true, 4 * 60 * 60);

// 6. Redirect back to original URL (preserving hash fragment)
```

**Session Caching**:
- Uses NodeCache with 4-hour TTL
- Session identifier: SHA-256(IP + User-Agent)
- IP addresses never logged or stored in plaintext
- Prevents replay attacks (token single-use)

**Protected Routes**:
- ✅ `/files/*`, `/api/files/*`, `/direct/*` (except signaling API)
- ❌ `/verify`, `/api/verify`, `/css/*`, `/js/*`, `/img/*`, `/favicon*`

### Ray ID Tracking Pattern

**Purpose**: Debug requests without tracking users

```javascript
// Middleware generates unique ID per request
app.use((req, res, next) => {
  const rayId = uuidv4();
  req.rayId = rayId;
  res.setHeader("ALabs-Ray-Id", rayId);
  next();
});

// All responses include Ray ID
res.json({ error: "Message", rayId: req.rayId });

// All logs include Ray ID
logger.error("Error message", req); // Automatically includes rayId
```

**Ray ID Properties**:
- ✅ Unique per request (UUID v4)
- ✅ Short-lived (request lifetime only)
- ✅ Not tied to user identity
- ✅ Useful for debugging specific requests
- ❌ Cannot track users across requests
- ❌ Cannot correlate user behavior

---

## File Storage and Cleanup Mechanisms

### Storage Architecture

**Filesystem-Based (No Database)**:

```
synkros/
├── uploads/              # Encrypted file blobs
│   ├── .gitkeep
│   └── 1732334567890-123456789.pdf
├── data/                 # JSON metadata files
│   ├── uuid-1.json
│   └── uuid-2.json
└── logs/
    ├── combined.log
    └── error.log
```

**File Metadata Structure** (`data/<uuid>.json`):
```json
{
  "uuid": "550e8400-e29b-41d4-a716-446655440000",
  "filename": "1732334567890-123456789.pdf",
  "originalName": "document.pdf",
  "path": "uploads/1732334567890-123456789.pdf",
  "size": 1048576,
  "createdAt": "2024-11-23T02:48:26.969Z",
  "updatedAt": "2024-11-23T02:48:26.969Z",
  "uploadRayId": "debug-ray-id-here",
  "sender": "user@example.com",
  "recipients": ["recipient1@example.com", "recipient2@example.com"]
}
```

**Model API** (`models/file.js`):
```javascript
// Save new file metadata
await saveFileMetadata({
  uuid: uuid4(),
  filename: timestampedName,
  originalName: userFilename,
  path: 'uploads/...',
  size: fileSize
});

// Retrieve metadata
const metadata = await getFileMetadata(uuid);

// Update metadata (e.g., add email recipients)
await updateFileMetadata(uuid, {
  sender: 'user@example.com',
  recipients: ['recipient@example.com']
});

// Delete metadata
await deleteFileMetadata(uuid);

// Get all files
const allFiles = await getAllFileMetadata();
```

### Automated Cleanup System

**Cleanup Triggers**:
1. **Startup**: Immediate cleanup on server start
2. **Scheduled**: Every 3 hours via node-cron
3. **Manual**: `/cleanup` endpoint (requires `CLEANUP_CODE`)

**Cron Configuration** (`server.js`):
```javascript
// Run cleanup every 3 hours at minute 0
cron.schedule("0 */3 * * *", async () => {
  console.log("Running scheduled cleanup (every 3 hours)");
  await cleanupExpiredFiles();
  await cleanupOrphanedFiles();
});

// Startup cleanup
(async () => {
  console.log("Running startup cleanup");
  await cleanupExpiredFiles();
  await cleanupOrphanedFiles();
})();
```

#### Expired Files Cleanup

**Logic** (`routes/cleanup.js` → `cleanupExpiredFiles()`):
```javascript
1. Get all file metadata from data/ directory
2. Calculate cutoff timestamp:
   olderThan = Date.now() - cleanupTimeLimit (24 hours)
   
3. Filter expired files:
   oldFiles = allFiles.filter(f => new Date(f.createdAt) < olderThan)
   
4. For each expired file:
   a. Delete physical file: fs.unlinkSync(file.path)
   b. Delete metadata: deleteFileMetadata(file.uuid)
   c. Log deletion
   
5. Return summary:
   {
     totalFiles: oldFiles.length,
     physicalFilesDeleted: count,
     metadataFilesDeleted: count
   }
```

**Time Limit** (`constants/file-constants.js`):
```javascript
const cleanupTimeLimit = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
```

#### Orphaned Files Cleanup

**Logic** (`routes/cleanup.js` → `cleanupOrphanedFiles()`):
```javascript
1. Get all files in uploads/ directory (excluding .gitkeep)
2. Get all metadata files from data/ directory
3. Create Set of referenced filenames from metadata
4. Find orphaned files:
   orphaned = uploadedFiles.filter(file => !referencedFiles.has(file))
   
5. Delete orphaned files:
   for (file of orphaned) {
     fs.unlinkSync('uploads/' + file)
   }
   
6. Return summary:
   {
     orphanedFilesCount: orphaned.length,
     deletedOrphanedFiles: count
   }
```

**Orphaned File Causes**:
- Metadata save failure after file upload
- Manual deletion of metadata files
- Server crash during upload
- File system corruption

### P2P Room Cleanup

**In-Memory Cache** (`routes/p2p.js`):
```javascript
const roomCache = new NodeCache({ 
  stdTTL: 5 * 60, // 5-minute TTL
  checkperiod: 60  // Check every 60 seconds
});
```

**Automatic Cleanup**:
- Rooms expire after 5 minutes of inactivity
- Rooms deleted when last peer leaves
- No persistent storage (RAM only)

---

## API Endpoints Reference

### Server Mode Endpoints

#### File Upload

**`POST /api/files`**

Upload encrypted file to server.

**Request**:
- Content-Type: `multipart/form-data`
- Body:
  - `myFile`: File (binary, max 500MB)
  - `originalName`: Original filename (string)

**Response** (200 OK):
```json
{
  "file": "https://domain.com/files/uuid#encryptionKey",
  "qr": "data:image/png;base64,...",
  "encryptionKey": "64-char-hex-string",
  "rayId": "request-uuid"
}
```

**Errors**:
- 400: File too large (> 500MB)
- 400: No file uploaded
- 500: Upload failed / Metadata save failed

#### File Preview

**`GET /files/:uuid`**

Render file preview page.

**Response**: HTML page with:
- File metadata (name, size, upload time)
- Download button
- QR code
- Encryption key in URL fragment (client-side)

**Errors**:
- 404: File not found

#### File Download

**`GET /files/download/:uuid`**

Download encrypted file blob.

**Response**: Binary stream
- Content-Type: `application/octet-stream`
- Content-Disposition: `attachment; filename="encrypted-file"`
- Body: Raw encrypted bytes (IV + ciphertext)

**Errors**:
- 404: File not found
- 500: Read error

#### Send Email

**`POST /api/files/sendmail`**

Email file link to recipient.

**Request**:
```json
{
  "uuid": "file-uuid",
  "sender": "sender@example.com",
  "recipient": "recipient@example.com",
  "originalUrl": "https://domain.com/files/uuid#key"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "rayId": "request-uuid"
}
```

**Errors**:
- 400: Missing required fields
- 404: File not found
- 422: Email already sent to recipient
- 500: Email sending failed

### P2P Mode Endpoints

#### Create Room

**`POST /direct/rooms`**

Create new P2P room.

**Request**:
```json
{
  "password": "optional-password",
  "maxPeers": 2
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "roomCode": "ABCD1234",
  "maxPeers": 2,
  "rayId": "request-uuid"
}
```

**Errors**:
- 400: Invalid password (< 4 chars)
- 400: Invalid maxPeers (not 2-10)

#### Validate Room

**`GET /direct/rooms/:code?password=xxx`**

Check if room exists and has capacity.

**Response** (200 OK):
```json
{
  "success": true,
  "roomCode": "ABCD1234",
  "maxPeers": 2,
  "currentPeers": 1,
  "isFull": false,
  "rayId": "request-uuid"
}
```

**Errors**:
- 404: Room not found or expired
- 403: Invalid password

#### Join Room

**`POST /direct/rooms/:code/join`**

Join room and receive peer ID.

**Request**:
```json
{
  "password": "optional-password"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "peerId": "1a2b3c4d5e6f7g8h",
  "roomCode": "ABCD1234",
  "peers": ["existing-peer-id-1"],
  "rayId": "request-uuid"
}
```

**Errors**:
- 404: Room not found
- 403: Invalid password
- 403: Room is full

#### Send Signal

**`POST /direct/rooms/:code/signal`**

Relay WebRTC signaling data.

**Request**:
```json
{
  "peerId": "my-peer-id",
  "targetPeerId": "target-peer-id",
  "type": "offer|answer|ice",
  "data": { /* SDP or ICE candidate */ }
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "rayId": "request-uuid"
}
```

**Errors**:
- 404: Room not found
- 403: Peer not in room
- 404: Target peer not found

#### Poll Signals

**`GET /direct/rooms/:code/poll?peerId=xxx`**

Poll for new signaling messages.

**Response** (200 OK):
```json
{
  "success": true,
  "signals": {
    "offers": [
      { "from": "peer-id", "data": {...}, "timestamp": 1234567890 }
    ],
    "answers": [],
    "ice": []
  },
  "peers": ["peer-id-1", "peer-id-2"],
  "rayId": "request-uuid"
}
```

**Errors**:
- 404: Room not found
- 403: Peer not in room

#### Leave Room

**`POST /direct/rooms/:code/leave`**

Leave room and clean up peer data.

**Request**:
```json
{
  "peerId": "my-peer-id"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "rayId": "request-uuid"
}
```

### Utility Endpoints

#### System Status

**`GET /api/system`**

Get system uptime and health.

**Response** (200 OK):
```json
{
  "status": "ok",
  "uptime": 3600,
  "rayId": "request-uuid"
}
```

#### File Status

**`GET /api/status/:uuid`**

Check if file exists.

**Response** (200 OK):
```json
{
  "exists": true,
  "rayId": "request-uuid"
}
```

#### QR Code Generation

**`POST /api/qr`**

Generate QR code for URL.

**Request**:
```json
{
  "url": "https://example.com"
}
```

**Response** (200 OK):
```json
{
  "qr": "data:image/png;base64,...",
  "rayId": "request-uuid"
}
```

#### Verification

**`GET /verify?redirect=/original/path`**

Render Turnstile verification page.

**`POST /api/verify`**

Verify Turnstile token.

**Request**:
```json
{
  "token": "cloudflare-turnstile-token"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "rayId": "request-uuid"
}
```

**Errors**:
- 400: Missing token
- 400: Verification failed
- 500: Cloudflare API error

#### Manual Cleanup

**`GET /cleanup`**

Trigger manual cleanup (requires `CLEANUP_CODE` env var).

**Response**: HTML page with cleanup summary

---

## Data Flow Diagrams

### Server Mode Upload Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                        CLIENT BROWSER                             │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  1. User selects file                                            │
│     └─▶ File object in memory                                    │
│                                                                   │
│  2. Generate encryption key                                      │
│     └─▶ crypto.subtle.generateKey(AES-256-GCM)                   │
│     └─▶ 256-bit random key                                       │
│                                                                   │
│  3. Encrypt file (Web Worker if large)                           │
│     └─▶ Generate random 12-byte IV                               │
│     └─▶ crypto.subtle.encrypt(fileBuffer, key, iv)               │
│     └─▶ Result: [IV || Ciphertext || Auth Tag]                   │
│                                                                   │
│  4. Upload encrypted file                                        │
│     └─▶ POST /api/files (multipart/form-data)                    │
│     └─▶ Key NOT included in request                              │
│                                                                   │
└───────────────────────┬──────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────────────┐
│                         SERVER                                    │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  5. Multer receives encrypted file                               │
│     └─▶ Validate size ≤ 500MB                                    │
│     └─▶ Save to uploads/<timestamp>.ext                          │
│                                                                   │
│  6. Generate UUID                                                │
│     └─▶ uuid.v4() → collision-resistant ID                       │
│                                                                   │
│  7. Save metadata                                                │
│     └─▶ Create data/<uuid>.json                                  │
│     └─▶ {uuid, filename, path, size, createdAt, ...}             │
│                                                                   │
│  8. Generate QR code                                             │
│     └─▶ qrcode.toDataURL(shareLink)                              │
│                                                                   │
│  9. Return response                                              │
│     └─▶ {file: "url#key", qr: "...", encryptionKey: "..."}       │
│                                                                   │
└───────────────────────┬──────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────────────┐
│                    CLIENT BROWSER                                 │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  10. Receive response                                            │
│      └─▶ Extract share URL with #key fragment                    │
│      └─▶ Display QR code                                         │
│      └─▶ Show share link                                         │
│      └─▶ Enable email sharing                                    │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### Server Mode Download Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                   RECIPIENT BROWSER                               │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  1. Open share link                                              │
│     └─▶ GET /files/uuid#encryptionKey                            │
│     └─▶ Fragment (#key) NOT sent to server                       │
│                                                                   │
│  2. Server renders preview page                                  │
│     └─▶ Metadata (name, size, time) from data/<uuid>.json        │
│     └─▶ JavaScript extracts key from window.location.hash        │
│                                                                   │
│  3. User clicks download                                         │
│     └─▶ JavaScript intercepts click                              │
│     └─▶ Extract key: hash.substring(1)                           │
│                                                                   │
│  4. Download encrypted file                                      │
│     └─▶ fetch('/files/download/' + uuid)                         │
│     └─▶ Server streams uploads/<filename>                        │
│     └─▶ Track download progress                                  │
│                                                                   │
│  5. Decrypt file (Web Worker if large)                           │
│     └─▶ Import key: importKeyFromHex(keyHex)                     │
│     └─▶ Extract IV: encryptedData.slice(0, 12)                   │
│     └─▶ Decrypt: crypto.subtle.decrypt(ciphertext, key, iv)      │
│     └─▶ Verify auth tag (throws if tampered)                     │
│                                                                   │
│  6. Trigger browser download                                     │
│     └─▶ Create Blob from decrypted ArrayBuffer                   │
│     └─▶ Create object URL                                        │
│     └─▶ Simulate click on <a download>                           │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### P2P Transfer Flow

```
┌─────────────────┐              ┌─────────────────┐              ┌─────────────────┐
│    Sender       │              │     Server      │              │    Receiver     │
│   (Peer A)      │              │   (Signaling)   │              │   (Peer B)      │
└────────┬────────┘              └────────┬────────┘              └────────┬────────┘
         │                                 │                                 │
         │  POST /direct/rooms             │                                 │
         │  {password, maxPeers}           │                                 │
         ├────────────────────────────────▶│                                 │
         │                                 │                                 │
         │  200 {roomCode: "ABCD1234"}     │                                 │
         │◀────────────────────────────────┤                                 │
         │                                 │                                 │
         │  POST /direct/rooms/ABCD/join   │                                 │
         ├────────────────────────────────▶│                                 │
         │                                 │                                 │
         │  200 {peerId: "peer-a", peers:[]}│                                 │
         │◀────────────────────────────────┤                                 │
         │                                 │                                 │
         │                                 │  POST /direct/rooms/ABCD/join   │
         │                                 │◀────────────────────────────────┤
         │                                 │                                 │
         │                                 │  200 {peerId: "peer-b",         │
         │                                 │       peers: ["peer-a"]}        │
         │                                 ├────────────────────────────────▶│
         │                                 │                                 │
         │  Create RTCPeerConnection       │  Create RTCPeerConnection       │
         │  Create DataChannel             │  Wait for DataChannel           │
         │                                 │                                 │
         │  Create Offer (SDP)             │                                 │
         │  POST .../signal                │                                 │
         │  {type: "offer", data: SDP}     │                                 │
         ├────────────────────────────────▶│                                 │
         │                                 │                                 │
         │  GET .../poll (1s interval)     │  GET .../poll                   │
         │◀────────────────────────────────┤◀────────────────────────────────┤
         │  200 {signals: {...}}           │  200 {signals: {offers: [...]}} │
         ├────────────────────────────────▶├────────────────────────────────▶│
         │                                 │                                 │
         │                                 │  Create Answer (SDP)            │
         │                                 │  POST .../signal                │
         │                                 │  {type: "answer", data: SDP}    │
         │                                 │◀────────────────────────────────┤
         │                                 │                                 │
         │  GET .../poll                   │                                 │
         │  200 {signals: {answers: [...]}}│                                 │
         │◀────────────────────────────────┤                                 │
         │                                 │                                 │
         │  ICE Candidates Exchange        │  ICE Candidates Exchange        │
         │  POST .../signal (type: "ice")  │  POST .../signal (type: "ice")  │
         │◀───────────────────────────────▶│◀───────────────────────────────▶│
         │                                 │                                 │
         │                    WebRTC Connection Established                  │
         │◀─────────────────────────────────────────────────────────────────▶│
         │                  (Direct P2P - Server bypassed)                   │
         │                                 │                                 │
         │  Send File Metadata (JSON)                                        │
         │  {name, size, encryptionKey}                                      │
         ├──────────────────────────────────────────────────────────────────▶│
         │                                 │                                 │
         │  Send Encrypted File Chunks (16KB each)                           │
         ├──────────────────────────────────────────────────────────────────▶│
         ├──────────────────────────────────────────────────────────────────▶│
         ├──────────────────────────────────────────────────────────────────▶│
         │                                 │                        Decrypt  │
         │                                 │                        & Save   │
         │  Send End Marker                │                                 │
         ├──────────────────────────────────────────────────────────────────▶│
         │                                 │                                 │
         │  POST .../leave                 │  POST .../leave                 │
         ├────────────────────────────────▶│◀────────────────────────────────┤
         │                                 │                                 │
         │                          Room Deleted (Empty)                     │
         │                                 │                                 │
```

---

## Environment Configuration

### Required Variables

| Variable | Purpose | Example |
|----------|---------|---------|
| `NODE_ENV` | Environment mode | `development` or `production` |
| `PORT` | Server port | `3000` |
| `APP_BASE_URL` | Application base URL | `https://synkross.alwaysdata.net` |
| `TURNSTILE_SITE_KEY` | Cloudflare Turnstile public key | `0x...` |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile secret key | `0x...` |
| `SMTP_HOST` | SMTP server hostname | `smtp.gmail.com` |
| `SMTP_PORT` | SMTP server port | `465` (SSL) or `587` (TLS) |
| `MAIL_USER` | SMTP username | `user@example.com` |
| `MAIL_PASSWORD` | SMTP password | `app-specific-password` |
| `CLEANUP_CODE` | Manual cleanup authorization code | Random string |

### Optional Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `ALLOWED_CLIENTS` | CORS allowed origins (comma-separated) | Empty (development auto-allows localhost) |
| `STUN_SERVERS` | STUN servers for WebRTC (comma-separated) | `stun:stun.cloudflare.com:3478,stun:stun.l.google.com:19302` |
| `LOG_WEBHOOK` | Discord webhook URL for error/warn logs | None |

### Example .env File

```bash
# Server
NODE_ENV=production
PORT=3000

# Application
APP_BASE_URL=https://synkross.alwaysdata.net

# Security
ALLOWED_CLIENTS=https://example.com,https://app.example.com

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
MAIL_USER=synkros@example.com
MAIL_PASSWORD=your-app-specific-password

# Cloudflare Turnstile
TURNSTILE_SITE_KEY=0x4AAAAAAA...
TURNSTILE_SECRET_KEY=0x4AAAAAAA...

# Cleanup
CLEANUP_CODE=random-secure-code-here

# P2P (Optional)
STUN_SERVERS=stun:stun.cloudflare.com:3478,stun:stun.l.google.com:19302

# Logging (Optional)
LOG_WEBHOOK=https://discord.com/api/webhooks/...
```

---

## Request Lifecycle

### 1. Request Reception

```javascript
// HTTP Request arrives
┌──────────────────────────────────────┐
│  Client → HTTPS → Server (Express)   │
└──────────────────────────────────────┘
```

### 2. Middleware Chain

```javascript
// Order matters!
1. CORS validation (corsOptions)
   └─▶ Validate origin against ALLOWED_CLIENTS
   
2. Ray ID generation
   └─▶ Generate UUID v4
   └─▶ Attach to req.rayId
   └─▶ Set ALabs-Ray-Id response header
   
3. Helmet.js (HTTP security headers)
   └─▶ Set HSTS, X-Frame-Options, etc.
   
4. Custom CSP middleware
   └─▶ Generate random nonce
   └─▶ Attach to res.locals.cspNonce
   └─▶ Set Content-Security-Policy header
   
5. HTTPS redirect (production only)
   └─▶ Check req.secure or x-forwarded-proto
   └─▶ Redirect HTTP → HTTPS (301)
   
6. Body parsers
   └─▶ express.json() for JSON requests
   └─▶ express.urlencoded() for form data
   
7. Static file serving
   └─▶ Serve public/ directory
   └─▶ Set caching headers (7 days in production)
   
8. Verification middleware (checkVerification)
   └─▶ Generate session hash (SHA-256 of IP + UA)
   └─▶ Check verifiedCache
   └─▶ If verified → next()
   └─▶ If not verified → redirect to /verify
   └─▶ Skip for whitelisted routes
   
9. Route handlers
   └─▶ Execute specific route logic
   
10. Error handling middleware
    └─▶ Catch all errors
    └─▶ Log via Winston
    └─▶ Return JSON (API routes) or render error page
    
11. 404 handler
    └─▶ Render 404.ejs if no route matched
```

### 3. Response Generation

```javascript
// Route handler completes
1. Generate response payload
   └─▶ JSON for API routes
   └─▶ HTML (EJS) for web routes
   
2. Set response headers
   └─▶ Content-Type
   └─▶ Content-Disposition (downloads)
   └─▶ ALabs-Ray-Id (debugging)
   
3. Send response
   └─▶ res.json() / res.render() / res.send()
   
4. Log completion
   └─▶ Winston logger (combined.log)
   └─▶ Discord webhook (errors/warnings only)
```

---

## Dependencies Reference

### Production Dependencies

```json
{
  "cors": "2.8.5",           // CORS middleware
  "crypto": "1.0.1",         // Cryptographic utilities (built-in Node.js)
  "dotenv": "16.4.5",        // Environment variable loading
  "ejs": "3.1.10",           // Template engine
  "express": "4.21.2",       // Web framework
  "express-rate-limit": "7.2.0", // Rate limiting middleware
  "fs": "0.0.1-security",    // Filesystem operations (built-in)
  "helmet": "8.1.0",         // Security headers middleware
  "multer": "2.0.2",         // Multipart/form-data handling
  "node-cache": "5.1.2",     // In-memory caching
  "node-cron": "4.0.7",      // Cron job scheduling
  "nodemailer": "7.0.9",     // SMTP email sending
  "qrcode": "1.5.3",         // QR code generation
  "timeago.js": "4.0.2",     // Human-readable timestamps
  "uuid": "9.0.1",           // UUID generation
  "winston": "3.18.3"        // Logging framework
}
```

### Development Dependencies

```json
{
  "nodemon": "3.1.0"         // Auto-restart on file changes
}
```

### Frontend Dependencies (CDN)

```html
<!-- QR Code Generation -->
<script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"></script>

<!-- Timeago (Human-readable timestamps) -->
<script src="https://cdn.jsdelivr.net/npm/timeago.js@4.0.2/dist/timeago.min.js"></script>

<!-- Cloudflare Turnstile -->
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js"></script>
```

---

## Performance Optimizations

### Client-Side

1. **Web Workers**: Offload crypto operations to prevent UI blocking
2. **Chunked Processing**: 16MB chunks for large files
3. **Transferable Objects**: Use ArrayBuffer transfers (zero-copy)
4. **Progress Updates**: Real-time feedback without blocking
5. **Static Asset Caching**: 7-day cache in production

### Server-Side

1. **No Database**: Filesystem operations faster than DB queries
2. **Static File Serving**: Nginx-style caching headers
3. **In-Memory Caching**: NodeCache for P2P rooms (no disk I/O)
4. **Stream-Based Downloads**: No memory buffering for large files
5. **Cleanup Scheduling**: Off-peak cleanup (every 3 hours)

### Network

1. **Gzip Compression**: Express compression middleware (not shown)
2. **HTTP/2**: Cloudflare CDN support
3. **WebRTC Direct Transfer**: Bypass server for P2P
4. **STUN-Only**: No TURN relay (reduce server load)

---

## Troubleshooting

### Common Issues

#### 1. "File too large" Error

**Cause**: File exceeds 500MB limit (Server Mode)

**Solution**:
- Use P2P Mode (Direct) for unlimited file size
- Or modify `constants/file-constants.js`:
  ```javascript
  const maxAllowedFileSize = 1000 * 1024 * 1024; // 1GB
  ```

#### 2. P2P Connection Fails

**Cause**: NAT traversal failure (symmetric NAT, firewall)

**Solutions**:
- Ensure STUN servers are accessible
- Check firewall allows UDP traffic
- Consider adding TURN server for relay (not included by default)
- Verify browser WebRTC support

**Debug**:
```javascript
// Check ICE connection state
pc.oniceconnectionstatechange = () => {
  console.log('ICE state:', pc.iceConnectionState);
};
```

#### 3. Decryption Fails

**Cause**: Incorrect encryption key or corrupted file

**Solutions**:
- Verify URL fragment contains complete key (64 hex chars)
- Check for URL encoding issues
- Ensure file wasn't modified during transfer

**Debug**:
```javascript
// crypto.subtle.decrypt() throws if auth tag invalid
try {
  const decrypted = await crypto.subtle.decrypt(...);
} catch (error) {
  console.error('Decryption failed:', error);
  // "OperationError" = wrong key or corrupted data
}
```

#### 4. Email Sending Fails

**Cause**: SMTP configuration or authentication error

**Solutions**:
- Verify SMTP credentials in .env
- Use app-specific password (Gmail)
- Check SMTP_PORT matches SSL/TLS mode
- Test with `nodemailer` directly

**Debug**: Check Winston logs for SMTP errors

#### 5. Verification Loop

**Cause**: Turnstile session not caching

**Solutions**:
- Clear browser cache
- Check TURNSTILE_SECRET_KEY is correct
- Verify NodeCache is working
- Check for IP address changes (proxy, VPN)

---

## Deployment Guide

### Self-Hosting Steps

1. **Clone Repository**:
   ```bash
   git clone https://github.com/axrxvm/synkros.git
   cd synkros
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment**:
   ```bash
   cp .env.example .env
   nano .env  # Edit configuration
   ```

4. **Create Directories**:
   ```bash
   mkdir -p uploads data
   ```

5. **Start Server**:
   ```bash
   # Development
   npm run dev

   # Production
   npm start
   ```

### Production Deployment (PM2)

```bash
# Install PM2
npm install -g pm2

# Start application
pm2 start server.js --name synkros

# Save PM2 configuration
pm2 save

# Setup auto-restart on boot
pm2 startup

# Monitor logs
pm2 logs synkros
```

### Nginx Reverse Proxy

```nginx
server {
    listen 80;
    server_name synkross.alwaysdata.net;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name synkross.alwaysdata.net;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## Security Best Practices

### For Users

1. **Verify Links**: Always check domain before downloading
2. **Keep Keys Private**: Share links securely (encrypted messaging)
3. **Delete After Use**: Files auto-delete after 24h, but share responsibly
4. **Use P2P for Sensitive Data**: Zero server knowledge
5. **Password-Protect P2P Rooms**: Add password for extra security

### For Developers

1. **Keep Dependencies Updated**: `npm audit` regularly
2. **Rotate SMTP Credentials**: Use app-specific passwords
3. **Monitor Logs**: Check Winston logs for anomalies
4. **Rate Limiting**: Adjust limits based on traffic patterns
5. **HTTPS Only**: Never run in production without TLS
6. **CSP Testing**: Validate CSP headers in browser DevTools
7. **Backup Metadata**: `data/` directory contains file mappings

---

## License

Synkros is licensed under **CC-BY-NC-4.0** (Creative Commons Attribution-NonCommercial 4.0 International).

**You are free to**:
- ✅ Share and modify for personal/non-commercial use
- ✅ Self-host for personal projects

**You must**:
- ✅ Give appropriate credit
- ✅ Indicate if changes were made

**You cannot**:
- ❌ Use for commercial purposes without permission
- ❌ Claim you built it

---

## Contact & Support

- **GitHub**: [axrxvm/synkros](https://github.com/axrxvm/synkros)
- **Issues**: [GitHub Issues](https://github.com/axrxvm/synkros/issues)
- **Author**: Aarav Mehta - [https://itzaarav.netlify.app](https://itzaarav.netlify.app)

---

**Built with privacy, transparency, and no bullshit.**  
**Welcome to Synkros.**
