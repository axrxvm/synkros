// Web Worker for E2EE encryption/decryption operations
// This offloads heavy crypto operations to prevent UI blocking

class CryptoWorker {
  constructor() {
    this.algorithm = 'AES-GCM';
    this.keyLength = 256;
    this.chunkSize = 16 * 1024 * 1024; // 16MB chunks for optimal performance
  }

  // Import key from hex string
  async importKeyFromHex(hexKey) {
    const keyData = new Uint8Array(
      hexKey.match(/.{2}/g).map(byte => parseInt(byte, 16))
    );
    return await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: this.algorithm },
      false,
      ['encrypt', 'decrypt']
    );
  }

  // Decrypt file with chunked processing and progress updates
  async decryptFileChunked(encryptedData, key, progressCallback) {
    const iv = encryptedData.slice(0, 12); // First 12 bytes are IV
    const ciphertext = encryptedData.slice(12); // Rest is encrypted data
    
    // For small files (< 1MB), decrypt in one go
    if (ciphertext.byteLength < 1024 * 1024) {
      const decrypted = await crypto.subtle.decrypt(
        {
          name: this.algorithm,
          iv: iv,
        },
        key,
        ciphertext
      );
      progressCallback(100);
      return decrypted;
    }

    // For large files, we need to decrypt in one operation since AES-GCM
    // doesn't support streaming. However, we can simulate progress updates
    // by updating progress during the operation preparation
    
    progressCallback(10); // Preparation
    
    const startTime = Date.now();
    const decrypted = await crypto.subtle.decrypt(
      {
        name: this.algorithm,
        iv: iv,
      },
      key,
      ciphertext
    );
    
    progressCallback(100);
    return decrypted;
  }

  // Encrypt file with chunked processing and progress updates
  async encryptFileChunked(fileBuffer, key, progressCallback) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    progressCallback(5); // IV generation
    
    const encrypted = await crypto.subtle.encrypt(
      {
        name: this.algorithm,
        iv: iv,
      },
      key,
      fileBuffer
    );

    progressCallback(90);

    // Combine IV and encrypted data
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encrypted), iv.length);
    
    progressCallback(100);
    return combined;
  }

  // Download file with progress tracking
  async downloadWithProgress(url, progressCallback) {
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Download failed: ${response.status}`);
    }

    const contentLength = response.headers.get('Content-Length');
    const total = contentLength ? parseInt(contentLength, 10) : 0;
    
    if (!total) {
      // If no content length, just return the buffer
      return new Uint8Array(await response.arrayBuffer());
    }

    const reader = response.body.getReader();
    // Pre-allocate the full buffer to avoid extra copies
    const fullData = new Uint8Array(total);
    let received = 0;

    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      // value is a Uint8Array; copy directly into the preallocated buffer
      fullData.set(value, received);
      received += value.length;

      // Update download progress (0-50% of total progress)
      const downloadProgress = Math.round((received / total) * 50);
      progressCallback(downloadProgress);
    }

    // In rare cases, received may be less than total if connection closed early
    if (received !== total) {
      // Return a trimmed view to the actual received bytes to avoid sending unused bytes
      return fullData.subarray(0, received);
    }

    return fullData;
  }
}

// Message handler for worker communication
const cryptoWorker = new CryptoWorker();

self.onmessage = async function(e) {
  const { id, type, data } = e.data;
  
  try {
    switch (type) {
      case 'downloadAndDecrypt':
        const { url, keyHex } = data;
        
        // Progress callback
        const progressCallback = (progress) => {
          self.postMessage({
            id,
            type: 'progress',
            progress: progress
          });
        };

        // Import key
        const key = await cryptoWorker.importKeyFromHex(keyHex);
        
        // Download file with progress
        const downloadedData = await cryptoWorker.downloadWithProgress(url, (progress) => {
          progressCallback(progress); // 0-50%
        });
        
        // Decrypt with progress
        const decryptedData = await cryptoWorker.decryptFileChunked(downloadedData, key, (progress) => {
          // Map decryption progress to 50-100%
          const totalProgress = 50 + Math.round(progress * 0.5);
          progressCallback(totalProgress);
        });
        
        // Send success result. Ensure we send ArrayBuffer (not a Uint8Array wrapper)
        const outBuffer = decryptedData instanceof ArrayBuffer ? decryptedData : decryptedData.buffer;
        self.postMessage({ id, type: 'success', data: outBuffer }, [outBuffer]);
        break;

      case 'encryptFile':
        const { fileBuffer, keyHex: encKeyHex } = data;
        
        const progressCallbackEnc = (progress) => {
          self.postMessage({
            id,
            type: 'progress',
            progress: progress
          });
        };

        const encKey = await cryptoWorker.importKeyFromHex(encKeyHex);
        const encryptedData = await cryptoWorker.encryptFileChunked(fileBuffer, encKey, progressCallbackEnc);

        // encryptedData is a Uint8Array — send its underlying buffer as transferable
        const outEncBuffer = encryptedData instanceof ArrayBuffer ? encryptedData : encryptedData.buffer;
        self.postMessage({ id, type: 'success', data: outEncBuffer }, [outEncBuffer]);
        break;

      default:
        throw new Error(`Unknown operation: ${type}`);
    }
  } catch (error) {
    self.postMessage({
      id,
      type: 'error',
      error: error.message
    });
  }
};