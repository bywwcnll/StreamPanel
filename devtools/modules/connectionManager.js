// Connection management module

import { state } from './state.js';
import { getUrlPath, escapeHtml, getRequestType, log } from './utils.js';
import { isConnectionSaved } from './connectionStorageManager.js';

let elements = {};
let callbacks = {
  renderMessageList: null,
  showListView: null,
  renderFilterConditions: null
};

export function initConnectionManager(el) {
  elements = el;
}

export function setCallbacks(cb) {
  callbacks = { ...callbacks, ...cb };
}

export async function renderConnectionList() {
  const connections = Object.values(state.connections);
  const urlFilter = state.filter.toLowerCase();
  const typeFilter = state.requestTypeFilter;

  let filtered = urlFilter
    ? connections.filter(c => c.url.toLowerCase().includes(urlFilter))
    : connections;

  if (typeFilter !== 'all') {
    filtered = filtered.filter(c => {
      const requestType = getRequestType(c.source);
      return requestType === typeFilter;
    });
  }

  filtered.sort((a, b) => b.createdAt - a.createdAt);

  if (filtered.length === 0) {
    elements.connectionList.innerHTML = '<div class="empty-state">暂无连接</div>';
    return;
  }

  const connectionHtml = await Promise.all(filtered.map(async (conn) => {
    const urlPath = getUrlPath(conn.url);
    const isSelected = conn.id === state.selectedConnectionId;
    const isSaved = await isConnectionSaved(conn.originalId || conn.id);
    const badgeClass = conn.isIframe ? 'badge-iframe' : 'badge-main';
    const badgeText = conn.isIframe ? 'iframe' : '主页面';
    const statusClass = `status-${conn.status}`;
    const requestType = getRequestType(conn.source);
    const typeBadgeMap = {
      'fetch': 'badge-fetch',
      'xhr': 'badge-xhr',
      'eventsource': 'badge-eventsource',
      'unknown': 'badge-unknown'
    };
    const typeBadgeClass = typeBadgeMap[requestType] || 'badge-unknown';
    const typeBadgeText = requestType.toUpperCase();

    const savedIndicator = isSaved ? '<span class="connection-saved-indicator" title="已保存到数据库">💾</span>' : '';

    return `
      <div class="connection-item ${isSelected ? 'selected' : ''}" data-id="${conn.id}">
        <div class="connection-url" title="${escapeHtml(conn.url)}">${escapeHtml(urlPath)}</div>
        <div class="connection-meta">
          <span class="status-dot ${statusClass}"></span>
          <span class="connection-badge ${badgeClass}">${badgeText}</span>
          <span class="connection-badge ${typeBadgeClass}">${typeBadgeText}</span>
          <span class="message-count">${conn.messages.length} 条</span>
          ${savedIndicator}
        </div>
      </div>
    `;
  }));

  elements.connectionList.innerHTML = connectionHtml.join('');

  elements.connectionList.querySelectorAll('.connection-item').forEach(item => {
    item.addEventListener('click', () => {
      selectConnection(item.dataset.id);
    });
  });
}

export async function selectConnection(connectionId) {
  const isSelected = setSelectedConnection(connectionId);

  await renderConnectionList();
  if (callbacks.renderMessageList) callbacks.renderMessageList();
  if (callbacks.showListView) callbacks.showListView();

  if (isSelected && state.pendingFilters.length > 0) {
    elements.messageFilterContainer.style.display = 'block';
    elements.btnToggleFilter.classList.add('expanded');
    if (callbacks.renderFilterConditions) callbacks.renderFilterConditions();
  }
}

export function handleStreamEvent(payload) {
  log('Handling stream event:', payload.type, payload);

  switch (payload.type) {
    case 'stream-connection':
      addConnection({
        id: payload.connectionId,
        url: payload.url,
        frameUrl: payload.frameUrl,
        isIframe: payload.isIframe,
        source: payload.source || 'unknown',
        status: 'connecting',
        createdAt: payload.timestamp,
        messages: []
      });
      log('Created connection:', payload.connectionId, payload.url);
      selectConnection(payload.connectionId);
      break;

    case 'stream-open':
      updateConnectionStatus(payload.connectionId, 'open');
      log('Connection opened:', payload.connectionId);
      renderConnectionList();
      break;

    case 'stream-message':
      addMessage(payload.connectionId, {
        id: payload.messageId,
        eventType: payload.eventType,
        data: payload.data,
        lastEventId: payload.lastEventId,
        timestamp: payload.timestamp
      });
      log('Added message #' + payload.messageId + ' to connection:', payload.connectionId);
      renderConnectionList();
      if (state.selectedConnectionId === payload.connectionId && callbacks.renderMessageList) {
        callbacks.renderMessageList();
      }
      break;

    case 'stream-error':
      updateConnectionStatus(payload.connectionId, 'error');
      renderConnectionList();
      break;

    case 'stream-close':
      updateConnectionStatus(payload.connectionId, 'closed');
      renderConnectionList();
      break;
  }
}

// Re-export state functions for use in this module
function setSelectedConnection(connectionId) {
  if (state.selectedConnectionId === connectionId) {
    state.selectedConnectionId = null;
    state.selectedMessageId = null;
    return false;
  }
  state.selectedConnectionId = connectionId;
  state.selectedMessageId = null;
  state.pendingFilters = JSON.parse(JSON.stringify(state.messageFilters));
  return true;
}

function addConnection(connectionData) {
  state.connections[connectionData.id] = connectionData;
}

function addMessage(connectionId, messageData) {
  if (state.connections[connectionId]) {
    state.connections[connectionId].messages.push(messageData);
  }
}

function updateConnectionStatus(connectionId, status) {
  if (state.connections[connectionId]) {
    state.connections[connectionId].status = status;
  }
}
