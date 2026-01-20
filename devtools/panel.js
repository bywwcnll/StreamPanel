// Main panel entry point
import { initConnectionManager, handleStreamEvent, renderConnectionList, setCallbacks as setConnectionCallbacks } from './modules/connectionManager.js';
import { initMessageRenderer, renderMessageList, showMessageDetail, updateFilterStats, updatePinButtonState, setCallbacks as setMessageRendererCallbacks } from './modules/messageRenderer.js';
import { initViewManager, showListView, showDetailView } from './modules/viewManager.js';
import { initFilterManager, renderFilterConditions, addFilterCondition, clearAllFilters, applyFilters, filterMessages, toggleFilterContainer, setCallbacks as setFilterManagerCallbacks } from './modules/filterManager.js';
import { initPresetManager, closePresetModal, showSavePresetModal, showLoadPresetModal, setCallbacks as setPresetManagerCallbacks } from './modules/presetManager.js';
import { initStatisticsManager, closeStatisticsModal, showStatisticsModal } from './modules/statisticsManager.js';
import { initEventHandlers, setCallbacks as setEventHandlersCallbacks } from './modules/eventHandlers.js';
import { initColumnResizers } from './modules/columnResizer.js';
import { state } from './modules/state.js';
import { log } from './modules/utils.js';
import { searchMessages } from './modules/searchManager.js';
import { handleExport } from './modules/exportManager.js';

// Enable debug mode
window.__STREAM_PANEL_DEBUG__ = false;

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
  btnPin: document.getElementById('btn-pin'),
  btnStats: document.getElementById('btn-stats'),
  filterInput: document.getElementById('filter-input'),
  requestTypeFilter: document.getElementById('request-type-filter'),
  messageFilterContainer: document.getElementById('message-filter-container'),
  filterConditions: document.getElementById('filter-conditions'),
  filterStats: document.getElementById('filter-stats'),
  btnAddFilter: document.getElementById('btn-add-filter'),
  btnApplyFilters: document.getElementById('btn-apply-filters'),
  btnClearFilters: document.getElementById('btn-clear-filters'),
  btnToggleFilter: document.getElementById('btn-toggle-filter'),
  btnScrollTop: document.getElementById('btn-scroll-top'),
  btnAutoScroll: document.getElementById('btn-auto-scroll'),
  btnSavePreset: document.getElementById('btn-save-preset'),
  btnLoadPreset: document.getElementById('btn-load-preset'),
  messageSearchInput: document.getElementById('message-search-input'),
  btnClearSearch: document.getElementById('btn-clear-search'),
  exportDropdown: document.querySelector('.export-dropdown'),
  btnExport: document.getElementById('btn-export'),
  exportMenu: document.getElementById('export-menu'),
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
  log('Received message:', message.type, message);

  switch (message.type) {
    case 'init-data':
      state.connections = message.data.connections || {};
      log('Initialized with', Object.keys(state.connections).length, 'connections');
      renderConnectionList();
      break;

    case 'stream-event':
      handleStreamEvent(message.payload);
      break;

    case 'navigation':
      state.connections = {};
      state.selectedConnectionId = null;
      state.selectedMessageId = null;
      renderConnectionList();
      renderMessageList();
      showListView();
      break;
  }
});

// Initialize all modules
function initModules() {
  initConnectionManager(elements);
  initMessageRenderer(elements);
  initViewManager(elements);
  initFilterManager(elements);
  initPresetManager(elements);
  initStatisticsManager(elements);
  initEventHandlers(elements, port);
  initColumnResizers();

  setupModuleCallbacks();
  setupFilterEvents();
}

// Setup callbacks between modules to avoid circular dependencies
function setupModuleCallbacks() {
  // Connection manager callbacks
  setConnectionCallbacks({
    renderMessageList,
    showListView,
    renderFilterConditions
  });

  // Message renderer callbacks
  setMessageRendererCallbacks({
    filterMessages,
    searchMessages
  });

  // Event handlers callbacks
  setEventHandlersCallbacks({
    renderConnectionList,
    renderMessageList,
    showMessageDetail,
    toggleFilterContainer,
    handleExport,
    showSavePresetModal,
    showLoadPresetModal,
    closePresetModal,
    showStatisticsModal,
    closeStatisticsModal,
    updatePinButtonState
  });

  // Filter manager callbacks
  setFilterManagerCallbacks({
    renderMessageList,
    updateFilterStats
  });

  // Preset manager callbacks
  setPresetManagerCallbacks({
    renderMessageList,
    renderFilterConditions
  });
}

// Setup custom event listeners for filter operations
function setupFilterEvents() {
  document.addEventListener('addFilter', () => {
    addFilterCondition();
  });

  document.addEventListener('applyFilters', () => {
    applyFilters();
  });

  document.addEventListener('clearFilters', () => {
    clearAllFilters();
  });
}

// Re-export functions that need to be accessible globally for modules
window.__StreamPanel__ = {
  renderConnectionList,
  renderMessageList,
  showMessageDetail,
  showListView,
  showDetailView,
  renderFilterConditions,
  closePresetModal,
  closeStatisticsModal
};

// Initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initModules);
} else {
  initModules();
}

log('Stream Panel initialized with modular architecture');
