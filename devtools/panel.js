// Panel state
const state = {
  connections: {},
  selectedConnectionId: null,
  selectedMessageId: null,
  filter: '',
  messageFilters: [], // Applied filters
  pendingFilters: [], // Filters being edited, not yet applied
  searchQuery: '' // Message search query
};

// DOM elements
const elements = {
  connectionList: document.getElementById('connection-list'),
  messageTbody: document.getElementById('message-tbody'),
  messageEmpty: document.getElementById('message-empty'),
  messageListView: document.getElementById('message-list-view'),
  detailView: document.getElementById('detail-view'),
  detailTitle: document.getElementById('detail-title'),
  detailJson: document.getElementById('detail-json'),
  btnClear: document.getElementById('btn-clear'),
  btnBack: document.getElementById('btn-back'),
  btnCopy: document.getElementById('btn-copy'),
  btnReplay: document.getElementById('btn-replay'),
  btnStats: document.getElementById('btn-stats'),
  filterInput: document.getElementById('filter-input'),
  messageFilterContainer: document.getElementById('message-filter-container'),
  filterConditions: document.getElementById('filter-conditions'),
  filterStats: document.getElementById('filter-stats'),
  btnAddFilter: document.getElementById('btn-add-filter'),
  btnApplyFilters: document.getElementById('btn-apply-filters'),
  btnClearFilters: document.getElementById('btn-clear-filters'),
  btnToggleFilter: document.getElementById('btn-toggle-filter'),
  btnSavePreset: document.getElementById('btn-save-preset'),
  btnLoadPreset: document.getElementById('btn-load-preset'),
  messageSearchInput: document.getElementById('message-search-input'),
  btnClearSearch: document.getElementById('btn-clear-search'),
  // Export elements
  exportDropdown: document.querySelector('.export-dropdown'),
  btnExport: document.getElementById('btn-export'),
  exportMenu: document.getElementById('export-menu'),
  // Modal elements
  presetModal: document.getElementById('preset-modal'),
  presetModalTitle: document.getElementById('preset-modal-title'),
  presetModalBody: document.getElementById('preset-modal-body'),
  presetModalFooter: document.getElementById('preset-modal-footer'),
  presetModalClose: document.getElementById('preset-modal-close'),
  statsModal: document.getElementById('stats-modal'),
  statsModalBody: document.getElementById('stats-modal-body'),
  statsModalClose: document.getElementById('stats-modal-close')
};

// Connect to background script
const port = chrome.runtime.connect({ name: 'stream-panel' });

port.postMessage({
  type: 'init',
  tabId: chrome.devtools.inspectedWindow.tabId
});

// Handle messages from background
port.onMessage.addListener(function(message) {
  switch (message.type) {
    case 'init-data':
      // Initialize with existing data
      state.connections = message.data.connections || {};
      renderConnectionList();
      break;

    case 'stream-event':
      handleStreamEvent(message.payload);
      break;

    case 'navigation':
      // Clear on navigation
      state.connections = {};
      state.selectedConnectionId = null;
      state.selectedMessageId = null;
      renderConnectionList();
      renderMessageList();
      showListView();
      break;
  }
});

// Handle stream events
function handleStreamEvent(payload) {
  switch (payload.type) {
    case 'stream-connection':
      // Always create a new connection, even if URL is duplicate
      state.connections[payload.connectionId] = {
        id: payload.connectionId,
        url: payload.url,
        frameUrl: payload.frameUrl,
        isIframe: payload.isIframe,
        status: 'connecting',
        createdAt: payload.timestamp,
        messages: []
      };
      renderConnectionList();
      break;

    case 'stream-open':
      if (state.connections[payload.connectionId]) {
        state.connections[payload.connectionId].status = 'open';
        renderConnectionList();
      }
      break;

    case 'stream-message':
      if (state.connections[payload.connectionId]) {
        state.connections[payload.connectionId].messages.push({
          id: payload.messageId,
          eventType: payload.eventType,
          data: payload.data,
          lastEventId: payload.lastEventId,
          timestamp: payload.timestamp
        });
        renderConnectionList();
        if (state.selectedConnectionId === payload.connectionId) {
          renderMessageList();
        }
      }
      break;

    case 'stream-error':
      if (state.connections[payload.connectionId]) {
        state.connections[payload.connectionId].status = 'error';
        renderConnectionList();
      }
      break;

    case 'stream-close':
      if (state.connections[payload.connectionId]) {
        state.connections[payload.connectionId].status = 'closed';
        renderConnectionList();
      }
      break;
  }
}

// Render connection list
function renderConnectionList() {
  const connections = Object.values(state.connections);
  const filter = state.filter.toLowerCase();

  // Filter connections
  const filtered = filter
    ? connections.filter(c => c.url.toLowerCase().includes(filter))
    : connections;

  // Sort by creation time (newest first)
  filtered.sort((a, b) => b.createdAt - a.createdAt);

  if (filtered.length === 0) {
    elements.connectionList.innerHTML = '<div class="empty-state">暂无连接</div>';
    return;
  }

  elements.connectionList.innerHTML = filtered.map(conn => {
    const urlPath = getUrlPath(conn.url);
    const isSelected = conn.id === state.selectedConnectionId;
    const badgeClass = conn.isIframe ? 'badge-iframe' : 'badge-main';
    const badgeText = conn.isIframe ? 'iframe' : '主页面';
    const statusClass = `status-${conn.status}`;

    return `
      <div class="connection-item ${isSelected ? 'selected' : ''}" data-id="${conn.id}">
        <div class="connection-url">${escapeHtml(urlPath)}</div>
        <div class="connection-meta">
          <span class="status-dot ${statusClass}"></span>
          <span class="connection-badge ${badgeClass}">${badgeText}</span>
          <span class="message-count">${conn.messages.length} 条</span>
        </div>
      </div>
    `;
  }).join('');

  // Add click handlers
  elements.connectionList.querySelectorAll('.connection-item').forEach(item => {
    item.addEventListener('click', () => {
      selectConnection(item.dataset.id);
    });
  });
}

// Select a connection
function selectConnection(connectionId) {
  state.selectedConnectionId = connectionId;
  state.selectedMessageId = null;
  
  // Sync pending filters with applied filters when switching connection
  state.pendingFilters = JSON.parse(JSON.stringify(state.messageFilters));
  
  renderConnectionList();
  renderMessageList();
  showListView();
  
  // Show filter container if filters exist
  if (state.pendingFilters.length > 0) {
    elements.messageFilterContainer.style.display = 'block';
    elements.btnToggleFilter.classList.add('expanded');
    renderFilterConditions();
  }
}

// Extract all fields from JSON data recursively
function extractFields(obj, prefix = '', fields = new Set()) {
  if (obj === null || obj === undefined) {
    return fields;
  }

  if (Array.isArray(obj)) {
    // For arrays, check the first element if it exists
    if (obj.length > 0 && typeof obj[0] === 'object') {
      extractFields(obj[0], prefix, fields);
    }
    return fields;
  }

  if (typeof obj === 'object') {
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const fieldPath = prefix ? `${prefix}.${key}` : key;
        fields.add(fieldPath);
        
        // Recursively extract nested fields
        if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
          extractFields(obj[key], fieldPath, fields);
        } else if (Array.isArray(obj[key]) && obj[key].length > 0 && typeof obj[key][0] === 'object') {
          extractFields(obj[key][0], fieldPath, fields);
        }
      }
    }
  }

  return fields;
}

// Get all available fields from current connection's messages
function getAvailableFields() {
  const connection = state.connections[state.selectedConnectionId];
  if (!connection || !connection.messages) {
    return [];
  }

  const fieldsSet = new Set();
  
  connection.messages.forEach(msg => {
    try {
      const parsed = JSON.parse(msg.data);
      extractFields(parsed, '', fieldsSet);
    } catch (e) {
      // Not JSON, skip
    }
  });

  return Array.from(fieldsSet).sort();
}

// Get nested field value from object using dot notation
function getNestedValue(obj, path) {
  const keys = path.split('.');
  let value = obj;
  
  for (const key of keys) {
    if (value === null || value === undefined) {
      return undefined;
    }
    value = value[key];
  }
  
  return value;
}

// Filter messages based on current filters
function filterMessages(messages) {
  if (state.messageFilters.length === 0) {
    return messages;
  }

  return messages.filter(msg => {
    try {
      const parsed = JSON.parse(msg.data);
      
      // All filters must match (AND logic)
      return state.messageFilters.every(filter => {
        const fieldValue = getNestedValue(parsed, filter.field);
        
        if (fieldValue === undefined) {
          return false;
        }

        const fieldValueStr = String(fieldValue);
        const filterValueStr = String(filter.value);

        if (filter.mode === 'equals') {
          return fieldValueStr === filterValueStr;
        } else if (filter.mode === 'contains') {
          return fieldValueStr.includes(filterValueStr);
        }
        
        return true;
      });
    } catch (e) {
      // Not JSON, skip filtering for this message
      return false;
    }
  });
}

// Render message list
function renderMessageList() {
  const connection = state.connections[state.selectedConnectionId];

  if (!connection || connection.messages.length === 0) {
    elements.messageTbody.innerHTML = '';
    elements.messageEmpty.style.display = 'flex';
    elements.messageTbody.parentElement.style.display = 'none';
    return;
  }

  elements.messageEmpty.style.display = 'none';
  elements.messageTbody.parentElement.style.display = 'flex';

  // Apply filters
  const filteredMessages = filterMessages(connection.messages);
  
  // Update filter stats
  updateFilterStats(filteredMessages.length, connection.messages.length);

  elements.messageTbody.innerHTML = filteredMessages.map(msg => {
    const time = formatTime(msg.timestamp);

    return `
      <div class="message-row" data-id="${msg.id}">
        <div class="message-cell col-id">${msg.id}</div>
        <div class="message-cell col-type">${escapeHtml(msg.eventType)}</div>
        <div class="message-cell col-data">${escapeHtml(msg.data)}</div>
        <div class="message-cell col-time">${time}</div>
      </div>
    `;
  }).join('');

  // Add click handlers
  elements.messageTbody.querySelectorAll('.message-row').forEach(row => {
    row.addEventListener('click', () => {
      showMessageDetail(parseInt(row.dataset.id));
    });
  });

  // Update filter UI if filters exist
  if (state.messageFilters.length > 0) {
    renderFilterConditions();
  }
}

// Show message detail
function showMessageDetail(messageId) {
  const connection = state.connections[state.selectedConnectionId];
  if (!connection) return;

  const message = connection.messages.find(m => m.id === messageId);
  if (!message) return;

  state.selectedMessageId = messageId;

  // Update detail view
  elements.detailTitle.textContent = `消息 #${messageId} - ${message.eventType}`;

  // Format and highlight JSON
  let formattedData;
  try {
    const parsed = JSON.parse(message.data);
    formattedData = syntaxHighlight(JSON.stringify(parsed, null, 2));
  } catch (e) {
    formattedData = escapeHtml(message.data);
  }

  elements.detailJson.innerHTML = formattedData;

  // Show detail view
  showDetailView();
}

// View switching
function showListView() {
  elements.messageListView.classList.add('active');
  elements.detailView.classList.remove('active');
}

function showDetailView() {
  elements.messageListView.classList.remove('active');
  elements.detailView.classList.add('active');
}

// Event handlers
elements.btnClear.addEventListener('click', () => {
  state.connections = {};
  state.selectedConnectionId = null;
  state.selectedMessageId = null;
  renderConnectionList();
  renderMessageList();
  showListView();

  // Notify background to clear data
  port.postMessage({ type: 'clear' });
});

elements.btnBack.addEventListener('click', () => {
  showListView();
});

elements.btnCopy.addEventListener('click', () => {
  const connection = state.connections[state.selectedConnectionId];
  if (!connection) return;

  const message = connection.messages.find(m => m.id === state.selectedMessageId);
  if (!message) return;

  copyToClipboard(message.data);
});

elements.filterInput.addEventListener('input', (e) => {
  state.filter = e.target.value;
  renderConnectionList();
});

// Add filter condition
function addFilterCondition() {
  const availableFields = getAvailableFields();
  if (availableFields.length === 0) {
    alert('当前没有可用的字段，请先选择连接并等待消息数据。');
    return;
  }

  state.pendingFilters.push({
    field: availableFields[0] || '',
    mode: 'equals',
    value: ''
  });

  elements.messageFilterContainer.style.display = 'block';
  elements.btnToggleFilter.classList.add('expanded');
  renderFilterConditions();
}

// Remove filter condition
function removeFilterCondition(index) {
  state.pendingFilters.splice(index, 1);
  // Sync to applied filters and re-render
  state.messageFilters = JSON.parse(JSON.stringify(state.pendingFilters));
  renderFilterConditions();
  renderMessageList();
}

// Clear all filters
function clearAllFilters() {
  state.pendingFilters = [];
  state.messageFilters = [];
  elements.messageFilterContainer.style.display = 'none';
  elements.btnToggleFilter.classList.remove('expanded');
  renderFilterConditions();
  renderMessageList();
}

// Apply filters
function applyFilters() {
  // Copy pending filters to active filters
  state.messageFilters = JSON.parse(JSON.stringify(state.pendingFilters));
  renderMessageList();
}

// Update pending filter condition
function updatePendingFilterCondition(index, field, mode, value) {
  if (state.pendingFilters[index]) {
    state.pendingFilters[index].field = field;
    state.pendingFilters[index].mode = mode;
    state.pendingFilters[index].value = value;
  }
}

// Render filter conditions
function renderFilterConditions() {
  const availableFields = getAvailableFields();

  elements.filterConditions.innerHTML = state.pendingFilters.map((filter, index) => {
    return `
      <div class="filter-row" data-index="${index}">
        <div class="filter-field-autocomplete" data-index="${index}">
          <input type="text" class="filter-field-input" data-index="${index}"
                 placeholder="输入或选择字段..."
                 value="${escapeHtml(filter.field)}"
                 autocomplete="off">
          <div class="filter-field-dropdown" data-index="${index}"></div>
        </div>
        <select class="filter-mode-select" data-index="${index}">
          <option value="equals" ${filter.mode === 'equals' ? 'selected' : ''}>全等</option>
          <option value="contains" ${filter.mode === 'contains' ? 'selected' : ''}>包含</option>
        </select>
        <input type="text" class="filter-value-input" data-index="${index}"
               placeholder="输入筛选值..." value="${escapeHtml(filter.value)}">
        <button class="filter-remove-btn" data-index="${index}" title="删除">×</button>
      </div>
    `;
  }).join('');

  // Add event listeners for field autocomplete
  elements.filterConditions.querySelectorAll('.filter-field-input').forEach(input => {
    const index = parseInt(input.dataset.index);
    const dropdown = input.parentElement.querySelector('.filter-field-dropdown');

    // Show dropdown on focus or input
    const showDropdown = () => {
      const searchValue = input.value.toLowerCase();
      const filteredFields = availableFields.filter(field =>
        field.toLowerCase().includes(searchValue)
      );

      if (filteredFields.length > 0) {
        dropdown.innerHTML = filteredFields.map(field =>
          `<div class="dropdown-item" data-value="${escapeHtml(field)}">${escapeHtml(field)}</div>`
        ).join('');
        dropdown.style.display = 'block';

        // Add click listeners to dropdown items
        dropdown.querySelectorAll('.dropdown-item').forEach(item => {
          item.addEventListener('click', () => {
            input.value = item.dataset.value;
            dropdown.style.display = 'none';
            const filter = state.pendingFilters[index];
            updatePendingFilterCondition(index, item.dataset.value, filter.mode, filter.value);
          });
        });
      } else {
        dropdown.style.display = 'none';
      }
    };

    input.addEventListener('focus', showDropdown);
    input.addEventListener('input', (e) => {
      const filter = state.pendingFilters[index];
      updatePendingFilterCondition(index, e.target.value, filter.mode, filter.value);
      showDropdown();
    });

    // Close dropdown when clicking outside
    input.addEventListener('blur', () => {
      // Delay to allow click on dropdown items
      setTimeout(() => {
        dropdown.style.display = 'none';
      }, 200);
    });
  });

  elements.filterConditions.querySelectorAll('.filter-mode-select').forEach(select => {
    select.addEventListener('change', (e) => {
      const index = parseInt(e.target.dataset.index);
      const filter = state.pendingFilters[index];
      updatePendingFilterCondition(index, filter.field, e.target.value, filter.value);
    });
  });

  elements.filterConditions.querySelectorAll('.filter-value-input').forEach(input => {
    input.addEventListener('input', (e) => {
      const index = parseInt(e.target.dataset.index);
      const filter = state.pendingFilters[index];
      updatePendingFilterCondition(index, filter.field, filter.mode, e.target.value);
    });
    
    // Support Enter key to apply filters
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        applyFilters();
      }
    });
  });

  elements.filterConditions.querySelectorAll('.filter-remove-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.target.dataset.index);
      removeFilterCondition(index);
    });
  });
}

// Update filter stats
function updateFilterStats(filteredCount, totalCount) {
  if (state.messageFilters.length === 0) {
    elements.filterStats.textContent = '';
    return;
  }

  if (filteredCount === totalCount) {
    elements.filterStats.textContent = `显示全部 ${totalCount} 条消息`;
  } else {
    elements.filterStats.textContent = `显示 ${filteredCount}/${totalCount} 条消息`;
  }
}

// Toggle filter container visibility
function toggleFilterContainer() {
  const isHidden = elements.messageFilterContainer.style.display === 'none';
  elements.messageFilterContainer.style.display = isHidden ? 'block' : 'none';

  // Toggle expanded class for arrow animation
  if (isHidden) {
    elements.btnToggleFilter.classList.add('expanded');
  } else {
    elements.btnToggleFilter.classList.remove('expanded');
  }
}

// Event handlers for filter buttons
elements.btnToggleFilter.addEventListener('click', toggleFilterContainer);
elements.btnAddFilter.addEventListener('click', addFilterCondition);
elements.btnApplyFilters.addEventListener('click', applyFilters);
elements.btnClearFilters.addEventListener('click', clearAllFilters);

// Resizer functionality
const resizer = document.querySelector('.resizer');
const leftPanel = document.querySelector('.left-panel');

let isResizing = false;

resizer.addEventListener('mousedown', () => {
  isResizing = true;
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
});

document.addEventListener('mousemove', (e) => {
  if (!isResizing) return;

  const newWidth = e.clientX;
  if (newWidth >= 150 && newWidth <= 400) {
    leftPanel.style.width = newWidth + 'px';
  }
});

document.addEventListener('mouseup', () => {
  isResizing = false;
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
});

// Utility functions
function getUrlPath(url) {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch (e) {
    return url;
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function copyToClipboard(text) {
  // Create a temporary textarea element
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();

  try {
    document.execCommand('copy');
  } catch (err) {
    console.error('Failed to copy:', err);
  }

  document.body.removeChild(textarea);
}

function formatTime(timestamp) {
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

function syntaxHighlight(json) {
  return json.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    function(match) {
      let cls = 'json-number';
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = 'json-key';
          // Remove the colon for keys
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

// Initial render
renderConnectionList();

// ============================================
// Column Resizing Functionality
// ============================================
(function initColumnResizers() {
  const table = document.getElementById('message-table');
  if (!table) return;

  const resizers = table.querySelectorAll('.col-resizer');
  let currentResizer = null;
  let startX = 0;
  let startWidth = 0;
  let headerCell = null;
  let colClass = '';

  resizers.forEach(resizer => {
    resizer.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();

      currentResizer = resizer;
      headerCell = resizer.parentElement;
      colClass = resizer.dataset.col;
      startX = e.pageX;
      startWidth = headerCell.offsetWidth;

      resizer.classList.add('resizing');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  });

  function onMouseMove(e) {
    if (!currentResizer || !headerCell || !colClass) return;

    const diff = e.pageX - startX;
    const newWidth = Math.max(40, startWidth + diff);

    // Update CSS variable for the column
    table.style.setProperty('--col-' + colClass + '-width', newWidth + 'px');

    // For data column, also remove flex so width takes effect
    if (colClass === 'data') {
      const dataCells = table.querySelectorAll('.col-data');
      dataCells.forEach(cell => {
        cell.style.flex = 'none';
      });
    }
  }

  function onMouseUp() {
    if (currentResizer) {
      currentResizer.classList.remove('resizing');
    }
    currentResizer = null;
    headerCell = null;
    colClass = '';
    document.body.style.cursor = '';
    document.body.style.userSelect = '';

    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  }
})();

// ============================================
// Export Functionality
// ============================================

// Toggle export dropdown
function toggleExportDropdown() {
  elements.exportDropdown.classList.toggle('open');
}

// Close export dropdown when clicking outside
document.addEventListener('click', (e) => {
  if (!elements.exportDropdown.contains(e.target)) {
    elements.exportDropdown.classList.remove('open');
  }
});

// Format timestamp for export
function formatTimestampForExport(timestamp) {
  const date = new Date(timestamp);
  return date.toISOString();
}

// Get export data for current connection
function getCurrentConnectionExportData() {
  const connection = state.connections[state.selectedConnectionId];
  if (!connection) {
    return null;
  }

  // Apply filters if any
  const messages = filterMessages(connection.messages);

  return {
    connection: {
      id: connection.id,
      url: connection.url,
      frameUrl: connection.frameUrl,
      isIframe: connection.isIframe,
      status: connection.status,
      createdAt: formatTimestampForExport(connection.createdAt)
    },
    messages: messages.map(msg => ({
      id: msg.id,
      eventType: msg.eventType,
      data: msg.data,
      lastEventId: msg.lastEventId,
      timestamp: formatTimestampForExport(msg.timestamp)
    })),
    exportedAt: new Date().toISOString(),
    totalMessages: messages.length,
    appliedFilters: state.messageFilters.length > 0 ? state.messageFilters : null
  };
}

// Get export data for all connections
function getAllConnectionsExportData() {
  const connections = Object.values(state.connections);
  if (connections.length === 0) {
    return null;
  }

  return {
    connections: connections.map(conn => ({
      id: conn.id,
      url: conn.url,
      frameUrl: conn.frameUrl,
      isIframe: conn.isIframe,
      status: conn.status,
      createdAt: formatTimestampForExport(conn.createdAt),
      messages: conn.messages.map(msg => ({
        id: msg.id,
        eventType: msg.eventType,
        data: msg.data,
        lastEventId: msg.lastEventId,
        timestamp: formatTimestampForExport(msg.timestamp)
      })),
      messageCount: conn.messages.length
    })),
    exportedAt: new Date().toISOString(),
    totalConnections: connections.length,
    totalMessages: connections.reduce((sum, conn) => sum + conn.messages.length, 0)
  };
}

// Export to JSON
function exportToJSON(data, filename) {
  const jsonStr = JSON.stringify(data, null, 2);
  downloadFile(jsonStr, filename, 'application/json');
}

// Convert messages to CSV format
function messagesToCSV(messages, connectionInfo = null) {
  const headers = ['ID', 'EventType', 'Data', 'LastEventId', 'Timestamp'];
  if (connectionInfo) {
    headers.unshift('ConnectionURL', 'ConnectionID');
  }

  const rows = messages.map(msg => {
    // Escape double quotes and wrap in quotes if contains comma/newline/quote
    const escapeCSV = (value) => {
      if (value === null || value === undefined) {
        return '';
      }
      const str = String(value);
      if (str.includes(',') || str.includes('\n') || str.includes('"')) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    };

    const row = [
      escapeCSV(msg.id),
      escapeCSV(msg.eventType),
      escapeCSV(msg.data),
      escapeCSV(msg.lastEventId),
      escapeCSV(msg.timestamp)
    ];

    if (connectionInfo) {
      row.unshift(escapeCSV(connectionInfo.url), escapeCSV(connectionInfo.id));
    }

    return row.join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

// Export current connection to CSV
function exportCurrentToCSV() {
  const connection = state.connections[state.selectedConnectionId];
  if (!connection) {
    alert('请先选择一个连接');
    return;
  }

  const messages = filterMessages(connection.messages);
  if (messages.length === 0) {
    alert('当前连接没有消息可导出');
    return;
  }

  const formattedMessages = messages.map(msg => ({
    ...msg,
    timestamp: formatTimestampForExport(msg.timestamp)
  }));

  const csv = messagesToCSV(formattedMessages);
  const filename = `stream-messages-${connection.id.substring(0, 8)}-${Date.now()}.csv`;
  downloadFile(csv, filename, 'text/csv');
}

// Export all connections to CSV
function exportAllToCSV() {
  const connections = Object.values(state.connections);
  if (connections.length === 0) {
    alert('没有连接数据可导出');
    return;
  }

  const allMessages = [];
  connections.forEach(conn => {
    conn.messages.forEach(msg => {
      allMessages.push({
        ...msg,
        timestamp: formatTimestampForExport(msg.timestamp),
        connectionUrl: conn.url,
        connectionId: conn.id
      });
    });
  });

  if (allMessages.length === 0) {
    alert('没有消息数据可导出');
    return;
  }

  // Build CSV with connection info
  const headers = ['ConnectionID', 'ConnectionURL', 'ID', 'EventType', 'Data', 'LastEventId', 'Timestamp'];
  const rows = allMessages.map(msg => {
    const escapeCSV = (value) => {
      if (value === null || value === undefined) return '';
      const str = String(value);
      if (str.includes(',') || str.includes('\n') || str.includes('"')) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    };

    return [
      escapeCSV(msg.connectionId),
      escapeCSV(msg.connectionUrl),
      escapeCSV(msg.id),
      escapeCSV(msg.eventType),
      escapeCSV(msg.data),
      escapeCSV(msg.lastEventId),
      escapeCSV(msg.timestamp)
    ].join(',');
  });

  const csv = [headers.join(','), ...rows].join('\n');
  const filename = `stream-all-messages-${Date.now()}.csv`;
  downloadFile(csv, filename, 'text/csv');
}

// Download file helper
function downloadFile(content, filename, mimeType) {
  // Add UTF-8 BOM for CSV files to ensure proper encoding in Excel
  const bom = mimeType === 'text/csv' ? '\uFEFF' : '';
  const blob = new Blob([bom + content], { type: mimeType + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();

  // Cleanup
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

// Handle export action
function handleExport(exportType) {
  elements.exportDropdown.classList.remove('open');

  switch (exportType) {
    case 'current-json': {
      const data = getCurrentConnectionExportData();
      if (!data) {
        alert('请先选择一个连接');
        return;
      }
      const filename = `stream-${data.connection.id.substring(0, 8)}-${Date.now()}.json`;
      exportToJSON(data, filename);
      break;
    }

    case 'current-csv': {
      exportCurrentToCSV();
      break;
    }

    case 'all-json': {
      const data = getAllConnectionsExportData();
      if (!data) {
        alert('没有连接数据可导出');
        return;
      }
      const filename = `stream-all-${Date.now()}.json`;
      exportToJSON(data, filename);
      break;
    }

    case 'all-csv': {
      exportAllToCSV();
      break;
    }
  }
}

// Export event listeners
elements.btnExport.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleExportDropdown();
});

elements.exportMenu.querySelectorAll('.export-menu-item').forEach(item => {
  item.addEventListener('click', (e) => {
    e.stopPropagation();
    const exportType = item.dataset.export;
    handleExport(exportType);
  });
});

// ============================================
// Message Search Functionality
// ============================================

// Escape special regex characters
function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Highlight search matches in text
function highlightSearchMatches(text, query) {
  if (!query) return escapeHtml(text);

  const escapedQuery = escapeRegex(query);
  const regex = new RegExp(`(${escapedQuery})`, 'gi');
  const escaped = escapeHtml(text);

  return escaped.replace(regex, '<span class="search-match">$1</span>');
}

// Apply search to messages
function searchMessages(messages, query) {
  if (!query) return messages;

  const lowerQuery = query.toLowerCase();
  return messages.filter(msg => {
    // Search in event type
    if (msg.eventType.toLowerCase().includes(lowerQuery)) {
      return true;
    }

    // Search in data
    if (msg.data.toLowerCase().includes(lowerQuery)) {
      return true;
    }

    // Search in lastEventId
    if (msg.lastEventId && msg.lastEventId.toLowerCase().includes(lowerQuery)) {
      return true;
    }

    return false;
  });
}

// Update renderMessageList to support search
const originalRenderMessageList = renderMessageList;
renderMessageList = function() {
  const connection = state.connections[state.selectedConnectionId];

  if (!connection || connection.messages.length === 0) {
    elements.messageTbody.innerHTML = '';
    elements.messageEmpty.style.display = 'flex';
    elements.messageTbody.parentElement.style.display = 'none';
    return;
  }

  elements.messageEmpty.style.display = 'none';
  elements.messageTbody.parentElement.style.display = 'flex';

  // Apply filters
  let filteredMessages = filterMessages(connection.messages);

  // Apply search
  filteredMessages = searchMessages(filteredMessages, state.searchQuery);

  // Update filter stats
  updateFilterStats(filteredMessages.length, connection.messages.length);

  elements.messageTbody.innerHTML = filteredMessages.map(msg => {
    const time = formatTime(msg.timestamp);
    const hasSearch = state.searchQuery.length > 0;

    return `
      <div class="message-row ${hasSearch ? 'search-highlight' : ''}" data-id="${msg.id}">
        <div class="message-cell col-id">${msg.id}</div>
        <div class="message-cell col-type">${hasSearch ? highlightSearchMatches(msg.eventType, state.searchQuery) : escapeHtml(msg.eventType)}</div>
        <div class="message-cell col-data">${hasSearch ? highlightSearchMatches(msg.data, state.searchQuery) : escapeHtml(msg.data)}</div>
        <div class="message-cell col-time">${time}</div>
      </div>
    `;
  }).join('');

  // Add click handlers
  elements.messageTbody.querySelectorAll('.message-row').forEach(row => {
    row.addEventListener('click', () => {
      showMessageDetail(parseInt(row.dataset.id));
    });
  });

  // Update filter UI if filters exist
  if (state.messageFilters.length > 0) {
    renderFilterConditions();
  }
};

// Message search event listeners
elements.messageSearchInput.addEventListener('input', (e) => {
  state.searchQuery = e.target.value;
  elements.btnClearSearch.style.display = state.searchQuery ? 'block' : 'none';
  renderMessageList();
});

elements.btnClearSearch.addEventListener('click', () => {
  state.searchQuery = '';
  elements.messageSearchInput.value = '';
  elements.btnClearSearch.style.display = 'none';
  renderMessageList();
});

// ============================================
// Filter Preset Management
// ============================================

const PRESETS_STORAGE_KEY = 'stream-panel-filter-presets';

// Load presets from storage
function loadPresets() {
  const stored = localStorage.getItem(PRESETS_STORAGE_KEY);
  return stored ? JSON.parse(stored) : [];
}

// Save presets to storage
function savePresetsToStorage(presets) {
  localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));
}

// Show save preset modal
function showSavePresetModal() {
  if (state.pendingFilters.length === 0) {
    alert('请先添加筛选条件');
    return;
  }

  elements.presetModalTitle.textContent = '保存筛选预设';
  elements.presetModalBody.innerHTML = `
    <div class="preset-form">
      <div class="form-group">
        <label class="form-label">预设名称</label>
        <input type="text" id="preset-name-input" class="form-input" placeholder="输入预设名称..." autofocus>
      </div>
      <div class="form-group">
        <label class="form-label">描述（可选）</label>
        <input type="text" id="preset-desc-input" class="form-input" placeholder="输入预设描述...">
      </div>
      <div class="form-group">
        <label class="form-label">筛选条件预览</label>
        <div style="font-size: 11px; color: var(--text-secondary); padding: 8px; background: var(--bg-secondary); border-radius: 4px;">
          ${state.pendingFilters.map(f => `${f.field} ${f.mode === 'equals' ? '=' : '包含'} "${f.value}"`).join(' AND ')}
        </div>
      </div>
    </div>
  `;

  elements.presetModalFooter.innerHTML = `
    <button class="modal-btn" id="preset-cancel-btn">取消</button>
    <button class="modal-btn primary" id="preset-save-btn">保存</button>
  `;

  elements.presetModal.style.display = 'flex';

  // Event listeners
  document.getElementById('preset-cancel-btn').addEventListener('click', closePresetModal);
  document.getElementById('preset-save-btn').addEventListener('click', () => {
    const name = document.getElementById('preset-name-input').value.trim();
    const description = document.getElementById('preset-desc-input').value.trim();

    if (!name) {
      alert('请输入预设名称');
      return;
    }

    const presets = loadPresets();
    presets.push({
      id: Date.now().toString(),
      name,
      description,
      filters: JSON.parse(JSON.stringify(state.pendingFilters)),
      createdAt: new Date().toISOString()
    });

    savePresetsToStorage(presets);
    closePresetModal();
    alert('预设保存成功');
  });

  // Allow Enter key to save
  document.getElementById('preset-name-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      document.getElementById('preset-save-btn').click();
    }
  });
}

// Show load preset modal
function showLoadPresetModal() {
  const presets = loadPresets();

  if (presets.length === 0) {
    alert('暂无已保存的预设');
    return;
  }

  elements.presetModalTitle.textContent = '加载筛选预设';
  elements.presetModalBody.innerHTML = `
    <div class="preset-list">
      ${presets.map(preset => `
        <div class="preset-item" data-preset-id="${preset.id}">
          <div class="preset-info">
            <div class="preset-name">${escapeHtml(preset.name)}</div>
            <div class="preset-description">
              ${preset.description ? escapeHtml(preset.description) : ''}
              <br>
              <span style="font-size: 10px; color: var(--text-muted);">
                ${preset.filters.map(f => `${f.field} ${f.mode === 'equals' ? '=' : '包含'} "${f.value}"`).join(', ')}
              </span>
            </div>
          </div>
          <div class="preset-actions">
            <button class="preset-btn load-preset-btn" data-preset-id="${preset.id}">加载</button>
            <button class="preset-btn delete-preset-btn" data-preset-id="${preset.id}">删除</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  elements.presetModalFooter.innerHTML = `
    <button class="modal-btn" id="preset-close-btn">关闭</button>
  `;

  elements.presetModal.style.display = 'flex';

  // Event listeners
  document.getElementById('preset-close-btn').addEventListener('click', closePresetModal);

  document.querySelectorAll('.load-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const presetId = btn.dataset.presetId;
      const preset = presets.find(p => p.id === presetId);
      if (preset) {
        state.pendingFilters = JSON.parse(JSON.stringify(preset.filters));
        state.messageFilters = JSON.parse(JSON.stringify(preset.filters));
        elements.messageFilterContainer.style.display = 'block';
        elements.btnToggleFilter.classList.add('expanded');
        renderFilterConditions();
        renderMessageList();
        closePresetModal();
      }
    });
  });

  document.querySelectorAll('.delete-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm('确定要删除此预设吗？')) {
        const presetId = btn.dataset.presetId;
        const updatedPresets = presets.filter(p => p.id !== presetId);
        savePresetsToStorage(updatedPresets);
        showLoadPresetModal(); // Refresh the list
      }
    });
  });
}

// Close preset modal
function closePresetModal() {
  elements.presetModal.style.display = 'none';
}

// Preset event listeners
elements.btnSavePreset.addEventListener('click', showSavePresetModal);
elements.btnLoadPreset.addEventListener('click', showLoadPresetModal);
elements.presetModalClose.addEventListener('click', closePresetModal);

// Close modal when clicking outside
elements.presetModal.addEventListener('click', (e) => {
  if (e.target === elements.presetModal) {
    closePresetModal();
  }
});

// ============================================
// Message Replay Functionality
// ============================================

elements.btnReplay.addEventListener('click', () => {
  const connection = state.connections[state.selectedConnectionId];
  if (!connection) return;

  const message = connection.messages.find(m => m.id === state.selectedMessageId);
  if (!message) return;

  // Create replay data structure
  const replayData = {
    url: connection.url,
    eventType: message.eventType,
    data: message.data,
    lastEventId: message.lastEventId,
    timestamp: message.timestamp,
    instruction: '此消息已复制到剪贴板。要重放此消息，您需要手动模拟相应的SSE事件。'
  };

  const replayText = JSON.stringify(replayData, null, 2);
  copyToClipboard(replayText);

  alert('消息重放数据已复制到剪贴板！\n\n包含内容：\n- 连接URL\n- 事件类型\n- 消息数据\n- 时间戳');
});

// ============================================
// Connection Statistics
// ============================================

// Calculate statistics
function calculateStatistics() {
  const connections = Object.values(state.connections);
  const totalConnections = connections.length;
  const activeConnections = connections.filter(c => c.status === 'open').length;
  const totalMessages = connections.reduce((sum, c) => sum + c.messages.length, 0);
  const avgMessages = totalConnections > 0 ? Math.round(totalMessages / totalConnections) : 0;

  return {
    totalConnections,
    activeConnections,
    totalMessages,
    avgMessages,
    connections: connections.map(conn => ({
      id: conn.id,
      url: conn.url,
      status: conn.status,
      messageCount: conn.messages.length,
      createdAt: conn.createdAt,
      duration: Date.now() - conn.createdAt
    }))
  };
}

// Format duration
function formatDuration(ms) {
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

// Show statistics modal
function showStatisticsModal() {
  const stats = calculateStatistics();

  // Update summary statistics
  document.getElementById('stat-total-connections').textContent = stats.totalConnections;
  document.getElementById('stat-active-connections').textContent = stats.activeConnections;
  document.getElementById('stat-total-messages').textContent = stats.totalMessages;
  document.getElementById('stat-avg-messages').textContent = stats.avgMessages;

  // Render connection list
  const statsConnectionList = document.getElementById('stats-connection-list');

  if (stats.connections.length === 0) {
    statsConnectionList.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 20px;">暂无连接数据</div>';
  } else {
    statsConnectionList.innerHTML = stats.connections.map(conn => `
      <div class="stats-connection-item">
        <div class="stats-connection-header">
          <div class="stats-connection-url" title="${escapeHtml(conn.url)}">${escapeHtml(getUrlPath(conn.url))}</div>
          <span class="stats-connection-status status-${conn.status}">${getStatusText(conn.status)}</span>
        </div>
        <div class="stats-connection-details">
          <div class="stats-detail-item">
            <span class="stats-detail-label">消息数</span>
            <span class="stats-detail-value">${conn.messageCount}</span>
          </div>
          <div class="stats-detail-item">
            <span class="stats-detail-label">持续时间</span>
            <span class="stats-detail-value">${formatDuration(conn.duration)}</span>
          </div>
          <div class="stats-detail-item">
            <span class="stats-detail-label">ID</span>
            <span class="stats-detail-value">${conn.id.substring(0, 8)}...</span>
          </div>
        </div>
      </div>
    `).join('');
  }

  elements.statsModal.style.display = 'flex';
}

// Get status text
function getStatusText(status) {
  const statusMap = {
    'connecting': '连接中',
    'open': '已连接',
    'closed': '已关闭',
    'error': '错误'
  };
  return statusMap[status] || status;
}

// Close statistics modal
function closeStatisticsModal() {
  elements.statsModal.style.display = 'none';
}

// Statistics event listeners
elements.btnStats.addEventListener('click', showStatisticsModal);
elements.statsModalClose.addEventListener('click', closeStatisticsModal);

// Close modal when clicking outside
elements.statsModal.addEventListener('click', (e) => {
  if (e.target === elements.statsModal) {
    closeStatisticsModal();
  }
});
