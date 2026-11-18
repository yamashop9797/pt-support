// IndexedDB(iPhoneの中だけにデータを保存する場所)
const DB_NAME = 'pt-support';
const DB_VERSION = 1;
// records は第2段階(毎日の記録・FIM・InBodyなど)のための入れ物。今はまだ使わない。
export const STORES = {
  kv: 'key',          // 設定など
  patients: 'id',
  events: 'id',
  holidays: 'date',
  flags: 'key',       // 「確認した」などの印
  plans: 'month',     // 月ごとの計画書の対象者
  records: 'id',      // 第2段階用
};

let dbp;
export function openDB() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [name, keyPath] of Object.entries(STORES)) {
        if (!db.objectStoreNames.contains(name)) {
          const s = db.createObjectStore(name, { keyPath });
          if (name === 'records') {
            s.createIndex('patientId', 'patientId');
            s.createIndex('type', 'type');
          }
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function tx(store, mode, fn) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(store, mode);
        const s = t.objectStore(store);
        const r = fn(s);
        t.oncomplete = () => resolve(r && 'result' in r ? r.result : undefined);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}
export const getAll = (store) => tx(store, 'readonly', (s) => s.getAll());
export const get = (store, key) => tx(store, 'readonly', (s) => s.get(key));
export const put = (store, obj) => tx(store, 'readwrite', (s) => s.put(obj));
export const del = (store, key) => tx(store, 'readwrite', (s) => s.delete(key));

export async function exportAll() {
  const data = {};
  for (const name of Object.keys(STORES)) data[name] = await getAll(name);
  return data;
}
export async function importAll(data) {
  const db = await openDB();
  const names = Object.keys(STORES);
  await new Promise((resolve, reject) => {
    const t = db.transaction(names, 'readwrite');
    for (const name of names) {
      const s = t.objectStore(name);
      s.clear();
      for (const row of data[name] || []) s.put(row);
    }
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}
export async function clearAll() {
  await importAll({});
}
