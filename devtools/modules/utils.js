// Utility functions module

export function log(...args) {
  if (window.__STREAM_PANEL_DEBUG__) {
    console.log('[Stream Panel DevTools]', ...args);
  }
}

export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (err) {
    console.warn('Clipboard API failed, falling back to execCommand:', err);
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '-9999px';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();

  try {
    const successful = document.execCommand('copy');
    document.body.removeChild(textarea);
    return successful;
  } catch (err) {
    console.error('Failed to copy:', err);
    document.body.removeChild(textarea);
    return false;
  }
}

export function formatTime(timestamp) {
  const date = new Date(timestamp);
  const timeStr = date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  const milliseconds = String(date.getMilliseconds()).padStart(3, '0');
  return `${timeStr}.${milliseconds}`;
}

export function formatTimestampForExport(timestamp) {
  const date = new Date(timestamp);
  return date.toISOString();
}

export function syntaxHighlight(json) {
  return json.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    function(match) {
      let cls = 'json-number';
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = 'json-key';
          match = match.slice(0, -1);
          return '<span class="' + cls + '">' + escapeHtml(match) + '</span>:';
        } else {
          cls = 'json-string';
        }
      } else if (/true|false/.test(match)) {
        cls = 'json-boolean';
      } else if (/null/.test(match)) {
        cls = 'json-null';
      }
      return '<span class="' + cls + '">' + escapeHtml(match) + '</span>';
    }
  );
}

export function getUrlPath(url) {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch (e) {
    return url;
  }
}

export function getRequestType(source) {
  if (!source) return 'unknown';
  const lowerSource = source.toLowerCase();
  if (lowerSource.includes('xmlhttprequest')) return 'xhr';
  if (lowerSource.includes('fetch')) return 'fetch';
  if (lowerSource.includes('eventsource')) return 'eventsource';
  return 'unknown';
}

export function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

export function getStatusText(status) {
  const statusMap = {
    'connecting': '连接中',
    'open': '已连接',
    'closed': '已关闭',
    'error': '错误'
  };
  return statusMap[status] || status;
}

export function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function downloadFile(content, filename, mimeType) {
  const bom = mimeType === 'text/csv' ? '\uFEFF' : '';
  const blob = new Blob([bom + content], { type: mimeType + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();

  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}
