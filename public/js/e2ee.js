// E2EE Encryption/Decryption Module using Web Crypto API
class E2EECrypto {
  constructor() {
    this.algorithm = 'AES-GCM';
    this.keyLength = 256;
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

  // Download and decrypt file
  async downloadAndDecrypt(url, keyHex, originalFilename) {
    try {
      const key = await this.importKeyFromHex(keyHex);
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Download failed: ${response.status}`);
      }
      
      const encryptedData = new Uint8Array(await response.arrayBuffer());
      const decryptedData = await this.decryptFile(encryptedData, key);
      
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
      
      return true;
    } catch (error) {
      console.error('Decryption failed:', error);
      throw error;
    }
  }
}

// Global instance
window.e2eeCrypto = new E2EECrypto();