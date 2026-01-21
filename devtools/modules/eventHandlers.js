// Event handlers module

import { state, setFilter, setRequestTypeFilter, setSearchQuery, clearAllData, setAutoScrollToBottom, togglePinnedMessage } from './state.js';
import { showListView, showDetailView } from './viewManager.js';
import { copyToClipboard, log } from './utils.js';

let elements = {};
let port = null;
let callbacks = {
  renderConnectionList: null,
  renderMessageList: null,
  showMessageDetail: null,
  toggleFilterContainer: null,
  handleExport: null,
  showSavePresetModal: null,
  showLoadPresetModal: null,
  closePresetModal: null,
  showStatisticsModal: null,
  closeStatisticsModal: null
};

export function initEventHandlers(el, connectionPort) {
  elements = el;
  port = connectionPort;
  setupToolbarHandlers();
  setupFilterHandlers();
  setupExportHandlers();
  setupPresetHandlers();
  setupStatsHandlers();
  setupSavedConnectionsHandlers();
  setupDetailHandlers();
  setupResizerHandlers();
  setupSearchHandlers();
  setupModalClickHandlers();
}

export function setCallbacks(cb) {
  callbacks = { ...callbacks, ...cb };
}

function setupToolbarHandlers() {
  elements.btnClear.addEventListener('click', () => {
    clearAllData();
    if (callbacks.renderConnectionList) callbacks.renderConnectionList();
    if (callbacks.renderMessageList) callbacks.renderMessageList();
    showListView();
    port.postMessage({ type: 'clear' });
  });

  elements.filterInput.addEventListener('input', (e) => {
    setFilter(e.target.value);
    if (callbacks.renderConnectionList) callbacks.renderConnectionList();
  });

  elements.requestTypeFilter.addEventListener('change', (e) => {
    setRequestTypeFilter(e.target.value);
    if (callbacks.renderConnectionList) callbacks.renderConnectionList();
  });

  elements.btnToggleFilter.addEventListener('click', () => {
    if (callbacks.toggleFilterContainer) callbacks.toggleFilterContainer();
  });

  elements.btnScrollTop.addEventListener('click', () => {
    elements.messageTbody.scrollTop = 0;
  });

  elements.btnAutoScroll.addEventListener('click', () => {
    const newState = !state.autoScrollToBottom;
    setAutoScrollToBottom(newState);
    elements.btnAutoScroll.classList.toggle('active', newState);
    if (newState) {
      elements.messageTbody.scrollTop = elements.messageTbody.scrollHeight;
    }
  });
}

function setupFilterHandlers() {
  elements.btnAddFilter.addEventListener('click', () => {
    // This will be called from filterManager
    document.dispatchEvent(new CustomEvent('addFilter'));
  });

  elements.btnApplyFilters.addEventListener('click', () => {
    document.dispatchEvent(new CustomEvent('applyFilters'));
  });

  elements.btnClearFilters.addEventListener('click', () => {
    document.dispatchEvent(new CustomEvent('clearFilters'));
  });
}

function setupExportHandlers() {
  elements.btnExport.addEventListener('click', (e) => {
    e.stopPropagation();
    elements.exportDropdown.classList.toggle('open');
  });

  elements.exportMenu.querySelectorAll('.export-menu-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const exportType = item.dataset.export;
      if (callbacks.handleExport) callbacks.handleExport(exportType);
      elements.exportDropdown.classList.remove('open');
    });
  });

  document.addEventListener('click', (e) => {
    if (!elements.exportDropdown.contains(e.target)) {
      elements.exportDropdown.classList.remove('open');
    }
  });
}

function setupPresetHandlers() {
  elements.btnSavePreset.addEventListener('click', () => {
    if (callbacks.showSavePresetModal) callbacks.showSavePresetModal();
  });
  elements.btnLoadPreset.addEventListener('click', () => {
    if (callbacks.showLoadPresetModal) callbacks.showLoadPresetModal();
  });
  elements.presetModalClose.addEventListener('click', () => {
    if (callbacks.closePresetModal) callbacks.closePresetModal();
  });
}

function setupStatsHandlers() {
  elements.btnStats.addEventListener('click', () => {
    if (callbacks.showStatisticsModal) callbacks.showStatisticsModal();
  });
  elements.statsModalClose.addEventListener('click', () => {
    if (callbacks.closeStatisticsModal) callbacks.closeStatisticsModal();
  });
}

function setupSavedConnectionsHandlers() {
  elements.btnSaveConnection.addEventListener('click', () => {
    if (callbacks.showSaveConnectionModal) callbacks.showSaveConnectionModal();
  });
  elements.btnSavedConnections.addEventListener('click', () => {
    if (callbacks.showSavedConnectionsModal) callbacks.showSavedConnectionsModal();
  });
  elements.savedConnectionsModalClose.addEventListener('click', () => {
    if (callbacks.closeSavedConnectionsModal) callbacks.closeSavedConnectionsModal();
  });
  elements.btnCloseSavedModal.addEventListener('click', () => {
    if (callbacks.closeSavedConnectionsModal) callbacks.closeSavedConnectionsModal();
  });
  elements.btnDeleteAllSaved.addEventListener('click', () => {
    if (callbacks.deleteAllSavedConnections) callbacks.deleteAllSavedConnections();
  });
}

function setupDetailHandlers() {
  elements.btnBack.addEventListener('click', () => {
    showListView();
  });

  elements.btnCopy.addEventListener('click', async () => {
    const connection = state.connections[state.selectedConnectionId];
    if (!connection) return;

    const message = connection.messages.find(m => m.id === state.selectedMessageId);
    if (!message) return;

    const success = await copyToClipboard(message.data);
    if (success) {
      alert('消息数据已复制到剪贴板！');
    } else {
      alert('复制失败，请重试。');
    }
  });

  elements.btnPin.addEventListener('click', () => {
    const isPinned = togglePinnedMessage(state.selectedConnectionId, state.selectedMessageId);
    if (callbacks.updatePinButtonState) {
      callbacks.updatePinButtonState();
    }
    if (callbacks.renderMessageList) {
      callbacks.renderMessageList();
    }
  });
}

function setupResizerHandlers() {
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
}

function setupSearchHandlers() {
  elements.messageSearchInput.addEventListener('input', (e) => {
    setSearchQuery(e.target.value);
    elements.btnClearSearch.style.display = state.searchQuery ? 'block' : 'none';
    if (callbacks.renderMessageList) callbacks.renderMessageList();
  });

  elements.btnClearSearch.addEventListener('click', () => {
    setSearchQuery('');
    elements.messageSearchInput.value = '';
    elements.btnClearSearch.style.display = 'none';
    if (callbacks.renderMessageList) callbacks.renderMessageList();
  });
}

function setupModalClickHandlers() {
  elements.presetModal.addEventListener('click', (e) => {
    if (e.target === elements.presetModal) {
      if (callbacks.closePresetModal) callbacks.closePresetModal();
    }
  });

  elements.statsModal.addEventListener('click', (e) => {
    if (e.target === elements.statsModal) {
      if (callbacks.closeStatisticsModal) callbacks.closeStatisticsModal();
    }
  });

  elements.savedConnectionsModal.addEventListener('click', (e) => {
    if (e.target === elements.savedConnectionsModal) {
      if (callbacks.closeSavedConnectionsModal) callbacks.closeSavedConnectionsModal();
    }
  });
}

function toggleFilterContainer() {
  const isHidden = elements.messageFilterContainer.style.display === 'none';
  elements.messageFilterContainer.style.display = isHidden ? 'block' : 'none';

  if (isHidden) {
    elements.btnToggleFilter.classList.add('expanded');
  } else {
    elements.btnToggleFilter.classList.remove('expanded');
  }
}

