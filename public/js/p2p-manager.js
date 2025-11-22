// WebRTC P2P Connection Manager
class P2PManager {
  constructor() {
    this.peerConnections = new Map(); // Map of peerId -> RTCPeerConnection
    this.dataChannels = new Map(); // Map of peerId -> RTCDataChannel
    this.stunServers = [];
    this.roomCode = null;
    this.peerId = null;
    this.password = null;
    this.onPeerConnected = null;
    this.onPeerDisconnected = null;
    this.onDataChannelOpen = null;
    this.onFileReceived = null;
    this.onTransferProgress = null;
    this.pollingInterval = null;
    this.incomingFiles = new Map();
  }

  // Initialize with STUN servers from environment
  async init(stunServers) {
    this.stunServers = stunServers.map((url) => ({ urls: url }));
    console.log("P2P Manager initialized with STUN servers:", this.stunServers);
  }

  // Event handler registration
  on(event, callback) {
    switch(event) {
      case 'peer-joined':
        this.onPeerConnected = callback;
        break;
      case 'peer-left':
        this.onPeerDisconnected = callback;
        break;
      case 'file-received':
        this.onFileReceived = callback;
        break;
      case 'transfer-progress':
        this.onTransferProgress = callback;
        break;
      case 'data-channel-open':
        this.onDataChannelOpen = callback;
        break;
    }
  }

  // Get connected peers
  getConnectedPeers() {
    return Array.from(this.peerConnections.entries())
      .filter(([_, pc]) => pc.connectionState === "connected")
      .map(([peerId, _]) => peerId);
  }

  // Note: File encryption is handled by the caller using window.p2pEncryption
  // This manager only handles the WebRTC broadcast of already-encrypted files

  // Create a new room
  async createRoom(password, maxPeers) {
    try {
      const response = await fetch("/direct/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, maxPeers }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to create room");
      }

      this.roomCode = data.roomCode;
      this.password = password;

      // Auto-join the room as creator
      await this.joinRoom(this.roomCode, password);

      return data;
    } catch (error) {
      console.error("Create room error:", error);
      throw error;
    }
  }

  // Join an existing room
  async joinRoom(roomCode, password) {
    try {
      // First validate the room
      const validateResponse = await fetch(
        `/direct/rooms/${roomCode}?password=${encodeURIComponent(password)}`
      );
      const validateData = await validateResponse.json();

      if (!validateResponse.ok) {
        throw new Error(validateData.error || "Failed to validate room");
      }

      if (validateData.isFull) {
        throw new Error("Room is full");
      }

      // Join the room
      const joinResponse = await fetch(`/direct/rooms/${roomCode}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const joinData = await joinResponse.json();
      if (!joinResponse.ok) {
        throw new Error(joinData.error || "Failed to join room");
      }

      this.roomCode = roomCode;
      this.peerId = joinData.peerId;
      this.password = password;

      // Start polling for signals
      this.startPolling();

      // Connect to existing peers
      for (const existingPeerId of joinData.peers) {
        await this.connectToPeer(existingPeerId, true);
      }

      return joinData;
    } catch (error) {
      console.error("Join room error:", error);
      throw error;
    }
  }

  // Connect to a peer
  async connectToPeer(peerId, isInitiator = false) {
    try {
      const config = {
        iceServers: this.stunServers,
      };

      const pc = new RTCPeerConnection(config);
      this.peerConnections.set(peerId, pc);

      // ICE candidate handler
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          this.sendSignal(peerId, "ice", event.candidate);
        }
      };

      // Connection state handler
      pc.onconnectionstatechange = () => {
        console.log(`Peer ${peerId} connection state: ${pc.connectionState}`);
        if (pc.connectionState === "connected") {
          if (this.onPeerConnected) this.onPeerConnected(peerId);
        } else if (
          pc.connectionState === "disconnected" ||
          pc.connectionState === "failed"
        ) {
          if (this.onPeerDisconnected) this.onPeerDisconnected(peerId);
          this.removePeer(peerId);
        }
      };

      if (isInitiator) {
        // Create data channel
        const dc = pc.createDataChannel("fileTransfer", {
          ordered: true,
        });
        this.setupDataChannel(peerId, dc);

        // Create and send offer
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await this.sendSignal(peerId, "offer", offer);
      } else {
        // Wait for data channel from remote peer
        pc.ondatachannel = (event) => {
          this.setupDataChannel(peerId, event.channel);
        };
      }
    } catch (error) {
      console.error(`Error connecting to peer ${peerId}:`, error);
      throw error;
    }
  }

  // Setup data channel handlers
  setupDataChannel(peerId, dataChannel) {
    this.dataChannels.set(peerId, dataChannel);

    dataChannel.onopen = () => {
      console.log(`Data channel open with peer ${peerId}`);
      if (this.onDataChannelOpen) this.onDataChannelOpen(peerId);
    };

    dataChannel.onclose = () => {
      console.log(`Data channel closed with peer ${peerId}`);
      this.dataChannels.delete(peerId);
    };

    dataChannel.onerror = (error) => {
      console.error(`Data channel error with peer ${peerId}:`, error);
    };

    dataChannel.onmessage = async (event) => {
      await this.handleDataChannelMessage(peerId, event.data);
    };
  }

  // Handle incoming data channel messages
  async handleDataChannelMessage(peerId, data) {
    try {
      if (typeof data === "string") {
        // Metadata message
        const message = JSON.parse(data);
        console.log(`📨 Received metadata from ${peerId}:`, message);
        
        if (message.type === "file-metadata") {
          // Store metadata for incoming file
          this.incomingFiles.set(peerId, {
            metadata: message,
            chunks: [],
            received: 0,
          });
          console.log(`📥 Starting to receive file: ${message.name} (${message.size} bytes)`);
        }
      } else {
        // Binary data (file chunk)
        if (!this.incomingFiles.has(peerId)) {
          console.warn("Received file chunk without metadata from peer:", peerId);
          return;
        }

        const fileTransfer = this.incomingFiles.get(peerId);
        fileTransfer.chunks.push(data);
        fileTransfer.received += data.byteLength;

        // Calculate progress
        const progress = Math.min(Math.floor((fileTransfer.received / fileTransfer.metadata.size) * 100), 100);
        if (this.onTransferProgress) {
          this.onTransferProgress({
            direction: 'receive',
            progress,
            fileName: fileTransfer.metadata.name,
            peerId
          });
        }

        // Check if transfer complete
        if (fileTransfer.received >= fileTransfer.metadata.size) {
          console.log(`✅ File transfer complete: ${fileTransfer.metadata.name}`);
          const blob = new Blob(fileTransfer.chunks);
          this.incomingFiles.delete(peerId);

          if (this.onFileReceived) {
            this.onFileReceived({
              name: fileTransfer.metadata.name,
              size: fileTransfer.metadata.size,
              data: blob,
              peerId
            });
          }
        }
      }
    } catch (error) {
      console.error("Error handling data channel message:", error);
    }
  }

  // Send signal to peer via server
  async sendSignal(targetPeerId, type, data) {
    try {
      await fetch(`/direct/rooms/${this.roomCode}/signal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          peerId: this.peerId,
          targetPeerId,
          type,
          data,
        }),
      });
    } catch (error) {
      console.error("Send signal error:", error);
    }
  }

  // Poll for incoming signals
  startPolling() {
    if (this.pollingInterval) return;

    this.pollingInterval = setInterval(async () => {
      try {
        const response = await fetch(
          `/direct/rooms/${this.roomCode}/poll?peerId=${this.peerId}`,
          { 
            method: 'GET',
            headers: { 'Accept': 'application/json' }
          }
        );
        
        // Handle non-OK responses gracefully
        if (!response.ok) {
          if (response.status === 502 || response.status === 503) {
            // Server temporarily unavailable, skip this poll
            return;
          }
          console.warn(`Polling failed with status ${response.status}`);
          return;
        }

        const data = await response.json();
        if (data.signals) {
          await this.processSignals(data.signals, data.peers);
        }
      } catch (error) {
        // Silently handle network errors to avoid console spam
        // Only log if it's not a common network error
        if (!error.message.includes('Failed to fetch') && 
            !error.message.includes('JSON')) {
          console.error("Polling error:", error);
        }
      }
    }, 1000); // Poll every second
  }

  // Process received signals
  async processSignals(signals, currentPeers) {
    try {
      // Handle offers
      for (const signal of signals.offers) {
        const peerId = signal.from;
        if (!this.peerConnections.has(peerId)) {
          await this.connectToPeer(peerId, false);
        }

        const pc = this.peerConnections.get(peerId);
        await pc.setRemoteDescription(new RTCSessionDescription(signal.data));

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await this.sendSignal(peerId, "answer", answer);
      }

      // Handle answers
      for (const signal of signals.answers) {
        const peerId = signal.from;
        const pc = this.peerConnections.get(peerId);
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.data));
        }
      }

      // Handle ICE candidates
      for (const signal of signals.ice) {
        const peerId = signal.from;
        const pc = this.peerConnections.get(peerId);
        if (pc) {
          await pc.addIceCandidate(new RTCIceCandidate(signal.data));
        }
      }
    } catch (error) {
      console.error("Process signals error:", error);
    }
  }

  // Send file to specific peer
  async sendFileToPeer(peerId, file, encryptedBlob, metadata) {
    try {
      const dc = this.dataChannels.get(peerId);
      if (!dc || dc.readyState !== "open") {
        throw new Error("Data channel not ready");
      }

      // Send metadata first
      const metadataMessage = JSON.stringify({
        type: "file-metadata",
        name: metadata.name,
        size: encryptedBlob.size,
        originalSize: file.size,
      });
      dc.send(metadataMessage);

      // Send file in chunks
      const chunkSize = 16384; // 16KB chunks
      let offset = 0;

      while (offset < encryptedBlob.size) {
        const chunk = encryptedBlob.slice(offset, offset + chunkSize);
        const arrayBuffer = await chunk.arrayBuffer();
        
        dc.send(arrayBuffer);
        offset += chunkSize;

        // Update progress
        const progress = Math.min(Math.floor((offset / encryptedBlob.size) * 100), 100);
        if (this.onTransferProgress) {
          this.onTransferProgress({
            direction: 'send',
            progress,
            fileName: file.name,
            peerId
          });
        }
      }

      console.log(`File sent to peer ${peerId}`);
    } catch (error) {
      console.error(`Error sending file to peer ${peerId}:`, error);
      throw error;
    }
  }

  // Broadcast file to all connected peers
  async broadcastFile(file, encryptedBlob, metadata) {
    const promises = [];
    for (const [peerId, dc] of this.dataChannels) {
      if (dc.readyState === "open") {
        promises.push(this.sendFileToPeer(peerId, file, encryptedBlob, metadata));
      }
    }
    await Promise.all(promises);
  }

  // Remove peer
  removePeer(peerId) {
    const pc = this.peerConnections.get(peerId);
    if (pc) {
      pc.close();
      this.peerConnections.delete(peerId);
    }
    this.dataChannels.delete(peerId);
  }

  // Leave room and cleanup
  async leaveRoom() {
    try {
      if (this.pollingInterval) {
        clearInterval(this.pollingInterval);
        this.pollingInterval = null;
      }

      // Close all peer connections
      for (const [peerId, pc] of this.peerConnections) {
        pc.close();
      }
      this.peerConnections.clear();
      this.dataChannels.clear();

      // Notify server
      if (this.roomCode && this.peerId) {
        await fetch(`/direct/rooms/${this.roomCode}/leave`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ peerId: this.peerId }),
        });
      }

      this.roomCode = null;
      this.peerId = null;
      this.password = null;
    } catch (error) {
      console.error("Leave room error:", error);
    }
  }

  // Get connection status
  getStatus() {
    const connectedPeers = Array.from(this.peerConnections.entries())
      .filter(([_, pc]) => pc.connectionState === "connected")
      .map(([peerId, _]) => peerId);

    return {
      roomCode: this.roomCode,
      peerId: this.peerId,
      connectedPeers,
      totalConnections: this.peerConnections.size,
    };
  }
}
