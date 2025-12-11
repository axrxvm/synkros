// Web Worker for E2EE encryption/decryption operations
// This offloads heavy crypto operations to prevent UI blocking

class CryptoWorker {
  constructor() {
    this.algorithm = 'AES-GCM';
    this.keyLength = 256;
    this.chunkSize = 16 * 1024 * 1024; // 16MB chunks for optimal performance
  }

  // Compress data using gzip (fast, lossless compression)
  async compressData(data) {
    // Convert ArrayBuffer to Uint8Array if needed
    const uint8Data = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
    
    // Use CompressionStream API (modern browsers)
    const cs = new CompressionStream('gzip');
    const writer = cs.writable.getWriter();
    writer.write(uint8Data);
    writer.close();
    
    // Read compressed data
    const chunks = [];
    const reader = cs.readable.getReader();
    let totalSize = 0;
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      totalSize += value.length;
    }
    
    // Combine chunks into single Uint8Array
    const compressed = new Uint8Array(totalSize);
    let offset = 0;
    for (const chunk of chunks) {
      compressed.set(chunk, offset);
      offset += chunk.length;
    }
    
    return compressed;
  }

  // Decompress gzip data
  async decompressData(compressedData) {
    const uint8Data = compressedData instanceof ArrayBuffer ? new Uint8Array(compressedData) : compressedData;
    
    // Use DecompressionStream API
    const ds = new DecompressionStream('gzip');
    const writer = ds.writable.getWriter();
    writer.write(uint8Data);
    writer.close();
    
    // Read decompressed data
    const chunks = [];
    const reader = ds.readable.getReader();
    let totalSize = 0;
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      totalSize += value.length;
    }
    
    // Combine chunks
    const decompressed = new Uint8Array(totalSize);
    let offset = 0;
    for (const chunk of chunks) {
      decompressed.set(chunk, offset);
      offset += chunk.length;
    }
    
    return decompressed;
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
  // Now includes decompression after decryption to restore original file
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
      progressCallback(70); // Decryption done
      
      // Decompress the decrypted data
      const decompressed = await this.decompressData(decrypted);
      progressCallback(100);
      return decompressed;
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
    
    progressCallback(70); // Decryption done
    
    // Decompress the decrypted data
    const decompressed = await this.decompressData(decrypted);
    
    progressCallback(100);
    return decompressed;
  }

  // Encrypt file with chunked processing and progress updates
  // Now includes compression before encryption for storage savings
  async encryptFileChunked(fileBuffer, key, progressCallback) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    progressCallback(5); // IV generation
    
    // Compress before encryption (saves storage, works well with unencrypted data)
    const originalSize = fileBuffer.byteLength;
    const compressed = await this.compressData(fileBuffer);
    const compressionRatio = ((1 - compressed.length / originalSize) * 100).toFixed(1);
    console.log(`Compression: ${originalSize} -> ${compressed.length} bytes (${compressionRatio}% savings)`);
    
    progressCallback(30); // Compression done
    
    const encrypted = await crypto.subtle.encrypt(
      {
        name: this.algorithm,
        iv: iv,
      },
      key,
      compressed
    );

    progressCallback(90);

    // Combine IV and encrypted data
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encrypted), iv.length);
    
    progressCallback(100);
    return { data: combined, originalSize: originalSize, compressedSize: compressed.length };
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
        const encryptResult = await cryptoWorker.encryptFileChunked(fileBuffer, encKey, progressCallbackEnc);

        // encryptResult now contains { data, originalSize, compressedSize }
        const outEncBuffer = encryptResult.data instanceof ArrayBuffer ? encryptResult.data : encryptResult.data.buffer;
        self.postMessage({ 
          id, 
          type: 'success', 
          data: outEncBuffer,
          originalSize: encryptResult.originalSize,
          compressedSize: encryptResult.compressedSize
        }, [outEncBuffer]);
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