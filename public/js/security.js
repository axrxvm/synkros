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

  // allow users to dismiss the warning explicitly from console

  // Show once on page load (non-spammy)
  showWarning();

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
})();