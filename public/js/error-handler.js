/**
 * Frontend Error Handler with System State Capture
 * Captures error context and generates copyable diagnostic info
 */

class ErrorHandler {
  constructor() {
    this.errors = [];
    this.maxErrors = 10; // Keep last 10 errors in memory
  }

  /**
   * Capture system state for debugging (no private info)
   * @returns {Object} System state snapshot
   */
  captureSystemState() {
    const state = {
      timestamp: new Date().toISOString(),
      rayId: document.body.getAttribute('data-ray-id') || 'N/A',
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      screenResolution: `${window.screen.width}x${window.screen.height}`,
      windowSize: `${window.innerWidth}x${window.innerHeight}`,
      url: window.location.pathname + window.location.search, // No hash to avoid exposing keys
      referrer: document.referrer || 'direct',
      online: navigator.onLine,
      cookiesEnabled: navigator.cookieEnabled,
      memory: this.getMemoryInfo(),
      connection: this.getConnectionInfo(),
    };

    return state;
  }

  /**
   * Get memory information if available
   * @returns {Object|null} Memory info or null
   */
  getMemoryInfo() {
    if (performance.memory) {
      return {
        jsHeapSizeLimit: this.formatBytes(performance.memory.jsHeapSizeLimit),
        totalJSHeapSize: this.formatBytes(performance.memory.totalJSHeapSize),
        usedJSHeapSize: this.formatBytes(performance.memory.usedJSHeapSize),
      };
    }
    return null;
  }

  /**
   * Get network connection info if available
   * @returns {Object|null} Connection info or null
   */
  getConnectionInfo() {
    if (navigator.connection || navigator.mozConnection || navigator.webkitConnection) {
      const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      return {
        effectiveType: conn.effectiveType || 'unknown',
        downlink: conn.downlink ? `${conn.downlink} Mbps` : 'unknown',
        rtt: conn.rtt ? `${conn.rtt} ms` : 'unknown',
        saveData: conn.saveData || false,
      };
    }
    return null;
  }

  /**
   * Format bytes to human readable
   * @param {number} bytes 
   * @returns {string}
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Log an error with context
   * @param {Error|string} error - Error object or message
   * @param {Object} context - Additional context
   */
  logError(error, context = {}) {
    const errorEntry = {
      id: this.generateErrorId(),
      timestamp: new Date().toISOString(),
      message: error.message || error.toString(),
      stack: error.stack || null,
      type: error.name || 'Error',
      context: context,
      systemState: this.captureSystemState(),
    };

    // Add to errors array (keep last N)
    this.errors.push(errorEntry);
    if (this.errors.length > this.maxErrors) {
      this.errors.shift();
    }

    // Log to console for debugging
    console.error('[ErrorHandler]', errorEntry);

    return errorEntry;
  }

  /**
   * Generate a unique error ID
   * @returns {string}
   */
  generateErrorId() {
    return 'ERR-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Generate copyable diagnostic report
   * @param {Object} errorEntry - Specific error entry or latest
   * @returns {string} Formatted diagnostic text
   */
  generateDiagnosticReport(errorEntry = null) {
    const err = errorEntry || this.errors[this.errors.length - 1];
    
    if (!err) {
      return 'No error information available.';
    }

    let report = '';
    report += '=== SYNKROS ERROR REPORT ===\n\n';
    report += `Error ID: ${err.id}\n`;
    report += `Ray ID: ${err.systemState.rayId}\n`;
    report += `Timestamp: ${err.timestamp}\n`;
    report += `Error Type: ${err.type}\n`;
    report += `Message: ${err.message}\n\n`;

    // Add context if available
    if (Object.keys(err.context).length > 0) {
      report += '--- Error Context ---\n';
      report += JSON.stringify(err.context, null, 2) + '\n\n';
    }

    // System State
    report += '--- System State ---\n';
    report += `URL: ${err.systemState.url}\n`;
    report += `User Agent: ${err.systemState.userAgent}\n`;
    report += `Platform: ${err.systemState.platform}\n`;
    report += `Language: ${err.systemState.language}\n`;
    report += `Screen: ${err.systemState.screenResolution}\n`;
    report += `Window: ${err.systemState.windowSize}\n`;
    report += `Online: ${err.systemState.online}\n`;
    report += `Cookies: ${err.systemState.cookiesEnabled}\n`;

    if (err.systemState.memory) {
      report += '\n--- Memory Info ---\n';
      report += `Heap Limit: ${err.systemState.memory.jsHeapSizeLimit}\n`;
      report += `Total Heap: ${err.systemState.memory.totalJSHeapSize}\n`;
      report += `Used Heap: ${err.systemState.memory.usedJSHeapSize}\n`;
    }

    if (err.systemState.connection) {
      report += '\n--- Connection Info ---\n';
      report += `Type: ${err.systemState.connection.effectiveType}\n`;
      report += `Downlink: ${err.systemState.connection.downlink}\n`;
      report += `RTT: ${err.systemState.connection.rtt}\n`;
      report += `Save Data: ${err.systemState.connection.saveData}\n`;
    }

    // Stack trace (truncated for readability)
    if (err.stack) {
      report += '\n--- Stack Trace ---\n';
      const stackLines = err.stack.split('\n').slice(0, 10); // First 10 lines
      report += stackLines.join('\n') + '\n';
      if (err.stack.split('\n').length > 10) {
        report += '... (truncated)\n';
      }
    }

    report += '\n=== END REPORT ===\n';
    report += '\nTo report this issue, please include this report when contacting support.\n';

    return report;
  }

  /**
   * Copy diagnostic report to clipboard
   * @param {Object} errorEntry - Specific error or latest
   * @returns {Promise<boolean>} Success status
   */
  async copyDiagnosticReport(errorEntry = null) {
    const report = this.generateDiagnosticReport(errorEntry);
    
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(report);
        return true;
      } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = report;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        const success = document.execCommand('copy');
        document.body.removeChild(textArea);
        
        return success;
      }
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
      return false;
    }
  }

  /**
   * Show error modal with copy functionality
   * @param {Error|string} error - Error object or message
   * @param {Object} context - Additional context
   * @param {Object} options - Display options
   */
  showErrorModal(error, context = {}, options = {}) {
    const errorEntry = this.logError(error, context);
    
    // Create modal HTML
    const modal = this.createErrorModal(errorEntry, options);
    document.body.appendChild(modal);

    // Auto-show modal
    setTimeout(() => modal.classList.add('show'), 10);

    return errorEntry;
  }

  /**
   * Create error modal DOM element
   * @param {Object} errorEntry - Error entry
   * @param {Object} options - Display options
   * @returns {HTMLElement} Modal element
   */
  createErrorModal(errorEntry, options = {}) {
    const modal = document.createElement('div');
    modal.className = 'error-modal-overlay';
    modal.id = `error-modal-${errorEntry.id}`;

    const title = options.title || 'An Error Occurred';
    const message = options.message || errorEntry.message;
    const showTechnical = options.showTechnical !== false;

    modal.innerHTML = `
      <div class="error-modal">
        <div class="error-modal-header">
          <h2>${this.escapeHtml(title)}</h2>
          <button class="error-modal-close" aria-label="Close">×</button>
        </div>
        <div class="error-modal-body">
          <div class="error-icon">⚠️</div>
          <p class="error-message">${this.escapeHtml(message)}</p>
          ${showTechnical ? `
            <div class="error-details">
              <p class="error-meta">
                <strong>Error ID:</strong> <code>${errorEntry.id}</code><br>
                <strong>Ray ID:</strong> <code>${errorEntry.systemState.rayId}</code><br>
                <strong>Time:</strong> ${new Date(errorEntry.timestamp).toLocaleString()}
              </p>
            </div>
          ` : ''}
        </div>
        <div class="error-modal-footer">
          <button class="error-btn error-btn-copy" data-error-id="${errorEntry.id}">
            📋 Copy Error Report
          </button>
          <button class="error-btn error-btn-dismiss">
            Dismiss
          </button>
        </div>
      </div>
    `;

    // Event listeners
    const closeBtn = modal.querySelector('.error-modal-close');
    const dismissBtn = modal.querySelector('.error-btn-dismiss');
    const copyBtn = modal.querySelector('.error-btn-copy');

    const closeModal = () => {
      modal.classList.remove('show');
      setTimeout(() => modal.remove(), 300);
    };

    closeBtn.addEventListener('click', closeModal);
    dismissBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    copyBtn.addEventListener('click', async () => {
      const success = await this.copyDiagnosticReport(errorEntry);
      if (success) {
        copyBtn.innerHTML = '✅ Copied!';
        copyBtn.disabled = true;
        setTimeout(() => {
          copyBtn.innerHTML = '📋 Copy Error Report';
          copyBtn.disabled = false;
        }, 2000);
      } else {
        copyBtn.innerHTML = '❌ Copy Failed';
        setTimeout(() => {
          copyBtn.innerHTML = '📋 Copy Error Report';
        }, 2000);
      }
    });

    return modal;
  }

  /**
   * Escape HTML to prevent XSS
   * @param {string} text 
   * @returns {string}
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Get all logged errors
   * @returns {Array} Array of error entries
   */
  getErrors() {
    return [...this.errors];
  }

  /**
   * Clear all logged errors
   */
  clearErrors() {
    this.errors = [];
  }
}

// Initialize global error handler
window.errorHandler = new ErrorHandler();

// Global error event listeners
window.addEventListener('error', (event) => {
  window.errorHandler.logError(event.error || event.message, {
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
  });
});

window.addEventListener('unhandledrejection', (event) => {
  window.errorHandler.logError(event.reason, {
    type: 'UnhandledPromiseRejection',
    promise: 'Promise rejection not handled',
  });
});

console.log('[ErrorHandler] Initialized - Use window.errorHandler to access');
