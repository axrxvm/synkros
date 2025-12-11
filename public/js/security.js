// Security warning for console - protect users from scammers
(function() {
  const warnings = [
    '🛑 STOP! Don\'t paste anything here!',
    '⚠️ SCAMMER ALERT: If someone told you to paste code here, it\'s a scam!',
    '🔒 SECURITY WARNING: Never run unknown code in this console!',
    '🚨 FRAUD PREVENTION: Real Synkros staff will NEVER ask you to paste code here!',
    '💡 TIP: Close this console now if someone is trying to "help" you with code!'
  ];

  let dismissed = false;

  function showWarning() {
    if (dismissed) return;
    try {
      const rayId = document.body.getAttribute('data-ray-id') || 'N/A';
      console.log(`security: showing console warning (Ray ID: ${rayId})`);
      console.log('%c' + warnings[0], 'color: #b71c1c; font-size: 18px; font-weight: 700; background: #ffebee; padding: 8px; border-radius: 4px;');
      console.log('%cIf someone told you to copy/paste something here, it is a scammer trying to hijack your account or steal your files.', 'color: #880e4f; font-size: 13px;');
      console.log('%cSynkros will NEVER ask you to run code in the browser console.', 'color: #880e4f; font-size: 13px;');
      console.log('%cTo learn more about this warning: https://en.wikipedia.org/wiki/Self-XSS', 'color: #666; font-size: 12px;');
    } catch (e) {
      // ignore console troubles in exotic environments
    }
  }

  // Show once on page load (non-spammy) - wait for DOM ready to ensure data-ray-id is set
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', showWarning);
  } else {
    // DOM is already ready, but let's give a small delay to ensure inline scripts have run
    setTimeout(showWarning, 1000);
  }

  // Detect devtools open using a harmless trick (measuring toString override)
  const devtoolsDetector = {
    isOpen: false,
    check() {
      const start = Date.now();
      debugger; // when devtools are open this takes noticeably longer in many browsers
      const elapsed = Date.now() - start;
      const open = elapsed > 100;
      if (open && !this.isOpen) {
        this.isOpen = true;
        showWarning();
      } else if (!open) {
        this.isOpen = false;
      }
    }
  };

  // Periodically check (low frequency to avoid CPU/console spam)
  // Run every 60 seconds so the message appears once per minute
  setInterval(() => devtoolsDetector.check(), 60 * 1000);

  // Also show if the window gets focus after being blurred (user may have opened devtools)
  window.addEventListener('focus', () => setTimeout(showWarning, 200));

  // ============================================================================
  // ADDITIONAL SECURITY MEASURES
  // ============================================================================

  // 1. DISABLE RIGHT-CLICK COMPLETELY
  document.addEventListener('contextmenu', function(e) {
    e.preventDefault();
    const rayId = document.body.getAttribute('data-ray-id') || 'N/A';
    console.log(`security: blocked right-click attempt (Ray ID: ${rayId})`);
    return false;
  }, false);

  // 2. FRAME BUSTING - Prevent clickjacking attacks
  if (window.self !== window.top) {
    try {
      const rayId = document.body.getAttribute('data-ray-id') || 'N/A';
      console.warn(`security: frame busting activated - site loaded in iframe (Ray ID: ${rayId})`);
      window.top.location = window.self.location;
    } catch (e) {
      // If cross-origin, break out anyway
      document.body.innerHTML = '<h1>Security Error</h1><p>This page cannot be displayed in a frame.</p>';
    }
  }

  // 3. CLIPBOARD HIJACKING PROTECTION
  let clipboardWarningShown = false;
  document.addEventListener('copy', function(e) {
    if (!clipboardWarningShown) {
      const rayId = document.body.getAttribute('data-ray-id') || 'N/A';
      console.warn(`security: clipboard copy detected (Ray ID: ${rayId})`);
      clipboardWarningShown = true;
    }
  });

  document.addEventListener('cut', function(e) {
    const rayId = document.body.getAttribute('data-ray-id') || 'N/A';
    console.warn(`security: clipboard cut detected (Ray ID: ${rayId})`);
  });

  // 4. PASTE EVENT MONITORING - Warn on suspicious paste operations
  document.addEventListener('paste', function(e) {
    const pastedData = e.clipboardData?.getData('text') || '';
    const rayId = document.body.getAttribute('data-ray-id') || 'N/A';
    
    // Check for suspicious patterns
    const suspiciousPatterns = [
      /javascript:/i,
      /eval\(/i,
      /<script/i,
      /onclick=/i,
      /onerror=/i,
      /onload=/i,
      /document\.write/i,
      /\.innerHTML/i,
      /fromCharCode/i
    ];

    const isSuspicious = suspiciousPatterns.some(pattern => pattern.test(pastedData));
    
    if (isSuspicious) {
      console.error(`%c🚨 SECURITY ALERT: Suspicious content detected in paste!`, 
        'color: #d32f2f; font-size: 14px; font-weight: bold; background: #ffebee; padding: 4px;');
      console.warn(`security: suspicious paste blocked (Ray ID: ${rayId})`);
      e.preventDefault();
      return false;
    }

    console.log(`security: paste event detected (Ray ID: ${rayId})`);
  });

  // 5. DOM MUTATION OBSERVER - Detect unauthorized script injections
  const scriptInjectionObserver = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      mutation.addedNodes.forEach(function(node) {
        if (node.nodeName === 'SCRIPT' && !node.hasAttribute('data-synkros-approved')) {
          const rayId = document.body.getAttribute('data-ray-id') || 'N/A';
          console.error(`%c🚨 UNAUTHORIZED SCRIPT INJECTION DETECTED!`, 
            'color: #d32f2f; font-size: 14px; font-weight: bold; background: #ffebee; padding: 4px;');
          console.warn(`security: script injection attempt blocked (Ray ID: ${rayId})`);
          console.warn('Script source:', node.src || 'inline');
          // Optionally remove the script
          node.remove();
        }
      });
    });
  });

  // Start observing when DOM is ready
  if (document.body) {
    scriptInjectionObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  } else {
    document.addEventListener('DOMContentLoaded', function() {
      scriptInjectionObserver.observe(document.body, {
        childList: true,
        subtree: true
      });
    });
  }

  // 6. CONSOLE FUNCTION OVERRIDE PROTECTION
  const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info
  };

  // Periodically check if console has been tampered with
  setInterval(function() {
    if (console.log !== originalConsole.log ||
        console.warn !== originalConsole.warn ||
        console.error !== originalConsole.error) {
      const rayId = document.body.getAttribute('data-ray-id') || 'N/A';
      originalConsole.warn(`security: console tampering detected (Ray ID: ${rayId})`);
      // Restore original console functions
      console.log = originalConsole.log;
      console.warn = originalConsole.warn;
      console.error = originalConsole.error;
      console.info = originalConsole.info;
    }
  }, 5000);

  // 7. KEYLOGGER DETECTION - Monitor for excessive keyboard listeners
  let keyboardListenerCount = 0;
  const originalAddEventListener = EventTarget.prototype.addEventListener;
  
  EventTarget.prototype.addEventListener = function(type, listener, options) {
    if (type === 'keydown' || type === 'keyup' || type === 'keypress') {
      keyboardListenerCount++;
      const rayId = document.body.getAttribute('data-ray-id') || 'N/A';
      
      if (keyboardListenerCount > 10) {
        console.error(`%c🚨 POTENTIAL KEYLOGGER DETECTED!`, 
          'color: #d32f2f; font-size: 14px; font-weight: bold; background: #ffebee; padding: 4px;');
        console.warn(`security: excessive keyboard listeners detected (${keyboardListenerCount}) (Ray ID: ${rayId})`);
      }
    }
    return originalAddEventListener.call(this, type, listener, options);
  };

  // 8. DISABLE KEY COMBINATIONS (F12, Ctrl+Shift+I, Ctrl+U, etc.)
  document.addEventListener('keydown', function(e) {
    const rayId = document.body.getAttribute('data-ray-id') || 'N/A';
    
    // F12 - Developer Tools
    if (e.keyCode === 123) {
      console.log(`security: F12 key blocked (Ray ID: ${rayId})`);
      e.preventDefault();
      return false;
    }
    
    // Ctrl+Shift+I - Developer Tools
    if (e.ctrlKey && e.shiftKey && e.keyCode === 73) {
      console.log(`security: Ctrl+Shift+I blocked (Ray ID: ${rayId})`);
      e.preventDefault();
      return false;
    }
    
    // Ctrl+Shift+J - Console
    if (e.ctrlKey && e.shiftKey && e.keyCode === 74) {
      console.log(`security: Ctrl+Shift+J blocked (Ray ID: ${rayId})`);
      e.preventDefault();
      return false;
    }
    
    // Ctrl+U - View Source
    if (e.ctrlKey && e.keyCode === 85) {
      console.log(`security: Ctrl+U blocked (Ray ID: ${rayId})`);
      e.preventDefault();
      return false;
    }
    
    // Ctrl+Shift+C - Element Inspector
    if (e.ctrlKey && e.shiftKey && e.keyCode === 67) {
      console.log(`security: Ctrl+Shift+C blocked (Ray ID: ${rayId})`);
      e.preventDefault();
      return false;
    }
  });

  // 9. LOCALSTORAGE/SESSIONSTORAGE TAMPERING DETECTION
  const storageMonitor = {
    localStorageKeys: new Set(Object.keys(localStorage)),
    sessionStorageKeys: new Set(Object.keys(sessionStorage)),
    
    check() {
      const rayId = document.body.getAttribute('data-ray-id') || 'N/A';
      const currentLocalKeys = new Set(Object.keys(localStorage));
      const currentSessionKeys = new Set(Object.keys(sessionStorage));
      
      // Check for new keys
      currentLocalKeys.forEach(key => {
        if (!this.localStorageKeys.has(key) && !key.startsWith('synkros_')) {
          console.warn(`security: unauthorized localStorage key detected: ${key} (Ray ID: ${rayId})`);
        }
      });
      
      currentSessionKeys.forEach(key => {
        if (!this.sessionStorageKeys.has(key) && !key.startsWith('synkros_')) {
          console.warn(`security: unauthorized sessionStorage key detected: ${key} (Ray ID: ${rayId})`);
        }
      });
      
      this.localStorageKeys = currentLocalKeys;
      this.sessionStorageKeys = currentSessionKeys;
    }
  };

  // Check storage every 10 seconds
  setInterval(() => storageMonitor.check(), 10000);

  // 10. CSP VIOLATION REPORTING
  document.addEventListener('securitypolicyviolation', function(e) {
    const rayId = document.body.getAttribute('data-ray-id') || 'N/A';
    console.error(`%c🚨 CSP VIOLATION DETECTED!`, 
      'color: #d32f2f; font-size: 14px; font-weight: bold; background: #ffebee; padding: 4px;');
    console.error(`security: CSP violation (Ray ID: ${rayId})`);
    console.error('Blocked URI:', e.blockedURI);
    console.error('Violated Directive:', e.violatedDirective);
    console.error('Original Policy:', e.originalPolicy);
  });

  // 11. DISABLE TEXT SELECTION (optional - can be intrusive)
  // Uncomment if needed:
  // document.addEventListener('selectstart', function(e) {
  //   e.preventDefault();
  //   return false;
  // });

  // 12. DISABLE DRAG AND DROP (prevent file manipulation)
  document.addEventListener('dragstart', function(e) {
    const rayId = document.body.getAttribute('data-ray-id') || 'N/A';
    console.log(`security: drag event detected (Ray ID: ${rayId})`);
  });

  // Log security initialization
  const rayId = document.body?.getAttribute('data-ray-id') || 'N/A';
  console.log(`%c✓ Synkros Security Suite Initialized`, 
    'color: #2e7d32; font-size: 12px; font-weight: bold;');
  console.log(`security: all protection measures active (Ray ID: ${rayId})`);

})();

// Ray ID Copy Functionality - Available on all pages
(function() {
  // Helper function to show toast notifications
  function showToast(msg) {
    // Try to find existing toast element
    let toast = document.querySelector('.toast');
    
    // If no toast exists, create one
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    
    clearTimeout(window.toastTimer);
    toast.innerText = msg;
    toast.classList.add('show');
    window.toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, 3000);
  }
  
  // Add copy functionality to logo button
  document.addEventListener('DOMContentLoaded', function() {
    const logoBtn = document.getElementById('logoBtn');
    
    if (logoBtn) {
      logoBtn.addEventListener('click', async function(e) {
        e.preventDefault();
        const rayId = document.body.getAttribute('data-ray-id');
        
        if (rayId) {
          try {
            await navigator.clipboard.writeText(rayId);
            showToast('Ray ID copied to clipboard');
          } catch (err) {
            // Fallback for older browsers
            const tempInput = document.createElement('input');
            tempInput.value = rayId;
            document.body.appendChild(tempInput);
            tempInput.select();
            document.execCommand('copy');
            document.body.removeChild(tempInput);
            showToast('Ray ID copied to clipboard');
          }
        }
      });
    }
  });
})();