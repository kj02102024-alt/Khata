(function (g) {
  const DB_NAME = 'khata-offline';
  const STORE = 'queue';

  function open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function enqueue(item) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).add({ ...item, createdAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function list() {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function remove(id) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function flush(apiFn) {
    const items = await list();
    for (const item of items) {
      try {
        if (item.kind === 'entry') {
          await apiFn('/entries', { method: 'POST', body: item.payload });
        } else if (item.kind === 'diary') {
          const fd = new FormData();
          // payload.blobs: [{name, blob, type}]
          for (const b of item.payload.blobs || []) {
            fd.append('photos', b.blob, b.name);
          }
          if (item.payload.customerHint) fd.append('customerHint', item.payload.customerHint);
          await apiFn('/diary/upload', { method: 'POST', body: fd });
        }
        await remove(item.id);
      } catch (e) {
        console.warn('flush failed', e);
        break;
      }
    }
  }

  g.KhataIDB = { enqueue, list, remove, flush };
})(window);
