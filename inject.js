(function() {
  // Prevent multiple injections
  if (window.__STREAM_PANEL_INJECTED__) return;
  window.__STREAM_PANEL_INJECTED__ = true;

  const OriginalEventSource = window.EventSource;
  const OriginalFetch = window.fetch;
  const OriginalXHR = window.XMLHttpRequest;

  const DEBUG = false; // Set to true for debugging

  function log(...args) {
    if (DEBUG) {
      console.log('[Stream Panel]', ...args);
    }
  }

  // Generate unique ID
  function generateId() {
    return 'stream_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11);
  }

  // Send message to content script
  function postToContentScript(data) {
    window.postMessage({
      source: 'stream-panel-inject',
      payload: data
    }, '*');
  }

  // Parse SSE data from chunk
  function parseSSEEvents(text) {
    const events = [];
    const lines = text.split('\n');
    let currentEvent = { data: '', event: 'message', id: '' };

    for (const line of lines) {
      if (line.startsWith('data:')) {
        const data = line.slice(5).trim();
        currentEvent.data += (currentEvent.data ? '\n' : '') + data;
      } else if (line.startsWith('event:')) {
        currentEvent.event = line.slice(6).trim();
      } else if (line.startsWith('id:')) {
        currentEvent.id = line.slice(3).trim();
      } else if (line === '' && currentEvent.data) {
        events.push({ ...currentEvent });
        currentEvent = { data: '', event: 'message', id: '' };
      }
    }

    return events;
  }

  // ============================================
  // Intercept native EventSource
  // Standard SSE (Server-Sent Events) API
  // ============================================
  window.EventSource = function(url, options) {
    const es = new OriginalEventSource(url, options);
    const connectionId = generateId();
    let messageIndex = 0;

    // Resolve full URL
    const fullUrl = new URL(url, window.location.href).href;

    // Notify new connection
    postToContentScript({
      type: 'stream-connection',
      connectionId: connectionId,
      url: fullUrl,
      timestamp: Date.now(),
      readyState: es.readyState,
      source: 'EventSource'
    });

    // Listen for open event
    es.addEventListener('open', function() {
      postToContentScript({
        type: 'stream-open',
        connectionId: connectionId,
        timestamp: Date.now(),
        readyState: es.readyState
      });
    });

    // Intercept message event listeners
    const originalAddEventListener = es.addEventListener.bind(es);
    es.addEventListener = function(type, listener, options) {
      if (type === 'message' || type.startsWith('message')) {
        const wrappedListener = function(event) {
          messageIndex++;
          postToContentScript({
            type: 'stream-message',
            connectionId: connectionId,
            messageId: messageIndex,
            eventType: event.type,
            data: event.data,
            lastEventId: event.lastEventId || '',
            timestamp: Date.now()
          });
          listener.call(this, event);
        };
        return originalAddEventListener(type, wrappedListener, options);
      }
      return originalAddEventListener(type, listener, options);
    };

    // Intercept onmessage setter
    let _onmessage = null;
    Object.defineProperty(es, 'onmessage', {
      get: function() {
        return _onmessage;
      },
      set: function(handler) {
        _onmessage = handler;
        originalAddEventListener('message', function(event) {
          messageIndex++;
          postToContentScript({
            type: 'stream-message',
            connectionId: connectionId,
            messageId: messageIndex,
            eventType: event.type,
            data: event.data,
            lastEventId: event.lastEventId || '',
            timestamp: Date.now()
          });
        });
      }
    });

    // Listen for error event
    es.addEventListener('error', function() {
      postToContentScript({
        type: 'stream-error',
        connectionId: connectionId,
        timestamp: Date.now(),
        readyState: es.readyState
      });
    });

    // Intercept close method
    const originalClose = es.close.bind(es);
    es.close = function() {
      postToContentScript({
        type: 'stream-close',
        connectionId: connectionId,
        timestamp: Date.now()
      });
      return originalClose();
    };

    return es;
  };

  // Copy static properties
  window.EventSource.prototype = OriginalEventSource.prototype;
  window.EventSource.CONNECTING = OriginalEventSource.CONNECTING;
  window.EventSource.OPEN = OriginalEventSource.OPEN;
  window.EventSource.CLOSED = OriginalEventSource.CLOSED;

  // ============================================
  // Intercept Fetch-based SSE and Streaming Responses
  // Only intercepts: SSE (text/event-stream), NDJSON (application/x-ndjson)
  // Does NOT intercept regular JSON/text responses
  // ============================================
  window.fetch = async function(...args) {
    const response = await OriginalFetch.apply(this, args);

    // Get request URL
    let requestUrl = '';
    if (typeof args[0] === 'string') {
      requestUrl = args[0];
    } else if (args[0] instanceof Request) {
      requestUrl = args[0].url;
    } else if (args[0] && args[0].url) {
      requestUrl = args[0].url;
    }
    const fullUrl = new URL(requestUrl, window.location.href).href;

    // Check if response is streaming
    const contentType = response.headers.get('content-type') || '';

    log('Fetch intercepted:', fullUrl, 'Content-Type:', contentType);

    // Only detect true streaming responses by content-type
    // Do NOT use ReadableStream check as almost all fetch responses have it
    const isSSE = contentType.includes('text/event-stream');
    const isNDJSON = contentType.includes('application/x-ndjson') || contentType.includes('application/jsonlines');

    // If not a streaming response, return as-is
    if (!isSSE && !isNDJSON) {
      return response;
    }

    log('Detected streaming response!', {isSSE, isNDJSON});

    const connectionId = generateId();
    let messageIndex = 0;
    const streamType = isSSE ? 'SSE' : 'NDJSON';

    // Notify new connection
    postToContentScript({
      type: 'stream-connection',
      connectionId: connectionId,
      url: fullUrl,
      timestamp: Date.now(),
      readyState: 1,
      source: `fetch (${streamType})`
    });

    log('Created connection:', connectionId, streamType);

    // Notify open
    postToContentScript({
      type: 'stream-open',
      connectionId: connectionId,
      timestamp: Date.now(),
      readyState: 1
    });

    // Clone body to intercept
    if (!response.body) {
      return response;
    }

    const originalBody = response.body;
    const reader = originalBody.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    // Create a new ReadableStream that intercepts data
    const interceptedStream = new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              // Process any remaining buffer
              if (buffer.trim()) {
                if (isSSE) {
                  const events = parseSSEEvents(buffer);
                  for (const event of events) {
                    messageIndex++;
                    postToContentScript({
                      type: 'stream-message',
                      connectionId: connectionId,
                      messageId: messageIndex,
                      eventType: event.event,
                      data: event.data,
                      lastEventId: event.id,
                      timestamp: Date.now()
                    });
                  }
                } else if (isNDJSON) {
                  // Parse newline-delimited JSON
                  const lines = buffer.split('\n').filter(line => line.trim());
                  for (const line of lines) {
                    messageIndex++;
                    postToContentScript({
                      type: 'stream-message',
                      connectionId: connectionId,
                      messageId: messageIndex,
                      eventType: 'message',
                      data: line,
                      lastEventId: '',
                      timestamp: Date.now()
                    });
                  }
                }
              }

              postToContentScript({
                type: 'stream-close',
                connectionId: connectionId,
                timestamp: Date.now()
              });

              controller.close();
              break;
            }

            // Decode and buffer the chunk
            const chunk = decoder.decode(value, { stream: true });
            buffer += chunk;

            // Parse based on stream type
            if (isSSE) {
              // Parse complete SSE events from buffer
              const doubleNewlineIndex = buffer.lastIndexOf('\n\n');
              if (doubleNewlineIndex !== -1) {
                const completeData = buffer.substring(0, doubleNewlineIndex + 2);
                buffer = buffer.substring(doubleNewlineIndex + 2);

                const events = parseSSEEvents(completeData);
                for (const event of events) {
                  messageIndex++;
                  postToContentScript({
                    type: 'stream-message',
                    connectionId: connectionId,
                    messageId: messageIndex,
                    eventType: event.event,
                    data: event.data,
                    lastEventId: event.id,
                    timestamp: Date.now()
                  });
                }
              }
            } else if (isNDJSON) {
              // Parse newline-delimited JSON
              const lines = buffer.split('\n');
              // Keep the last incomplete line in buffer
              buffer = lines.pop() || '';

              for (const line of lines) {
                if (line.trim()) {
                  messageIndex++;
                  postToContentScript({
                    type: 'stream-message',
                    connectionId: connectionId,
                    messageId: messageIndex,
                    eventType: 'message',
                    data: line,
                    lastEventId: '',
                    timestamp: Date.now()
                  });
                }
              }
            }

            // Pass through the original data
            controller.enqueue(value);
          }
        } catch (error) {
          log('Stream error:', error);
          postToContentScript({
            type: 'stream-error',
            connectionId: connectionId,
            timestamp: Date.now(),
            error: error.message
          });
          controller.error(error);
        }
      },

      cancel() {
        log('Stream cancelled');
        postToContentScript({
          type: 'stream-close',
          connectionId: connectionId,
          timestamp: Date.now()
        });
        reader.cancel();
      }
    });

    // Create new response with intercepted body
    return new Response(interceptedStream, {
      headers: response.headers,
      status: response.status,
      statusText: response.statusText
    });
  };

  // ============================================
  // Intercept XMLHttpRequest for SSE and Streaming
  // Supports: text/event-stream, application/x-ndjson, application/jsonlines
  // ============================================
  window.XMLHttpRequest = function() {
    const xhr = new OriginalXHR();
    let connectionId = null;
    let messageIndex = 0;
    let requestUrl = '';
    let isStreamingResponse = false;
    let buffer = '';

    // Intercept open method to capture URL
    const originalOpen = xhr.open;
    xhr.open = function(method, url, ...args) {
      requestUrl = new URL(url, window.location.href).href;
      log('XHR open:', method, requestUrl);
      return originalOpen.call(this, method, url, ...args);
    };

    // Intercept send method to monitor streaming responses
    const originalSend = xhr.send;
    xhr.send = function(...args) {
      log('XHR send:', requestUrl);

      // Monitor readyState changes for streaming detection
      const originalOnReadyStateChange = xhr.onreadystatechange;
      xhr.onreadystatechange = function() {
        log('XHR readyState:', xhr.readyState, 'status:', xhr.status);

        // HEADERS_RECEIVED: Detect if response is streaming
        if (xhr.readyState === 2) {
          const contentType = xhr.getResponseHeader('content-type') || '';
          log('XHR Content-Type:', contentType);

          isStreamingResponse = contentType.includes('text/event-stream') ||
                                contentType.includes('application/x-ndjson') ||
                                contentType.includes('application/jsonlines');

          if (isStreamingResponse) {
            connectionId = generateId();
            messageIndex = 0;
            buffer = '';

            const streamType = contentType.includes('text/event-stream') ? 'SSE' :
                              contentType.includes('application/x-ndjson') ? 'NDJSON' : 'Stream';

            log('Detected XHR streaming response!', streamType);

            postToContentScript({
              type: 'stream-connection',
              connectionId: connectionId,
              url: requestUrl,
              timestamp: Date.now(),
              readyState: 1,
              source: `XMLHttpRequest (${streamType})`
            });

            postToContentScript({
              type: 'stream-open',
              connectionId: connectionId,
              timestamp: Date.now(),
              readyState: 1
            });
          }
        }

        // LOADING: Process streaming data chunks
        if (xhr.readyState === 3 && isStreamingResponse) {
          const contentType = xhr.getResponseHeader('content-type') || '';
          const currentText = xhr.responseText || '';

          // Extract only new data since last check
          const newData = currentText.substring(buffer.length);
          buffer = currentText;

          if (newData) {
            log('XHR received chunk, length:', newData.length);

            if (contentType.includes('text/event-stream')) {
              // Parse Server-Sent Events (SSE)
              const events = parseSSEEvents(newData);
              for (const event of events) {
                messageIndex++;
                postToContentScript({
                  type: 'stream-message',
                  connectionId: connectionId,
                  messageId: messageIndex,
                  eventType: event.event,
                  data: event.data,
                  lastEventId: event.id,
                  timestamp: Date.now()
                });
              }
            } else if (contentType.includes('application/x-ndjson') || contentType.includes('application/jsonlines')) {
              // Parse Newline-Delimited JSON (NDJSON)
              const lines = newData.split('\n').filter(line => line.trim());
              for (const line of lines) {
                messageIndex++;
                postToContentScript({
                  type: 'stream-message',
                  connectionId: connectionId,
                  messageId: messageIndex,
                  eventType: 'message',
                  data: line,
                  lastEventId: '',
                  timestamp: Date.now()
                });
              }
            } else {
              // Generic streaming data
              messageIndex++;
              postToContentScript({
                type: 'stream-message',
                connectionId: connectionId,
                messageId: messageIndex,
                eventType: 'message',
                data: newData,
                lastEventId: '',
                timestamp: Date.now()
              });
            }
          }
        }

        // DONE: Stream completed
        if (xhr.readyState === 4 && isStreamingResponse) {
          log('XHR stream completed');
          postToContentScript({
            type: 'stream-close',
            connectionId: connectionId,
            timestamp: Date.now()
          });
        }

        // Call original handler if exists
        if (originalOnReadyStateChange) {
          return originalOnReadyStateChange.apply(this, arguments);
        }
      };

      return originalSend.apply(this, args);
    };

    return xhr;
  };

  // Copy static properties
  window.XMLHttpRequest.prototype = OriginalXHR.prototype;
  window.XMLHttpRequest.UNSENT = OriginalXHR.UNSENT;
  window.XMLHttpRequest.OPENED = OriginalXHR.OPENED;
  window.XMLHttpRequest.HEADERS_RECEIVED = OriginalXHR.HEADERS_RECEIVED;
  window.XMLHttpRequest.LOADING = OriginalXHR.LOADING;
  window.XMLHttpRequest.DONE = OriginalXHR.DONE;

  console.log('[Stream Panel] EventSource, Fetch & XMLHttpRequest interceptor injected');
})();
