// Message rendering module

import { state, isMessagePinned } from './state.js';
import { escapeHtml, formatTime, syntaxHighlight, log } from './utils.js';
import { showDetailView, showListView } from './viewManager.js';

let elements = {};
let callbacks = {
  filterMessages: null,
  searchMessages: null
};

export function initMessageRenderer(el) {
  elements = el;
}

export function setCallbacks(cb) {
  callbacks = { ...callbacks, ...cb };
}

export function renderMessageList() {
  const connection = state.connections[state.selectedConnectionId];

  if (!connection || connection.messages.length === 0) {
    elements.messageTbody.innerHTML = '';
    elements.messageEmpty.style.display = 'flex';
    elements.messageTbody.parentElement.style.display = 'none';
    return;
  }

  elements.messageEmpty.style.display = 'none';
  elements.messageTbody.parentElement.style.display = 'flex';

  let filteredMessages = connection.messages;
  if (callbacks.filterMessages) {
    filteredMessages = callbacks.filterMessages(connection.messages);
  }
  if (callbacks.searchMessages) {
    filteredMessages = callbacks.searchMessages(filteredMessages, state.searchQuery);
  }

  updateFilterStats(filteredMessages.length, connection.messages.length);

  const pinnedMessages = filteredMessages.filter(msg => isMessagePinned(state.selectedConnectionId, msg.id));
  const normalMessages = filteredMessages.filter(msg => !isMessagePinned(state.selectedConnectionId, msg.id));
  const displayMessages = [...pinnedMessages, ...normalMessages];

  elements.messageTbody.innerHTML = displayMessages.map(msg => {
    const time = formatTime(msg.timestamp);
    const hasSearch = state.searchQuery.length > 0;
    const isPinned = isMessagePinned(state.selectedConnectionId, msg.id);

    return `
      <div class="message-row ${hasSearch ? 'search-highlight' : ''} ${isPinned ? 'pinned' : ''}" data-id="${msg.id}">
        <div class="message-cell col-id">${isPinned ? '📌' : ''}${msg.id}</div>
        <div class="message-cell col-type">${hasSearch ? highlightSearchMatches(msg.eventType, state.searchQuery) : escapeHtml(msg.eventType)}</div>
        <div class="message-cell col-data">${hasSearch ? highlightSearchMatches(msg.data, state.searchQuery) : escapeHtml(msg.data)}</div>
        <div class="message-cell col-time">${time}</div>
      </div>
    `;
  }).join('');

  elements.messageTbody.querySelectorAll('.message-row').forEach(row => {
    row.addEventListener('click', () => {
      showMessageDetail(parseInt(row.dataset.id));
    });
  });

  if (state.autoScrollToBottom) {
    elements.messageTbody.scrollTop = elements.messageTbody.scrollHeight;
  }
}

export function showMessageDetail(messageId) {
  const connection = state.connections[state.selectedConnectionId];
  if (!connection) return;

  const message = connection.messages.find(m => m.id === messageId);
  if (!message) return;

  state.selectedMessageId = messageId;

  elements.detailTitle.textContent = `消息 #${messageId} - ${message.eventType}`;

  let formattedData;
  try {
    const parsed = JSON.parse(message.data);
    formattedData = syntaxHighlight(JSON.stringify(parsed, null, 2));
  } catch (e) {
    formattedData = escapeHtml(message.data);
  }

  elements.detailJson.innerHTML = formattedData;
  updatePinButtonState();
  showDetailView();
}

export function updatePinButtonState() {
  const isPinned = isMessagePinned(state.selectedConnectionId, state.selectedMessageId);
  elements.btnPin.classList.toggle('active', isPinned);
  elements.btnPin.title = isPinned ? '取消置顶此消息' : '置顶此消息';
}

export function updateFilterStats(filteredCount, totalCount) {
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

export function highlightSearchMatches(text, query) {
  if (!query) return escapeHtml(text);

  const escapedQuery = escapeRegex(query);
  const regex = new RegExp(`(${escapedQuery})`, 'gi');
  const escaped = escapeHtml(text);

  return escaped.replace(regex, '<span class="search-match">$1</span>');
}

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
