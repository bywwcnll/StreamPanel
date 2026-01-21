// Connection storage module - IndexedDB operations

const DB_NAME = 'StreamPanelDB';
const DB_VERSION = 1;
const STORE_NAME = 'savedConnections';

let db = null;

export async function initDB() {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      try {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('originalId', 'originalId', { unique: false });
          store.createIndex('savedAt', 'savedAt', { unique: false });
          store.createIndex('url', 'url', { unique: false });
        }
      } catch (upgradeError) {
        console.error('[IndexedDB Upgrade] Error during database upgrade:', upgradeError);
      }
    };
  });
}

export async function saveConnection(connectionData, options = {}) {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    const savedData = {
      id: options.savedId || generateSavedId(),
      originalId: connectionData.id,
      name: options.name || getConnectionName(connectionData),
      url: connectionData.url,
      frameUrl: connectionData.frameUrl || null,
      isIframe: connectionData.isIframe || false,
      source: connectionData.source || 'unknown',
      status: connectionData.status,
      createdAt: connectionData.createdAt,
      savedAt: Date.now(),
      messages: JSON.parse(JSON.stringify(connectionData.messages)),
      messageCount: connectionData.messages.length
    };

    const request = store.put(savedData);

    request.onsuccess = () => resolve(savedData);
    request.onerror = () => reject(request.error);
  });
}

export async function loadConnection(savedId) {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(savedId);

    request.onsuccess = () => {
      if (request.result) {
        resolve(request.result);
      } else {
        resolve(null);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

export async function deleteConnection(savedId) {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(savedId);

    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteAllConnections() {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();

    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllSavedConnections() {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const connections = request.result || [];
      connections.sort((a, b) => b.savedAt - a.savedAt);
      resolve(connections);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function isConnectionSaved(originalId) {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('originalId');
    const request = index.get(originalId);

    request.onsuccess = () => {
      resolve(!!request.result);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getConnectionByOriginalId(originalId) {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('originalId');
    const request = index.get(originalId);

    request.onsuccess = () => {
      resolve(request.result || null);
    };
    request.onerror = () => reject(request.error);
  });
}

function generateSavedId() {
  return `saved-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function getConnectionName(connectionData) {
  if (!connectionData.createdAt) return '未命名连接';

  const date = new Date(connectionData.createdAt);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

export function getStorageStats() {
  return {
    dbName: DB_NAME,
    storeName: STORE_NAME,
    version: DB_VERSION
  };
}
