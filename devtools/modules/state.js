// State management module

export const state = {
  connections: {},
  selectedConnectionId: null,
  selectedMessageId: null,
  pinnedMessageIds: {},
  filter: '',
  requestTypeFilter: 'all',
  messageFilters: [],
  pendingFilters: [],
  searchQuery: '',
  autoScrollToBottom: true
};

export function setSelectedConnection(connectionId) {
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

export function setSelectedMessage(messageId) {
  state.selectedMessageId = messageId;
}

export function setFilter(filter) {
  state.filter = filter;
}

export function setRequestTypeFilter(type) {
  state.requestTypeFilter = type;
}

export function setMessageFilters(filters) {
  state.messageFilters = filters;
}

export function setPendingFilters(filters) {
  state.pendingFilters = filters;
}

export function setSearchQuery(query) {
  state.searchQuery = query;
}

export function setAutoScrollToBottom(enabled) {
  state.autoScrollToBottom = enabled;
}

export function togglePinnedMessage(connectionId, messageId) {
  if (!state.pinnedMessageIds[connectionId]) {
    state.pinnedMessageIds[connectionId] = new Set();
  }

  const pinned = state.pinnedMessageIds[connectionId];
  if (pinned.has(messageId)) {
    pinned.delete(messageId);
    return false;
  } else {
    pinned.add(messageId);
    return true;
  }
}

export function isMessagePinned(connectionId, messageId) {
  return state.pinnedMessageIds[connectionId]?.has(messageId) || false;
}

export function clearAllData() {
  state.connections = {};
  state.selectedConnectionId = null;
  state.selectedMessageId = null;
}

export function addConnection(connectionData) {
  state.connections[connectionData.id] = connectionData;
}

export function addMessage(connectionId, messageData) {
  if (state.connections[connectionId]) {
    state.connections[connectionId].messages.push(messageData);
  }
}

export function updateConnectionStatus(connectionId, status) {
  if (state.connections[connectionId]) {
    state.connections[connectionId].status = status;
  }
}
