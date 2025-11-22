const router = require("express").Router();
const NodeCache = require("node-cache");
const crypto = require("crypto");
const logger = require("../services/logger");

// In-memory room storage with 5-minute TTL
const roomCache = new NodeCache({ stdTTL: 5 * 60, checkperiod: 60 });

// Generate cryptographically secure room code
function generateRoomCode() {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

// Validate password strength
function isValidPassword(password) {
  return password && password.length >= 4;
}

// Derive encryption key from room password using PBKDF2
function deriveKeyFromPassword(password, salt) {
  if (!password) return null;
  return crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
}

// Encrypt signaling data with room password (defense-in-depth for metadata protection)
function encryptSignalData(data, passwordHash) {
  if (!passwordHash) {
    // No password = no encryption (plaintext fallback for passwordless rooms)
    return { encrypted: false, data };
  }
  
  try {
    const iv = crypto.randomBytes(12);
    const key = deriveKeyFromPassword(passwordHash, 'synkros-p2p-signal');
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(data), 'utf8'),
      cipher.final()
    ]);
    
    const authTag = cipher.getAuthTag();
    
    return {
      encrypted: true,
      data: {
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
        ciphertext: encrypted.toString('base64')
      }
    };
  } catch (error) {
    logger.error('Signal encryption error:', error);
    // Fallback to plaintext on encryption failure
    return { encrypted: false, data };
  }
}

// Decrypt signaling data with room password
function decryptSignalData(encryptedData, passwordHash) {
  if (!encryptedData.encrypted) {
    // Plaintext data from passwordless room
    return encryptedData.data;
  }
  
  if (!passwordHash) {
    throw new Error('Password required to decrypt signal data');
  }
  
  try {
    const key = deriveKeyFromPassword(passwordHash, 'synkros-p2p-signal');
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(encryptedData.data.iv, 'base64')
    );
    
    decipher.setAuthTag(Buffer.from(encryptedData.data.authTag, 'base64'));
    
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedData.data.ciphertext, 'base64')),
      decipher.final()
    ]);
    
    return JSON.parse(decrypted.toString('utf8'));
  } catch (error) {
    logger.error('Signal decryption error:', error);
    throw new Error('Failed to decrypt signal data');
  }
}

// GET /p2p - Render P2P UI page
router.get("/", (req, res) => {
  const stunServers = process.env.STUN_SERVERS
    ? process.env.STUN_SERVERS.split(",")
    : ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"];
  
  res.render("p2p", { 
    rayId: req.rayId,
    stunServers: JSON.stringify(stunServers)
  });
});

// POST /p2p/rooms - Create new P2P room
router.post("/rooms", (req, res) => {
  try {
    const { password, maxPeers } = req.body;

    // Password is optional, but if provided must be at least 4 characters
    if (password && password.length > 0 && !isValidPassword(password)) {
      logger.warn("P2P room creation failed: Invalid password", req);
      return res.status(400).json({
        error: "Password must be at least 4 characters long",
        rayId: req.rayId,
      });
    }

    const maxPeersNum = parseInt(maxPeers) || 2;
    if (maxPeersNum < 2 || maxPeersNum > 10) {
      logger.warn("P2P room creation failed: Invalid max peers", req);
      return res.status(400).json({
        error: "Maximum peers must be between 2 and 10",
        rayId: req.rayId,
      });
    }

    logger.info(`Creating P2P room with maxPeers: ${maxPeersNum}`, req);

    const roomCode = generateRoomCode();
    const passwordHash = password
      ? crypto.createHash("sha256").update(password).digest("hex")
      : null;

    const room = {
      roomCode,
      passwordHash,
      maxPeers: maxPeersNum,
      peers: [], // Array of peer IDs
      signals: {}, // Store signaling data per peer
      createdAt: new Date().toISOString(),
      createdBy: req.rayId,
    };

    roomCache.set(roomCode, room);
    logger.info(`P2P room created: ${roomCode} (max: ${maxPeersNum})`, req);

    res.json({
      success: true,
      roomCode,
      maxPeers: maxPeersNum,
      rayId: req.rayId,
    });
  } catch (error) {
    logger.error("P2P room creation error:", error, req);
    res.status(500).json({
      error: "Failed to create room",
      rayId: req.rayId,
    });
  }
});

// GET /p2p/rooms/:code - Validate room and check capacity
router.get("/rooms/:code", (req, res) => {
  try {
    const { code } = req.params;
    const { password } = req.query;

    const room = roomCache.get(code.toUpperCase());
    if (!room) {
      logger.warn(`P2P room not found: ${code}`, req);
      return res.status(404).json({
        error: "Room not found or expired",
        rayId: req.rayId,
      });
    }

    if (password || room.passwordHash) {
      const passwordHash = password
        ? crypto.createHash("sha256").update(password).digest("hex")
        : null;

      if (passwordHash !== room.passwordHash) {
        logger.warn(`P2P invalid password for room: ${code}`, req);
        return res.status(403).json({
          error: "Invalid password",
          rayId: req.rayId,
        });
      }
    }

    const isFull = room.peers.length >= room.maxPeers;

    res.json({
      success: true,
      roomCode: room.roomCode,
      maxPeers: room.maxPeers,
      currentPeers: room.peers.length,
      isFull,
      rayId: req.rayId,
    });
  } catch (error) {
    logger.error("P2P room validation error:", error, req);
    res.status(500).json({
      error: "Failed to validate room",
      rayId: req.rayId,
    });
  }
});

// POST /p2p/rooms/:code/join - Join room and get peer ID
router.post("/rooms/:code/join", (req, res) => {
  try {
    const { code } = req.params;
    const { password } = req.body;

    const room = roomCache.get(code.toUpperCase());
    if (!room) {
      return res.status(404).json({
        error: "Room not found or expired",
        rayId: req.rayId,
      });
    }

    const passwordHash = password
      ? crypto.createHash("sha256").update(password).digest("hex")
      : null;

    if (passwordHash !== room.passwordHash) {
      return res.status(403).json({
        error: "Invalid password",
        rayId: req.rayId,
      });
    }

    logger.info(`P2P join attempt: room ${code} has ${room.peers.length}/${room.maxPeers} peers`, req);

    if (room.peers.length >= room.maxPeers) {
      logger.warn(`P2P room full: ${code} (${room.peers.length}/${room.maxPeers})`, req);
      return res.status(403).json({
        error: "Room is full",
        rayId: req.rayId,
      });
    }

    // Generate unique peer ID
    const peerId = crypto.randomBytes(8).toString("hex");
    room.peers.push(peerId);
    room.signals[peerId] = { offers: [], answers: [], ice: [] };

    roomCache.set(code.toUpperCase(), room);
    logger.info(`P2P peer joined room ${code}: ${peerId}`, req);

    res.json({
      success: true,
      peerId,
      roomCode: room.roomCode,
      peers: room.peers.filter((id) => id !== peerId), // Other peers in room
      rayId: req.rayId,
    });
  } catch (error) {
    logger.error("P2P join room error:", error, req);
    res.status(500).json({
      error: "Failed to join room",
      rayId: req.rayId,
    });
  }
});

// POST /p2p/rooms/:code/signal - Relay WebRTC signaling data
router.post("/rooms/:code/signal", (req, res) => {
  try {
    const { code } = req.params;
    const { peerId, targetPeerId, type, data } = req.body;

    const room = roomCache.get(code.toUpperCase());
    if (!room) {
      return res.status(404).json({
        error: "Room not found or expired",
        rayId: req.rayId,
      });
    }

    if (!room.peers.includes(peerId)) {
      return res.status(403).json({
        error: "Peer not in room",
        rayId: req.rayId,
      });
    }

    if (targetPeerId && !room.peers.includes(targetPeerId)) {
      return res.status(404).json({
        error: "Target peer not found",
        rayId: req.rayId,
      });
    }

    // Store signaling data (encrypted if room has password)
    if (!room.signals[targetPeerId]) {
      room.signals[targetPeerId] = { offers: [], answers: [], ice: [] };
    }

    // Encrypt signaling data for metadata protection (defense-in-depth)
    const encryptedData = encryptSignalData(data, room.passwordHash);
    const signal = { from: peerId, data: encryptedData, timestamp: Date.now() };

    if (type === "offer") {
      room.signals[targetPeerId].offers.push(signal);
    } else if (type === "answer") {
      room.signals[targetPeerId].answers.push(signal);
    } else if (type === "ice") {
      room.signals[targetPeerId].ice.push(signal);
    }

    roomCache.set(code.toUpperCase(), room);
    logger.info(`P2P signal relayed in ${code}: ${type} from ${peerId} to ${targetPeerId} (encrypted: ${encryptedData.encrypted})`, req);

    res.json({
      success: true,
      rayId: req.rayId,
    });
  } catch (error) {
    logger.error("P2P signal relay error:", error, req);
    res.status(500).json({
      error: "Failed to relay signal",
      rayId: req.rayId,
    });
  }
});

// GET /p2p/rooms/:code/poll - Poll for new signals
router.get("/rooms/:code/poll", (req, res) => {
  try {
    const { code } = req.params;
    const { peerId } = req.query;

    const room = roomCache.get(code.toUpperCase());
    if (!room) {
      return res.status(404).json({
        error: "Room not found or expired",
        rayId: req.rayId,
      });
    }

    if (!room.peers.includes(peerId)) {
      return res.status(403).json({
        error: "Peer not in room",
        rayId: req.rayId,
      });
    }

    const encryptedSignals = room.signals[peerId] || { offers: [], answers: [], ice: [] };

    // Decrypt signals before sending to peer (if room has password)
    const decryptSignals = (signalArray) => {
      return signalArray.map(signal => {
        try {
          return {
            from: signal.from,
            data: decryptSignalData(signal.data, room.passwordHash),
            timestamp: signal.timestamp
          };
        } catch (error) {
          logger.error(`Failed to decrypt signal from ${signal.from}:`, error, req);
          return null;
        }
      }).filter(s => s !== null);
    };

    const signals = {
      offers: decryptSignals(encryptedSignals.offers),
      answers: decryptSignals(encryptedSignals.answers),
      ice: decryptSignals(encryptedSignals.ice)
    };

    // Clear retrieved signals
    room.signals[peerId] = { offers: [], answers: [], ice: [] };
    roomCache.set(code.toUpperCase(), room);

    res.json({
      success: true,
      signals,
      peers: room.peers.filter((id) => id !== peerId),
      rayId: req.rayId,
    });
  } catch (error) {
    logger.error("P2P poll error:", error, req);
    res.status(500).json({
      error: "Failed to poll signals",
      rayId: req.rayId,
    });
  }
});

// POST /p2p/rooms/:code/leave - Leave room
router.post("/rooms/:code/leave", (req, res) => {
  try {
    const { code } = req.params;
    const { peerId } = req.body;

    const room = roomCache.get(code.toUpperCase());
    if (!room) {
      return res.json({
        success: true,
        rayId: req.rayId,
      });
    }

    room.peers = room.peers.filter((id) => id !== peerId);
    delete room.signals[peerId];

    if (room.peers.length === 0) {
      // Delete room if empty
      roomCache.del(code.toUpperCase());
      logger.info(`P2P room deleted (empty): ${code}`, req);
    } else {
      roomCache.set(code.toUpperCase(), room);
      logger.info(`P2P peer left room ${code}: ${peerId}`, req);
    }

    res.json({
      success: true,
      rayId: req.rayId,
    });
  } catch (error) {
    logger.error("P2P leave room error:", error, req);
    res.status(500).json({
      error: "Failed to leave room",
      rayId: req.rayId,
    });
  }
});

module.exports = router;
