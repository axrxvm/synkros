// E2EE Encryption/Decryption Module using Web Crypto API with Web Worker support
class E2EECrypto {
  constructor() {
    this.algorithm = 'AES-GCM';
    this.keyLength = 256;
    this.worker = null;
    this.operationId = 0;
    this.operations = new Map();
    this.initWorker();
  }

  // Initialize Web Worker for heavy operations
  initWorker() {
    try {
      this.worker = new Worker('/js/crypto-worker.js');
      console.info('e2ee: worker initialized');
      this.worker.onmessage = (e) => {
        const { id, type, progress, data, error, originalSize, compressedSize } = e.data;
        const operation = this.operations.get(id);
        
        if (!operation) return;
        
        switch (type) {
          case 'progress':
            // Only log sparse progress updates to avoid spamming the console
            try {
              const p = Math.round(progress);
              if (p % 10 === 0 || p >= 95) {
                console.log(`e2ee: op ${id} progress ${p}%`);
              }
            } catch (e) {}
            if (operation.onProgress) {
              operation.onProgress(progress);
            }
            break;
          case 'success':
            // Worker sends ArrayBuffer as transferable; pass it through as-is
            console.log(`e2ee: op ${id} success`);
            // If compression metadata is available, pass it along
            if (originalSize !== undefined && compressedSize !== undefined) {
              operation.resolve({ data, originalSize, compressedSize });
            } else {
              operation.resolve(data);
            }
            this.operations.delete(id);
            break;
          case 'error':
            console.error(`e2ee: op ${id} error: ${error}`);
            operation.reject(new Error(error));
            this.operations.delete(id);
            break;
        }
      };
      
      this.worker.onerror = (error) => {
        console.error('e2ee: worker error ->', error);
        // Clean up failed operations
        this.operations.forEach((operation, id) => {
          operation.reject(new Error('Worker crashed during operation'));
        });
        this.operations.clear();
        // Fallback to main thread if worker fails
        this.worker = null;
      };
    } catch (error) {
      console.warn('e2ee: Web Worker not supported, falling back to main thread');
      this.worker = null;
    }
  }

  // Cleanup method to terminate worker and clear operations
  cleanup() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.operations.clear();
  }

  // Generate a random encryption key
  async generateKey() {
    const key = await crypto.subtle.generateKey(
      {
        name: this.algorithm,
        length: this.keyLength,
      },
      true, // extractable
      ['encrypt', 'decrypt']
    );
    return key;
  }

  // Export key to hex string for URL fragment
  async exportKeyToHex(key) {
    const exported = await crypto.subtle.exportKey('raw', key);
    return Array.from(new Uint8Array(exported))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
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

  // Encrypt file
  async encryptFile(file, key) {
    const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for GCM
    const fileBuffer = await file.arrayBuffer();
    
    const encrypted = await crypto.subtle.encrypt(
      {
        name: this.algorithm,
        iv: iv,
      },
      key,
      fileBuffer
    );

    // Combine IV and encrypted data
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encrypted), iv.length);
    
    return combined;
  }

  // Decrypt file
  async decryptFile(encryptedData, key) {
    const iv = encryptedData.slice(0, 12); // First 12 bytes are IV
    const ciphertext = encryptedData.slice(12); // Rest is encrypted data
    
    const decrypted = await crypto.subtle.decrypt(
      {
        name: this.algorithm,
        iv: iv,
      },
      key,
      ciphertext
    );
    
    return decrypted;
  }

  // Create encrypted blob for upload
  async createEncryptedBlob(file, key) {
    const encryptedData = await this.encryptFile(file, key);
    return new Blob([encryptedData], { type: 'application/octet-stream' });
  }

  // Execute operation in Web Worker with progress tracking
  executeWorkerOperation(type, data, onProgress) {
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        // Fallback to main thread if worker is not available
        console.warn(`e2ee: worker not available, using fallback for operation ${type}`);
        return this.fallbackOperation(type, data, onProgress).then(resolve).catch(reject);
      }
      
      const id = ++this.operationId;
      this.operations.set(id, { resolve, reject, onProgress });
      // Collect transferable objects (ArrayBuffers / TypedArrays) to avoid structured-clone copies
      const transfers = [];
      const collectTransfers = (obj) => {
        if (!obj) return;
        if (obj instanceof ArrayBuffer) {
          transfers.push(obj);
          return;
        }
        if (ArrayBuffer.isView(obj)) {
          transfers.push(obj.buffer);
          return;
        }
        if (Array.isArray(obj)) {
          for (const v of obj) collectTransfers(v);
          return;
        }
        if (typeof obj === 'object') {
          for (const v of Object.values(obj)) collectTransfers(v);
        }
      };

      collectTransfers(data);

      // Post message with transfer list when available
      try {
        // Log operation start (avoid logging sensitive data like keys)
        console.log(`e2ee: start op ${id} type=${type} transfers=${transfers.length}`);
        if (transfers.length) {
          this.worker.postMessage({ id, type, data }, transfers);
        } else {
          this.worker.postMessage({ id, type, data });
        }
      } catch (err) {
        // If transfer fails for any reason, fall back to normal postMessage
        console.warn('Transferable postMessage failed, falling back to clone:', err);
        this.worker.postMessage({ id, type, data });
      }
    });
  }

  // Fallback operations for main thread (simplified, no chunking)
  async fallbackOperation(type, data, onProgress) {
    switch (type) {
      case 'downloadAndDecrypt':
        const { url, keyHex } = data;
        onProgress && onProgress(10);
        
        const key = await this.importKeyFromHex(keyHex);
        onProgress && onProgress(30);
        
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Download failed: ${response.status}`);
        }
        
        onProgress && onProgress(60);
        const encryptedData = new Uint8Array(await response.arrayBuffer());
        onProgress && onProgress(80);
        
        const decryptedData = await this.decryptFile(encryptedData, key);
        onProgress && onProgress(100);
        
        return decryptedData;
        
      case 'encryptFile':
        const { fileBuffer, keyHex: encKeyHex } = data;
        onProgress && onProgress(20);
        
        const encKey = await this.importKeyFromHex(encKeyHex);
        onProgress && onProgress(50);
        
        const file = new File([fileBuffer], 'temp');
        const encrypted = await this.encryptFile(file, encKey);
        onProgress && onProgress(100);
        
        return encrypted;
        
      default:
        throw new Error(`Unknown operation: ${type}`);
    }
  }

  // Enhanced download and decrypt with progress callback
  async downloadAndDecrypt(url, keyHex, originalFilename, onProgress = null) {
    let perfId = null;
    
    try {
      // Start performance monitoring
      if (window.e2eePerfMonitor) {
        perfId = window.e2eePerfMonitor.startOperation('decrypt', 0); // File size unknown at start
      }
      
      const decryptedData = await this.executeWorkerOperation(
        'downloadAndDecrypt',
        { url, keyHex },
        onProgress
      );
      
      // Create download link
      const blob = new Blob([decryptedData]);
      const downloadUrl = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = originalFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      // Clean up
      URL.revokeObjectURL(downloadUrl);
      
      // End performance monitoring
      if (window.e2eePerfMonitor && perfId) {
        window.e2eePerfMonitor.endOperation(perfId, true);
      }
      
      return true;
    } catch (error) {
      // End performance monitoring with failure
      if (window.e2eePerfMonitor && perfId) {
        window.e2eePerfMonitor.endOperation(perfId, false);
      }
      
      console.error('Decryption failed:', error);
      throw error;
    }
  }

  // Enhanced encryption with progress callback
  async encryptFileWithProgress(file, keyHex, onProgress = null) {
    let perfId = null;
    
    try {
      // Start performance monitoring
      if (window.e2eePerfMonitor) {
        perfId = window.e2eePerfMonitor.startOperation('encrypt', file.size);
      }
      
      const fileBuffer = await file.arrayBuffer();
      const result = await this.executeWorkerOperation(
        'encryptFile',
        { fileBuffer, keyHex },
        onProgress
      );
      
      // End performance monitoring
      if (window.e2eePerfMonitor && perfId) {
        window.e2eePerfMonitor.endOperation(perfId, true);
      }
      
      // Result can be either raw data (fallback) or { data, originalSize, compressedSize }
      if (result.data) {
        // Worker returned compression metadata
        return {
          blob: new Blob([result.data], { type: 'application/octet-stream' }),
          originalSize: result.originalSize,
          compressedSize: result.compressedSize
        };
      } else {
        // Fallback path - just return blob
        return {
          blob: new Blob([result], { type: 'application/octet-stream' })
        };
      }
    } catch (error) {
      // End performance monitoring with failure
      if (window.e2eePerfMonitor && perfId) {
        window.e2eePerfMonitor.endOperation(perfId, false);
      }
      
      console.error('Encryption failed:', error);
      throw error;
    }
  }
}

// Global instance
window.e2eeCrypto = new E2EECrypto();

// Cleanup on page unload to prevent memory leaks
window.addEventListener('beforeunload', () => {
  if (window.e2eeCrypto) {
    window.e2eeCrypto.cleanup();
  }
});