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
    // Store the key in memory only (not localStorage/sessionStorage for security)
    window.encryptionKey = urlFragment;
    // Remove the key from URL immediately for security
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
    // Initialize progress bar
    downloadBtn.disabled = true;
    downloadBtn.classList.add('progress-active');
    updateButtonProgress(downloadBtn, 0, 'Starting...');
    
    const downloadUrl = `/files/download/${uuid}`;
    
    // Download and decrypt with progress tracking
    await window.e2eeCrypto.downloadAndDecrypt(
      downloadUrl, 
      window.encryptionKey, 
      filename,
      (progress) => {
        // Update button progress bar
        let status = 'Downloading...';
        if (progress > 50) {
          status = 'Decrypting...';
        }
        if (progress >= 100) {
          status = 'Processing...';
        }
        updateButtonProgress(downloadBtn, progress, status);
      }
    );
    
    // Success state
    updateButtonProgress(downloadBtn, 100, 'Downloaded!');
    downloadBtn.classList.remove('progress-active');
    downloadBtn.classList.add('success');
    
    setTimeout(() => {
      downloadBtn.textContent = originalText;
      downloadBtn.disabled = false;
      downloadBtn.classList.remove('success');
      downloadBtn.style.setProperty('--progress', '0%');
    }, 2000);
    
  } catch (error) {
    console.error('Download/decryption failed:', error);
    
    // Provide more specific error messages
    let errorMessage = 'Failed to download or decrypt file.';
    let errorTitle = 'Download Failed';
    
    if (error.message.includes('Download failed')) {
      errorMessage = 'Failed to download file. Please check your internet connection and try again.';
    } else if (error.message.includes('decrypt')) {
      errorTitle = 'Decryption Failed';
      errorMessage = 'Failed to decrypt file. The file may be corrupted or the encryption key is invalid.';
    } else if (error.message.includes('Worker')) {
      errorTitle = 'Service Unavailable';
      errorMessage = 'Decryption service unavailable. Please refresh the page and try again.';
    }
    
    // Use error handler modal if available, otherwise fallback to inline error
    if (window.errorHandler) {
      window.errorHandler.showErrorModal(error, {
        action: 'file_download_decrypt',
        uuid: uuid,
        hasEncryptionKey: !!window.encryptionKey,
        downloadUrl: `/files/download/${uuid}`
      }, {
        title: errorTitle,
        message: errorMessage
      });
    } else {
      showError(errorMessage);
    }
    
    // Reset button state with error styling
    downloadBtn.textContent = 'Download Failed';
    downloadBtn.classList.remove('progress-active');
    downloadBtn.classList.add('error');
    downloadBtn.style.setProperty('--progress', '0%');
    
    // Reset to original state after delay
    setTimeout(() => {
      downloadBtn.textContent = originalText;
      downloadBtn.disabled = false;
      downloadBtn.classList.remove('error');
    }, 3000);
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

// Update button progress bar and text
function updateButtonProgress(button, progress, text) {
  const clampedProgress = Math.max(0, Math.min(100, progress));
  button.style.setProperty('--progress', `${clampedProgress}%`);
  button.textContent = text;
}