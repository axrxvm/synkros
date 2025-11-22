// P2P-optimized E2EE implementation
// Handles streaming encryption for large files in P2P transfers

// Export to window for use in HTML pages
window.p2pEncryption = window.p2pEncryption || {};
class P2PEncryption {
  constructor() {
    this.algorithm = 'AES-GCM';
    this.keyLength = 256;
  }

  // Generate encryption key
  async generateKey() {
    const key = await crypto.subtle.generateKey(
      {
        name: this.algorithm,
        length: this.keyLength,
      },
      true,
      ['encrypt', 'decrypt']
    );
    return key;
  }

  // Export key to hex for URL sharing
  async exportKeyToHex(key) {
    const exported = await crypto.subtle.exportKey('raw', key);
    return Array.from(new Uint8Array(exported))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  // Import key from hex
  async importKeyFromHex(hexKey) {
    console.log('P2P: importKeyFromHex called with hex length:', hexKey?.length);
    const keyData = new Uint8Array(
      hexKey.match(/.{2}/g).map(byte => parseInt(byte, 16))
    );
    const importedKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: this.algorithm },
      true,
      ['encrypt', 'decrypt']
    );
    console.log('P2P: importKeyFromHex result type:', importedKey?.type, 'constructor:', importedKey?.constructor?.name);
    return importedKey;
  }

  // Encrypt file using Web Worker (hybrid approach for large files)
  // keyOrHex can be a CryptoKey or a hex string. If hex is provided
  // we'll import it as an extractable CryptoKey but also keep the hex
  // so worker-based encryption can avoid exporting non-extractable keys.
  async encryptFileForP2P(file, keyOrHex, progressCallback) {
    try {
      console.log('P2P: encryptFileForP2P called with keyOrHex type:', typeof keyOrHex, 'value:', keyOrHex?.type || 'not a CryptoKey');
      let key;
      let keyHex = null;

      if (typeof keyOrHex === 'string') {
        // Store hex for worker use
        keyHex = keyOrHex;
        console.log('P2P: Importing key from hex string...');
        // Import as extractable CryptoKey for crypto operations
        key = await this.importKeyFromHex(keyOrHex);
        console.log('P2P: Key imported successfully, type:', key?.type);
      } else if (keyOrHex && keyOrHex.type === 'secret') {
        // Already a CryptoKey
        key = keyOrHex;
        console.log('P2P: Using CryptoKey directly for encryption');
      } else {
        console.error('P2P: Invalid key type detected:', keyOrHex);
        throw new Error('Invalid key type: must be hex string or CryptoKey');
      }

      console.log('P2P: About to encrypt, key is:', key?.type, 'file size:', file.size);

      // For small files (<10MB), encrypt in main thread
      if (file.size < 10 * 1024 * 1024) {
        console.log('P2P: Using main thread encryption for small file');
        return await this.encryptInMainThread(file, key, progressCallback);
      }

      // For large files, use Web Worker
      console.log('P2P: Using worker encryption for large file');
      return await this.encryptWithWorker(file, key, progressCallback, keyHex);
    } catch (error) {
      console.error('P2P encryption error:', error);
      throw error;
    }
  }

  // Encrypt in main thread (for small files)
  async encryptInMainThread(file, key, progressCallback) {
    console.log('P2P: encryptInMainThread called with key type:', key?.type, 'key object:', key);
    if (!key || !key.type || key.type !== 'secret') {
      console.error('P2P: Invalid CryptoKey in encryptInMainThread:', key);
      throw new Error('Invalid CryptoKey provided to encryptInMainThread');
    }

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const fileBuffer = await file.arrayBuffer();

    if (progressCallback) progressCallback(30);

    console.log('P2P: About to call crypto.subtle.encrypt with key:', key);
    const encrypted = await crypto.subtle.encrypt(
      {
        name: this.algorithm,
        iv: iv,
      },
      key,
      fileBuffer
    );

    if (progressCallback) progressCallback(90);

    // Combine IV and encrypted data
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encrypted), iv.length);

    if (progressCallback) progressCallback(100);

    return new Blob([combined]);
  }

  // Encrypt with Web Worker (for large files)
  async encryptWithWorker(file, key, progressCallback, keyHex = null) {
    return new Promise(async (resolve, reject) => {
      // Use global e2eeCrypto instance if available
      if (window.e2eeCrypto && window.e2eeCrypto.worker) {
        try {
          // If we already have the keyHex (caller provided), use it and avoid
          // exporting the CryptoKey which may be non-extractable.
          if (!keyHex) {
            // try to export; if it fails it will throw and fall back
            keyHex = await this.exportKeyToHex(key);
          }

          const fileBuffer = await file.arrayBuffer();
          const encrypted = await window.e2eeCrypto.encryptFileWithProgress(
            fileBuffer,
            keyHex,
            progressCallback
          );
          resolve(new Blob([encrypted]));
        } catch (error) {
          reject(error);
        }
      } else {
        // Fallback to main thread
        resolve(await this.encryptInMainThread(file, key, progressCallback));
      }
    });
  }

  // Decrypt received file chunk by chunk (streaming)
  async decryptReceivedFile(encryptedBlob, key, progressCallback) {
    try {
      const encryptedBuffer = await encryptedBlob.arrayBuffer();
      const encryptedData = new Uint8Array(encryptedBuffer);

      const iv = encryptedData.slice(0, 12);
      const ciphertext = encryptedData.slice(12);

      if (progressCallback) progressCallback(20);

      const decrypted = await crypto.subtle.decrypt(
        {
          name: this.algorithm,
          iv: iv,
        },
        key,
        ciphertext
      );

      if (progressCallback) progressCallback(100);

      return new Blob([decrypted]);
    } catch (error) {
      console.error('P2P decryption error:', error);
      throw error;
    }
  }

  // Create shareable room URL with encryption key
  createShareURL(roomCode, encryptionKey) {
    const baseURL = window.location.origin;
    return `${baseURL}/direct#${roomCode}:${encryptionKey}`;
  }

  // Parse room code and encryption key from URL
  parseShareURL() {
    const hash = window.location.hash.substring(1); // Remove #
    if (!hash) return null;

    const parts = hash.split(':');
    if (parts.length !== 2) return null;

    return {
      roomCode: parts[0],
      encryptionKey: parts[1],
    };
  }

  // Remove encryption key from URL (security)
  clearURLHash() {
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, null, window.location.pathname + window.location.search);
    } else {
      window.location.hash = '';
    }
  }
}

// Global instance
window.p2pEncryption = new P2PEncryption();
