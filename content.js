// Inject the interceptor script into the page
(function() {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('inject.js');
  script.onload = function() {
    this.remove();
  };

  // Try to inject as early as possible
  const target = document.head || document.documentElement;
  if (target) {
    target.appendChild(script);
  } else {
    // If document is not ready, wait for DOMContentLoaded
    document.addEventListener('DOMContentLoaded', function() {
      (document.head || document.documentElement).appendChild(script);
    });
  }
})();

// Determine if current context is an iframe
const isIframe = window !== window.top;
const frameUrl = window.location.href;

// Listen for messages from injected script
window.addEventListener('message', function(event) {
  // Only accept messages from the same window
  if (event.source !== window) return;

  // Check message source
  if (!event.data || event.data.source !== 'stream-panel-inject') return;

  const payload = event.data.payload;

  // Add frame information
  payload.isIframe = isIframe;
  payload.frameUrl = frameUrl;

  // Forward to background script
  try {
    chrome.runtime.sendMessage({
      source: 'stream-panel-content',
      payload: payload
    });
  } catch (e) {
    // Extension context may be invalidated
    console.warn('[Stream Panel] Failed to send message:', e.message);
  }
});

// Notify background that content script is ready
try {
  chrome.runtime.sendMessage({
    source: 'stream-panel-content',
    payload: {
      type: 'content-ready',
      isIframe: isIframe,
      frameUrl: frameUrl,
      timestamp: Date.now()
    }
  });
} catch (e) {
  // Ignore
}
