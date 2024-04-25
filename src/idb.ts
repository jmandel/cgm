const DB_NAME = 'sync-db';
const STORE_NAME = 'sync-store';
export const KEYS = {"syncURL": "syncURL", "accessToken": "accessToken"};

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    
    request.onerror = () => {
      reject(new Error('Failed to open database'));
    };
    
    request.onsuccess = () => {
      resolve(request.result);
    };
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      db.createObjectStore(STORE_NAME);
    };
  });
}

export function storeValue(key, value) {
  return openDatabase().then(db => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.put(value, key);
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => {
        resolve();
      };
      transaction.onerror = () => {
        reject(new Error('Failed to store value'));
      };
    });
  });
}

export function getValue(key) {
  return openDatabase().then(db => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    return new Promise((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => {
        resolve(request.result ?? "");
      };
      request.onerror = () => {
        reject(new Error('Failed to retrieve value'));
      };
    });
  });
}