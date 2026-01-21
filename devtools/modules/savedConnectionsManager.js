// Saved connections management module

import { state, addConnection } from './state.js';
import { 
  saveConnection,
  loadConnection,
  deleteConnection,
  deleteAllConnections,
  getAllSavedConnections,
  isConnectionSaved,
  getConnectionByOriginalId
} from './connectionStorageManager.js';
import { escapeHtml, formatTimestampForExport, log } from './utils.js';

let elements = {};
let callbacks = {
  renderConnectionList: null,
  renderMessageList: null,
  selectConnection: null
};

export function initSavedConnectionsManager(el) {
  elements = el;
}

export function setCallbacks(cb) {
  callbacks = { ...callbacks, ...cb };
}

export async function showSaveConnectionModal() {
  const connection = state.connections[state.selectedConnectionId];
  if (!connection) {
    alert('请先选择一个连接');
    return;
  }

  if (connection.messages.length === 0) {
    alert('此连接没有消息数据');
    return;
  }

  const existing = await isConnectionSaved(connection.id);
  const defaultName = formatDateTime(connection.createdAt);

  elements.presetModalTitle.textContent = '保存连接';
  elements.presetModalBody.innerHTML = `
    <div class="preset-form">
      <div class="form-group">
        <label class="form-label">连接名称</label>
        <input type="text" id="connection-name-input" class="form-input"
               placeholder="输入连接名称..."
               value="${existing ? '（覆盖已保存的连接）' : defaultName}">
      </div>
      <div class="form-group">
        <label class="form-label">连接信息</label>
        <div class="connection-info-box">
          <div class="info-row"><strong>URL:</strong> <span class="info-url">${escapeHtml(connection.url)}</span></div>
          <div><strong>消息数量:</strong> ${connection.messages.length} 条</div>
          <div><strong>状态:</strong> ${connection.status}</div>
          <div><strong>创建时间:</strong> ${defaultName}</div>
        </div>
      </div>
    </div>
  `;

  elements.presetModalFooter.innerHTML = `
    <button class="modal-btn" id="connection-cancel-btn">取消</button>
    <button class="modal-btn primary" id="connection-save-btn">保存</button>
  `;

  elements.presetModal.style.display = 'flex';

  const nameInput = document.getElementById('connection-name-input');
  const saveBtn = document.getElementById('connection-save-btn');
  const cancelBtn = document.getElementById('connection-cancel-btn');

  cancelBtn.addEventListener('click', closeSavedConnectionsModal);

  saveBtn.addEventListener('click', async () => {
    if (!nameInput.value.trim()) {
      alert('请输入连接名称');
      return;
    }

    const name = nameInput.value.trim();
    const options = { name };

    if (existing) {
      const existingData = await getConnectionByOriginalId(connection.id);
      if (existingData) {
        options.savedId = existingData.id;
      }
    }

    try {
      const savedData = await saveConnection(connection, options);
      closeSavedConnectionsModal();
      alert('连接保存成功！');

      if (callbacks.renderConnectionList) {
        callbacks.renderConnectionList();
      }
    } catch (error) {
      console.error('保存失败:', error);
      alert('保存失败，请重试');
    }
  });

  nameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      saveBtn.click();
    }
  });
}

export async function showSavedConnectionsModal() {
  const savedConnections = await getAllSavedConnections();

  if (savedConnections.length === 0) {
    alert('暂无已保存的连接');
    return;
  }

  elements.savedConnectionsModalTitle.textContent = '已保存的连接';
  renderSavedConnectionsList(savedConnections);
  elements.savedConnectionsModal.style.display = 'flex';
}

export function renderSavedConnectionsList(connections) {
  elements.savedConnectionsList.innerHTML = connections.map(conn => {
    const savedAt = formatDateTime(conn.savedAt);
    const createdAt = formatDateTime(conn.createdAt);

    return `
      <div class="saved-connection-card" data-id="${conn.id}" data-original-id="${conn.originalId}">
        <div class="saved-connection-info">
          <div class="saved-connection-name">
            ${escapeHtml(conn.name)}
            ${conn.isIframe ? '<span class="badge-iframe">iframe</span>' : ''}
          </div>
          <div class="saved-connection-url" title="${escapeHtml(conn.url)}">
            ${escapeHtml(conn.url)}
          </div>
          <div class="saved-connection-meta">
            <span>💬 ${conn.messageCount} 条消息</span>
            <span>📅 保存于 ${savedAt}</span>
            <span>🕐 创建于 ${createdAt}</span>
          </div>
        </div>
        <div class="saved-connection-actions">
          <button class="saved-connection-btn load" title="加载此连接" data-id="${conn.id}">
            📤 加载
          </button>
          <button class="saved-connection-btn delete" title="删除此连接" data-id="${conn.id}">
            🗑️ 删除
          </button>
        </div>
      </div>
    `;
  }).join('');

  elements.savedConnectionsList.querySelectorAll('.saved-connection-btn.load').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      loadSavedConnection(btn.dataset.id);
    });
  });

  elements.savedConnectionsList.querySelectorAll('.saved-connection-btn.delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteSavedConnection(btn.dataset.id);
    });
  });
}

export async function loadSavedConnection(savedId) {
  try {
    const savedData = await loadConnection(savedId);
    if (!savedData) {
      alert('未找到连接数据');
      return;
    }

    const newConnectionId = `archived-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const connectionData = {
      id: newConnectionId,
      originalId: savedData.originalId,
      savedId: savedId,
      url: savedData.url,
      frameUrl: savedData.frameUrl,
      isIframe: savedData.isIframe,
      source: savedData.source,
      status: 'archived',
      createdAt: savedData.createdAt,
      messages: savedData.messages
    };

    addConnection(connectionData);

    if (callbacks.selectConnection) {
      callbacks.selectConnection(connectionData.id);
    }

    if (callbacks.renderConnectionList) {
      callbacks.renderConnectionList();
    }

    if (callbacks.renderMessageList) {
      callbacks.renderMessageList();
    }

    closeSavedConnectionsModal();
  } catch (error) {
    console.error('加载失败:', error);
    alert('加载失败，请重试');
  }
}

export async function deleteSavedConnection(savedId) {
  if (!confirm('确定要删除此连接吗？此操作不可恢复。')) {
    return;
  }

  try {
    await deleteConnection(savedId);
    
    const savedConnections = await getAllSavedConnections();
    if (savedConnections.length === 0) {
      closeSavedConnectionsModal();
    } else {
      renderSavedConnectionsList(savedConnections);
    }

    if (callbacks.renderConnectionList) {
      callbacks.renderConnectionList();
    }

    alert('连接已删除');
  } catch (error) {
    console.error('删除失败:', error);
    alert('删除失败，请重试');
  }
}

export async function deleteAllSavedConnections() {
  const savedConnections = await getAllSavedConnections();
  if (savedConnections.length === 0) {
    alert('暂无已保存的连接');
    return;
  }

  if (!confirm(`确定要删除所有 ${savedConnections.length} 个已保存的连接吗？此操作不可恢复。`)) {
    return;
  }

  try {
    await deleteAllConnections();
    closeSavedConnectionsModal();
    alert('所有连接已删除');
    
    if (callbacks.renderConnectionList) {
      callbacks.renderConnectionList();
    }
  } catch (error) {
    console.error('删除失败:', error);
    alert('删除失败，请重试');
  }
}

export function closeSavedConnectionsModal() {
  elements.savedConnectionsModal.style.display = 'none';
}

function formatDateTime(timestamp) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}
