// Download page E2EE decryption handler
document.addEventListener('DOMContentLoaded', function() {
  const downloadBtn = document.getElementById('downloadBtn');
  const errorDiv = document.querySelector('.error-message');
  
  if (downloadBtn) {
    downloadBtn.addEventListener('click', handleE2EEDownload);
  }
  
  // Auto-extract key from URL fragment if present
  const urlFragment = window.location.hash.substring(1);
  if (urlFragment && urlFragment.length === 64) { // 32 bytes = 64 hex chars
    // Store the key for download
    window.encryptionKey = urlFragment;
    // Remove the key from URL for security
    history.replaceState(null, null, window.location.pathname + window.location.search);
  }
});

async function handleE2EEDownload(event) {
  event.preventDefault();
  
  const downloadBtn = event.target;
  const originalText = downloadBtn.textContent;
  const uuid = downloadBtn.dataset.uuid;
  const filename = downloadBtn.dataset.filename;
  
  if (!window.encryptionKey) {
    showError('Encryption key not found. Please use the original download link.');
    return;
  }
  
  try {
    downloadBtn.textContent = 'Decrypting...';
    downloadBtn.disabled = true;
    
    const downloadUrl = `/files/download/${uuid}`;
    await window.e2eeCrypto.downloadAndDecrypt(downloadUrl, window.encryptionKey, filename);
    
    downloadBtn.textContent = 'Downloaded!';
    setTimeout(() => {
      downloadBtn.textContent = originalText;
      downloadBtn.disabled = false;
    }, 2000);
    
  } catch (error) {
    console.error('Download/decryption failed:', error);
    showError('Failed to download or decrypt file. The file may be corrupted or the link is invalid.');
    downloadBtn.textContent = originalText;
    downloadBtn.disabled = false;
  }
}

function showError(message) {
  const errorDiv = document.querySelector('.error-message') || createErrorDiv();
  errorDiv.textContent = message;
  errorDiv.style.display = 'block';
}

function createErrorDiv() {
  const errorDiv = document.createElement('div');
  errorDiv.className = 'error-message';
  errorDiv.style.cssText = `
    background: #fee;
    border: 1px solid #fcc;
    color: #c33;
    padding: 10px;
    margin: 10px 0;
    border-radius: 4px;
    display: none;
  `;
  document.querySelector('.container').prepend(errorDiv);
  return errorDiv;
}