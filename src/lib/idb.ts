/**
 * Camada fina sobre o IndexedDB — só o suficiente pra guardar boards, itens
 * e preferências, com Promises no lugar dos callbacks do IDB.
 *
 * Todo o banco vive no navegador do usuário: nada sai da máquina.
 */

const DB_NAME = "referencias";
const DB_VERSION = 2;

export const STORE_ITEMS = "items";
export const STORE_BOARDS = "boards";
export const STORE_SETTINGS = "settings";
/** Ids alterados localmente e ainda não enviados ao servidor. */
export const STORE_PENDING = "pending";
/** Exclusões locais, guardadas até serem propagadas. */
export const STORE_TOMBSTONES = "tombstones";
/** Cursor de revisão e horário do último sync. */
export const STORE_SYNC = "sync";

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
      // v2 — filas da sincronização. Quem já usava o app em modo local só
      // ganha os stores vazios; nada do acervo é tocado.
      if (!db.objectStoreNames.contains(STORE_PENDING)) {
        db.createObjectStore(STORE_PENDING, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(STORE_TOMBSTONES)) {
        db.createObjectStore(STORE_TOMBSTONES, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(STORE_SYNC)) {
        db.createObjectStore(STORE_SYNC);
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

/* ─────────────────────── filas da sincronização ──────────────────────────── */

export type RecordKind = "item" | "board";

export interface PendingRow {
  key: string;
  kind: RecordKind;
  id: string;
  at: number;
}

export interface TombstoneRow {
  key: string;
  kind: RecordKind;
  id: string;
  deletedAt: number;
}

function syncKey(kind: RecordKind, id: string) {
  return `${kind}:${id}`;
}

/**
 * Marca um registro como alterado localmente e cancela uma exclusão anterior
 * do mesmo id — editar depois de apagar é uma ressurreição, não um conflito.
 */
export async function markPending(kind: RecordKind, ids: string[]) {
  if (ids.length === 0) return;
  const db = await openDB();
  const transaction = db.transaction([STORE_PENDING, STORE_TOMBSTONES], "readwrite");
  const pending = transaction.objectStore(STORE_PENDING);
  const tombstones = transaction.objectStore(STORE_TOMBSTONES);
  const at = Date.now();

  for (const id of ids) {
    const key = syncKey(kind, id);
    pending.put({ key, kind, id, at } satisfies PendingRow);
    tombstones.delete(key);
  }

  await done(transaction);
}

/** Registra exclusões e tira os mesmos ids da fila de envio. */
export async function markDeleted(kind: RecordKind, ids: string[]) {
  if (ids.length === 0) return;
  const db = await openDB();
  const transaction = db.transaction([STORE_PENDING, STORE_TOMBSTONES], "readwrite");
  const pending = transaction.objectStore(STORE_PENDING);
  const tombstones = transaction.objectStore(STORE_TOMBSTONES);
  const deletedAt = Date.now();

  for (const id of ids) {
    const key = syncKey(kind, id);
    tombstones.put({ key, kind, id, deletedAt } satisfies TombstoneRow);
    pending.delete(key);
  }

  await done(transaction);
}

export async function getPending(): Promise<PendingRow[]> {
  return getAll<PendingRow>(STORE_PENDING);
}

export async function getTombstones(): Promise<TombstoneRow[]> {
  return getAll<TombstoneRow>(STORE_TOMBSTONES);
}

/**
 * Tira da fila só o que não mudou desde a leitura. Se o usuário editou o mesmo
 * item enquanto o push estava no ar, `at` mudou e o registro continua
 * pendente — do contrário essa edição se perderia sem nunca ter sido enviada.
 */
export async function clearPendingIfUnchanged(rows: PendingRow[]) {
  if (rows.length === 0) return;
  const db = await openDB();
  const transaction = db.transaction(STORE_PENDING, "readwrite");
  const store = transaction.objectStore(STORE_PENDING);

  for (const row of rows) {
    const request = store.get(row.key);
    request.onsuccess = () => {
      const current = request.result as PendingRow | undefined;
      if (current && current.at === row.at) store.delete(row.key);
    };
  }

  await done(transaction);
}

export async function clearPending(keys: string[]) {
  await removeMany(STORE_PENDING, keys);
}

export async function clearTombstones(keys: string[]) {
  await removeMany(STORE_TOMBSTONES, keys);
}

export interface SyncMeta {
  cursor: number;
  lastSyncAt: number;
  /** Conta a que o cursor pertence — trocar de conta zera o cursor. */
  userId: string | null;
}

const SYNC_META_KEY = "meta";

export async function getSyncMeta(): Promise<SyncMeta> {
  const stored = await get<SyncMeta>(STORE_SYNC, SYNC_META_KEY);
  return stored ?? { cursor: 0, lastSyncAt: 0, userId: null };
}

export async function setSyncMeta(meta: SyncMeta) {
  await put(STORE_SYNC, meta, SYNC_META_KEY);
}

function done(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
