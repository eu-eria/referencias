"use client";

import { useSyncExternalStore } from "react";
import {
  clearPendingIfUnchanged,
  clearTombstones,
  getPending,
  getSyncMeta,
  getTombstones,
  setSyncMeta,
  type PendingRow,
} from "./idb";
import {
  applyRemote,
  applyRemoteItem,
  getState,
  markEverythingPending,
  subscribeStore,
} from "./store";
import type { Board, Item } from "./types";
import type { SyncItem, SyncRequest, SyncResponse, Tombstone } from "./syncTypes";
import { SYNC_BATCH_SIZE } from "./syncTypes";

/**
 * Motor de sincronização.
 *
 * O IndexedDB continua sendo a fonte de render — a tela nunca espera a rede.
 * Por cima disso roda um push/pull incremental: o que mudou aqui sobe, o que
 * mudou em outro dispositivo desce, e um cursor de revisão marca até onde já
 * chegamos. Sem rede, o app funciona igual e a fila espera.
 */

export type SyncStatus =
  /** Sem DATABASE_URL no servidor: a sincronização não existe nesta instalação. */
  | "unconfigured"
  /** Configurada, mas ninguém logado neste navegador. */
  | "signed-out"
  | "idle"
  | "syncing"
  | "offline"
  | "error";

export interface SyncState {
  status: SyncStatus;
  user: { id: string; email: string } | null;
  lastSyncAt: number;
  pending: number;
  error: string | null;
}

let state: SyncState = {
  status: "signed-out",
  user: null,
  lastSyncAt: 0,
  pending: 0,
  error: null,
};

const listeners = new Set<() => void>();

function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const SERVER_STATE: SyncState = {
  status: "signed-out",
  user: null,
  lastSyncAt: 0,
  pending: 0,
  error: null,
};

export function useSyncState(): SyncState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => SERVER_STATE,
  );
}

/* ─────────────────────────────── conta ───────────────────────────────────── */

interface AuthResponse {
  configured: boolean;
  user: { id: string; email: string } | null;
}

let initialized = false;

export async function initSync(): Promise<void> {
  if (initialized) return;
  initialized = true;

  try {
    const response = await fetch("/api/auth/me", { cache: "no-store" });
    const data = (await response.json()) as AuthResponse;

    if (!data.configured) {
      setState({ status: "unconfigured", user: null });
      return;
    }

    if (data.user) {
      setState({ status: "idle", user: data.user });
      await onSignedIn(data.user.id);
    } else {
      setState({ status: "signed-out", user: null });
    }
  } catch {
    // Servidor fora do ar na abertura: o app segue local até a próxima tentativa.
    setState({ status: "unconfigured", user: null });
    return;
  }

  installTriggers();
  await refreshPendingCount();
  if (state.user) void syncNow();
}

export async function signIn(
  email: string,
  password: string,
  mode: "login" | "register",
): Promise<void> {
  const response = await fetch(`/api/auth/${mode}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const data = (await response.json().catch(() => ({}))) as {
    user?: { id: string; email: string };
    error?: string;
  };

  if (!response.ok || !data.user) {
    throw new Error(data.error ?? "Não consegui entrar");
  }

  setState({ status: "idle", user: data.user, error: null });
  await onSignedIn(data.user.id);
  installTriggers();
  await syncNow();
}

export async function signOut(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  // O acervo local fica: sair da conta não é apagar o que está no aparelho.
  await setSyncMeta({ cursor: 0, lastSyncAt: 0, userId: null });
  setState({ status: "signed-out", user: null, lastSyncAt: 0, error: null });
}

/**
 * Primeiro login neste dispositivo: o que já estava salvo localmente entra na
 * fila de envio, em vez de ficar órfão fora da conta. Trocar de conta zera o
 * cursor, senão o novo login herdaria a posição da conta anterior.
 */
async function onSignedIn(userId: string) {
  const meta = await getSyncMeta();
  if (meta.userId !== userId) {
    await setSyncMeta({ cursor: 0, lastSyncAt: 0, userId });
    await markEverythingPending();
  }
  await refreshPendingCount();
}

/* ─────────────────────────────── gatilhos ────────────────────────────────── */

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let intervalTimer: ReturnType<typeof setInterval> | null = null;
let triggersInstalled = false;

const DEBOUNCE_MS = 1_500;
const INTERVAL_MS = 60_000;

function installTriggers() {
  if (triggersInstalled || typeof window === "undefined") return;
  triggersInstalled = true;

  // Qualquer mutação no acervo agenda um envio.
  subscribeStore(() => scheduleSync());

  intervalTimer = setInterval(() => {
    if (state.user && document.visibilityState === "visible") void syncNow();
  }, INTERVAL_MS);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && state.user) void syncNow();
  });
  window.addEventListener("online", () => {
    if (state.user) void syncNow();
  });
  window.addEventListener("focus", () => {
    if (state.user) void syncNow();
  });
}

export function stopSync() {
  if (intervalTimer) clearInterval(intervalTimer);
  if (debounceTimer) clearTimeout(debounceTimer);
  intervalTimer = null;
  debounceTimer = null;
}

function scheduleSync() {
  if (!state.user) return;
  // Mutação no meio de uma rodada entra na próxima em vez de abrir uma
  // segunda em paralelo sobre a mesma fila.
  if (running) {
    queued = true;
    return;
  }
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void syncNow();
  }, DEBOUNCE_MS);
}

/* ──────────────────────────────── o ciclo ────────────────────────────────── */

let running = false;
let queued = false;

export async function syncNow(): Promise<void> {
  if (!state.user) return;
  if (running) {
    // Uma rodada já está no ar; marcamos pra rodar de novo em seguida em vez
    // de disparar duas ao mesmo tempo sobre a mesma fila.
    queued = true;
    return;
  }

  running = true;
  setState({ status: "syncing", error: null });

  try {
    await uploadPendingAssets();

    // Enquanto houver fila, manda em lotes; o último ciclo (ou o único, se não
    // havia nada pendente) serve como pull.
    let guard = 0;
    let more = true;
    while (more && guard < 50) {
      guard += 1;
      more = await pushAndPullOnce();
    }

    await downloadMissingAssets();

    const meta = await getSyncMeta();
    const lastSyncAt = Date.now();
    await setSyncMeta({ ...meta, lastSyncAt });
    setState({ status: "idle", lastSyncAt, error: null });
    await refreshPendingCount();
  } catch (error) {
    const offline = typeof navigator !== "undefined" && !navigator.onLine;
    setState({
      status: offline ? "offline" : "error",
      error: error instanceof Error ? error.message : "Falha ao sincronizar",
    });
    await refreshPendingCount();
  } finally {
    running = false;
    if (queued) {
      queued = false;
      void syncNow();
    }
  }
}

/** Devolve true se ainda restou fila depois deste lote. */
async function pushAndPullOnce(): Promise<boolean> {
  const meta = await getSyncMeta();
  const { items: localItems, boards: localBoards } = getState();

  const pending = await getPending();
  const tombstones = await getTombstones();

  const itemById = new Map(localItems.map((item) => [item.id, item]));
  const boardById = new Map(localBoards.map((board) => [board.id, board]));

  const pendingItems: PendingRow[] = [];
  const pendingBoards: PendingRow[] = [];
  for (const row of pending) {
    if (row.kind === "item" && itemById.has(row.id)) pendingItems.push(row);
    else if (row.kind === "board" && boardById.has(row.id)) pendingBoards.push(row);
    // Pendência de algo que não existe mais localmente é lixo: a exclusão já
    // virou lápide e é ela que será enviada.
  }

  const itemBatch = pendingItems.slice(0, SYNC_BATCH_SIZE);
  const boardBatch = pendingBoards.slice(0, SYNC_BATCH_SIZE);
  const deletionBatch = tombstones.slice(0, SYNC_BATCH_SIZE * 2);

  const request: SyncRequest = {
    since: meta.cursor,
    items: itemBatch.map((row) => toSyncItem(itemById.get(row.id)!)),
    boards: boardBatch.map((row) => boardById.get(row.id)!),
    deletions: deletionBatch.map(
      (row): Tombstone => ({ kind: row.kind, id: row.id, deletedAt: row.deletedAt }),
    ),
  };

  const response = await fetch("/api/sync", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });

  if (response.status === 401) {
    setState({ status: "signed-out", user: null });
    throw new Error("Sessão expirada. Entre de novo pra sincronizar.");
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Servidor respondeu ${response.status}`);
  }

  const payload = (await response.json()) as SyncResponse;

  await applyRemote({
    boards: payload.boards,
    items: payload.items.map(fromSyncItem),
    deletions: payload.deletions,
  });

  await clearPendingIfUnchanged([...itemBatch, ...boardBatch]);
  await clearTombstones(deletionBatch.map((row) => row.key));
  await setSyncMeta({ ...meta, cursor: payload.revision });

  return (
    pendingItems.length > itemBatch.length ||
    pendingBoards.length > boardBatch.length ||
    tombstones.length > deletionBatch.length
  );
}

/* ──────────────────────────────── imagens ────────────────────────────────── */

/**
 * Sobe as capas locais que ainda não existem no servidor. Precisa acontecer
 * antes do push: é o upload que gera o `imageAssetId` que vai no payload.
 */
async function uploadPendingAssets(): Promise<void> {
  const { items } = getState();
  const toUpload = items.filter((item) => item.imageBlob && !item.imageAssetId);

  for (const item of toUpload.slice(0, 20)) {
    try {
      const blob = item.imageBlob!;
      const response = await fetch("/api/assets", {
        method: "POST",
        headers: { "content-type": blob.type || "image/webp" },
        body: blob,
      });
      if (!response.ok) continue;

      const { id } = (await response.json()) as { id: string };
      // updateItem marcaria pendente de novo — e é isso que queremos aqui:
      // o item precisa subir carregando o id da imagem.
      const { updateItem } = await import("./store");
      await updateItem(item.id, { imageAssetId: id });
    } catch {
      // Rede caiu no meio: tenta de novo na próxima rodada.
      break;
    }
  }
}

/** Traz pro banco local as capas que chegaram só como referência. */
async function downloadMissingAssets(): Promise<void> {
  const { items } = getState();
  const missing = items.filter((item) => item.imageAssetId && !item.imageBlob);

  for (const item of missing.slice(0, 20)) {
    try {
      const response = await fetch(`/api/assets/${item.imageAssetId}`);
      if (!response.ok) continue;
      const blob = await response.blob();
      // Chegou do servidor: gravar sem enfileirar envio de volta.
      await applyRemoteItem({ ...item, imageBlob: blob });
    } catch {
      break;
    }
  }
}

/* ─────────────────────────────── conversão ───────────────────────────────── */

function toSyncItem(item: Item): SyncItem {
  const { imageBlob: _imageBlob, ...rest } = item;
  return rest;
}

function fromSyncItem(item: SyncItem): Item {
  return item as Item;
}

async function refreshPendingCount() {
  try {
    const [pending, tombstones] = await Promise.all([getPending(), getTombstones()]);
    setState({ pending: pending.length + tombstones.length });
  } catch {
    setState({ pending: 0 });
  }
}

export type { Board, Item };
