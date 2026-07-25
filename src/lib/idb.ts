/**
 * Camada fina sobre o IndexedDB — só o suficiente pra guardar boards, itens
 * e preferências, com Promises no lugar dos callbacks do IDB.
 *
 * Todo o banco vive no navegador do usuário: nada sai da máquina.
 */

const DB_NAME = "referencias";
const DB_VERSION = 1;

export const STORE_ITEMS = "items";
export const STORE_BOARDS = "boards";
export const STORE_SETTINGS = "settings";

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDB(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB indisponível neste ambiente"));
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_ITEMS)) {
        const items = db.createObjectStore(STORE_ITEMS, { keyPath: "id" });
        items.createIndex("createdAt", "createdAt");
        items.createIndex("boardIds", "boardIds", { multiEntry: true });
        items.createIndex("tags", "tags", { multiEntry: true });
      }
      if (!db.objectStoreNames.contains(STORE_BOARDS)) {
        db.createObjectStore(STORE_BOARDS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS);
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      // Se outra aba pedir upgrade, soltamos a conexão pra não travá-la.
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error("Banco bloqueado por outra aba aberta"));
  });

  return dbPromise;
}

function tx(
  db: IDBDatabase,
  store: string,
  mode: IDBTransactionMode,
): IDBObjectStore {
  return db.transaction(store, mode).objectStore(store);
}

function wrap<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAll<T>(store: string): Promise<T[]> {
  const db = await openDB();
  return wrap(tx(db, store, "readonly").getAll() as IDBRequest<T[]>);
}

export async function put<T>(store: string, value: T, key?: IDBValidKey) {
  const db = await openDB();
  const objectStore = tx(db, store, "readwrite");
  await wrap(key === undefined ? objectStore.put(value) : objectStore.put(value, key));
  return value;
}

/** Grava vários registros na mesma transação — usado no import de backup. */
export async function putMany<T>(store: string, values: T[]) {
  if (values.length === 0) return;
  const db = await openDB();
  const transaction = db.transaction(store, "readwrite");
  const objectStore = transaction.objectStore(store);
  for (const value of values) objectStore.put(value);
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function remove(store: string, key: IDBValidKey) {
  const db = await openDB();
  await wrap(tx(db, store, "readwrite").delete(key));
}

export async function removeMany(store: string, keys: IDBValidKey[]) {
  if (keys.length === 0) return;
  const db = await openDB();
  const transaction = db.transaction(store, "readwrite");
  const objectStore = transaction.objectStore(store);
  for (const key of keys) objectStore.delete(key);
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function get<T>(store: string, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDB();
  return wrap(tx(db, store, "readonly").get(key) as IDBRequest<T | undefined>);
}

export async function clearStore(store: string) {
  const db = await openDB();
  await wrap(tx(db, store, "readwrite").clear());
}
