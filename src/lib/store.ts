"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  STORE_BOARDS,
  STORE_ITEMS,
  STORE_SETTINGS,
  clearStore,
  getAll,
  put,
  putMany,
  remove,
  removeMany,
} from "./idb";
import type { BackupFile, Board, Item, Settings, SortMode, ViewMode } from "./types";
import { buildSeed } from "./seed";
import { blobToDataUrl, dataUrlToBlob, uid } from "./utils";

const DEFAULT_SETTINGS: Settings = {
  theme: "dark",
  view: "mural",
  sort: "recentes",
  onboarded: false,
};

export interface StoreState {
  ready: boolean;
  boards: Board[];
  items: Item[];
  settings: Settings;
}

let state: StoreState = {
  ready: false,
  boards: [],
  items: [],
  settings: DEFAULT_SETTINGS,
};

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function setState(patch: Partial<StoreState>) {
  state = { ...state, ...patch };
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): StoreState {
  return state;
}

// No servidor não existe IndexedDB: devolvemos um estado vazio e estável para
// o React não acusar mismatch de hidratação.
const SERVER_SNAPSHOT: StoreState = {
  ready: false,
  boards: [],
  items: [],
  settings: DEFAULT_SETTINGS,
};
function getServerSnapshot(): StoreState {
  return SERVER_SNAPSHOT;
}

export function useStore(): StoreState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/* ─────────────────────────── carregamento inicial ────────────────────────── */

let loadPromise: Promise<void> | null = null;

export function loadStore(): Promise<void> {
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      const [boards, items, savedSettings] = await Promise.all([
        getAll<Board>(STORE_BOARDS),
        getAll<Item>(STORE_ITEMS),
        getAll<Settings>(STORE_SETTINGS),
      ]);

      // O tema também vive no localStorage porque o script inline do layout
      // precisa dele antes da primeira pintura — o IndexedDB é assíncrono.
      const saved = savedSettings[0];
      const settings: Settings = {
        ...DEFAULT_SETTINGS,
        ...(saved ?? {}),
        theme: saved?.theme ?? readBootTheme(),
      };

      // Primeira visita: um punhado de referências reais pra plataforma não
      // abrir vazia e o usuário já ver como as coisas se organizam.
      if (boards.length === 0 && items.length === 0 && !settings.onboarded) {
        const seed = buildSeed();
        await putMany(STORE_BOARDS, seed.boards);
        await putMany(STORE_ITEMS, seed.items);
        const seeded = { ...settings, onboarded: true };
        await put(STORE_SETTINGS, seeded, "app");
        setState({
          ready: true,
          boards: seed.boards,
          items: seed.items,
          settings: seeded,
        });
        return;
      }

      setState({
        ready: true,
        boards: sortBoards(boards),
        items,
        settings,
      });
    } catch (error) {
      console.error("Falha ao abrir o banco local", error);
      // Modo degradado: a sessão funciona em memória, sem persistir.
      setState({ ready: true });
    }
  })();

  return loadPromise;
}

export const THEME_STORAGE_KEY = "referencias:theme";

function readBootTheme(): Settings["theme"] {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "dark" || saved === "light") return saved;
    return window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  } catch {
    return DEFAULT_SETTINGS.theme;
  }
}

function sortBoards(boards: Board[]): Board[] {
  return [...boards].sort((a, b) => a.position - b.position || a.createdAt - b.createdAt);
}

/* ───────────────────────────────── itens ─────────────────────────────────── */

export type NewItem = Omit<Item, "id" | "createdAt" | "updatedAt" | "favorite"> &
  Partial<Pick<Item, "id" | "createdAt" | "updatedAt" | "favorite">>;

export async function createItem(input: NewItem): Promise<Item> {
  const now = Date.now();
  const item: Item = {
    favorite: false,
    ...input,
    id: input.id ?? uid(),
    createdAt: input.createdAt ?? now,
    updatedAt: now,
  };
  setState({ items: [item, ...state.items] });
  await put(STORE_ITEMS, item);
  return item;
}

export async function createItems(inputs: NewItem[]): Promise<Item[]> {
  const now = Date.now();
  const items: Item[] = inputs.map((input, index) => ({
    favorite: false,
    ...input,
    id: input.id ?? uid(),
    // O deslocamento por índice preserva a ordem do lote na listagem.
    createdAt: input.createdAt ?? now - index,
    updatedAt: now - index,
  }));
  setState({ items: [...items, ...state.items] });
  await putMany(STORE_ITEMS, items);
  return items;
}

export async function updateItem(id: string, patch: Partial<Item>): Promise<void> {
  const current = state.items.find((item) => item.id === id);
  if (!current) return;
  const next: Item = { ...current, ...patch, id, updatedAt: Date.now() };
  setState({ items: state.items.map((item) => (item.id === id ? next : item)) });
  await put(STORE_ITEMS, next);
}

export async function deleteItem(id: string): Promise<void> {
  setState({ items: state.items.filter((item) => item.id !== id) });
  await remove(STORE_ITEMS, id);
}

export async function deleteItems(ids: string[]): Promise<void> {
  const set = new Set(ids);
  setState({ items: state.items.filter((item) => !set.has(item.id)) });
  await removeMany(STORE_ITEMS, ids);
}

export async function toggleFavorite(id: string): Promise<void> {
  const current = state.items.find((item) => item.id === id);
  if (!current) return;
  await updateItem(id, { favorite: !current.favorite });
}

/** Registra a abertura sem mexer em `updatedAt` (não é uma edição). */
export async function markOpened(id: string): Promise<void> {
  const current = state.items.find((item) => item.id === id);
  if (!current) return;
  const next: Item = { ...current, openedAt: Date.now() };
  setState({ items: state.items.map((item) => (item.id === id ? next : item)) });
  await put(STORE_ITEMS, next);
}

export async function setItemBoards(ids: string[], boardIds: string[]): Promise<void> {
  const set = new Set(ids);
  const now = Date.now();
  const updated: Item[] = [];
  const items = state.items.map((item) => {
    if (!set.has(item.id)) return item;
    const next = { ...item, boardIds, updatedAt: now };
    updated.push(next);
    return next;
  });
  setState({ items });
  await putMany(STORE_ITEMS, updated);
}

/** Adiciona um board à seleção sem remover os que já estavam lá. */
export async function addItemsToBoard(ids: string[], boardId: string): Promise<void> {
  const set = new Set(ids);
  const now = Date.now();
  const updated: Item[] = [];
  const items = state.items.map((item) => {
    if (!set.has(item.id) || item.boardIds.includes(boardId)) return item;
    const next = { ...item, boardIds: [...item.boardIds, boardId], updatedAt: now };
    updated.push(next);
    return next;
  });
  setState({ items });
  await putMany(STORE_ITEMS, updated);
}

export async function addTagToItems(ids: string[], tag: string): Promise<void> {
  const set = new Set(ids);
  const now = Date.now();
  const updated: Item[] = [];
  const items = state.items.map((item) => {
    if (!set.has(item.id) || item.tags.includes(tag)) return item;
    const next = { ...item, tags: [...item.tags, tag], updatedAt: now };
    updated.push(next);
    return next;
  });
  setState({ items });
  await putMany(STORE_ITEMS, updated);
}

/** Renomeia uma tag em todos os itens de uma vez. */
export async function renameTag(from: string, to: string): Promise<void> {
  const now = Date.now();
  const updated: Item[] = [];
  const items = state.items.map((item) => {
    if (!item.tags.includes(from)) return item;
    const tags = Array.from(new Set(item.tags.map((tag) => (tag === from ? to : tag))));
    const next = { ...item, tags, updatedAt: now };
    updated.push(next);
    return next;
  });
  setState({ items });
  await putMany(STORE_ITEMS, updated);
}

export async function deleteTag(tag: string): Promise<void> {
  const now = Date.now();
  const updated: Item[] = [];
  const items = state.items.map((item) => {
    if (!item.tags.includes(tag)) return item;
    const next = { ...item, tags: item.tags.filter((t) => t !== tag), updatedAt: now };
    updated.push(next);
    return next;
  });
  setState({ items });
  await putMany(STORE_ITEMS, updated);
}

/* ───────────────────────────────── boards ────────────────────────────────── */

export type NewBoard = Omit<Board, "id" | "createdAt" | "updatedAt" | "position"> &
  Partial<Pick<Board, "id" | "position">>;

export async function createBoard(input: NewBoard): Promise<Board> {
  const now = Date.now();
  const board: Board = {
    ...input,
    id: input.id ?? uid(),
    position: input.position ?? state.boards.length,
    createdAt: now,
    updatedAt: now,
  };
  setState({ boards: sortBoards([...state.boards, board]) });
  await put(STORE_BOARDS, board);
  return board;
}

export async function updateBoard(id: string, patch: Partial<Board>): Promise<void> {
  const current = state.boards.find((board) => board.id === id);
  if (!current) return;
  const next: Board = { ...current, ...patch, id, updatedAt: Date.now() };
  setState({
    boards: sortBoards(state.boards.map((board) => (board.id === id ? next : board))),
  });
  await put(STORE_BOARDS, next);
}

/** Apaga o board e desvincula os itens — as referências continuam existindo. */
export async function deleteBoard(id: string): Promise<void> {
  const now = Date.now();
  const touched: Item[] = [];
  const items = state.items.map((item) => {
    if (!item.boardIds.includes(id)) return item;
    const next = {
      ...item,
      boardIds: item.boardIds.filter((boardId) => boardId !== id),
      updatedAt: now,
    };
    touched.push(next);
    return next;
  });

  setState({ boards: state.boards.filter((board) => board.id !== id), items });
  await remove(STORE_BOARDS, id);
  await putMany(STORE_ITEMS, touched);
}

export async function reorderBoards(orderedIds: string[]): Promise<void> {
  const positions = new Map(orderedIds.map((id, index) => [id, index]));
  const boards = state.boards.map((board) => ({
    ...board,
    position: positions.get(board.id) ?? board.position,
  }));
  setState({ boards: sortBoards(boards) });
  await putMany(STORE_BOARDS, boards);
}

/* ────────────────────────────── preferências ─────────────────────────────── */

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  const settings = { ...state.settings, ...patch };
  setState({ settings });
  if (patch.theme) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, patch.theme);
    } catch {
      /* modo privado sem localStorage: só perde o anti-flash */
    }
  }
  await put(STORE_SETTINGS, settings, "app");
}

export function setView(view: ViewMode) {
  void updateSettings({ view });
}

export function setSort(sort: SortMode) {
  void updateSettings({ sort });
}

export function toggleTheme() {
  void updateSettings({ theme: state.settings.theme === "dark" ? "light" : "dark" });
}

/* ─────────────────────────── backup: export/import ───────────────────────── */

export async function exportBackup(): Promise<Blob> {
  const items = await Promise.all(
    state.items.map(async ({ imageBlob, ...rest }) => ({
      ...rest,
      imageData: imageBlob ? await blobToDataUrl(imageBlob) : undefined,
    })),
  );

  const backup: BackupFile = {
    format: "referencias/backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    boards: state.boards,
    items,
  };

  return new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
}

export interface ImportResult {
  boards: number;
  items: number;
}

/**
 * Importa um backup somando ao acervo atual (não apaga nada). IDs repetidos
 * são regravados por cima, então reimportar o mesmo arquivo não duplica itens.
 */
export async function importBackup(file: File): Promise<ImportResult> {
  const text = await file.text();
  const parsed = JSON.parse(text) as Partial<BackupFile>;

  if (parsed.format !== "referencias/backup" || !Array.isArray(parsed.items)) {
    throw new Error("Arquivo não parece um backup de Referências");
  }

  const boards: Board[] = (parsed.boards ?? []).filter(
    (board): board is Board => Boolean(board?.id && board?.name),
  );

  const items: Item[] = [];
  for (const raw of parsed.items) {
    if (!raw?.id) continue;
    const { imageData, ...rest } = raw;
    items.push({
      ...(rest as Omit<Item, "imageBlob">),
      tags: Array.isArray(rest.tags) ? rest.tags : [],
      boardIds: Array.isArray(rest.boardIds) ? rest.boardIds : [],
      imageBlob: imageData ? await dataUrlToBlob(imageData) : undefined,
    });
  }

  await putMany(STORE_BOARDS, boards);
  await putMany(STORE_ITEMS, items);

  const boardMap = new Map(state.boards.map((board) => [board.id, board]));
  boards.forEach((board) => boardMap.set(board.id, board));
  const itemMap = new Map(state.items.map((item) => [item.id, item]));
  items.forEach((item) => itemMap.set(item.id, item));

  setState({
    boards: sortBoards(Array.from(boardMap.values())),
    items: Array.from(itemMap.values()),
  });

  return { boards: boards.length, items: items.length };
}

export async function resetAll(): Promise<void> {
  await Promise.all([clearStore(STORE_ITEMS), clearStore(STORE_BOARDS)]);
  setState({ items: [], boards: [] });
}

/* ─────────────────────────────── seletores ───────────────────────────────── */

export function useTagCounts(): Map<string, number> {
  const { items } = useStore();
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const tag of item.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return counts;
}

export function useBoardCounts(): Map<string, number> {
  const { items } = useStore();
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const boardId of item.boardIds) {
      counts.set(boardId, (counts.get(boardId) ?? 0) + 1);
    }
  }
  return counts;
}

export function useActions() {
  return useCallback(
    () => ({
      createItem,
      createItems,
      updateItem,
      deleteItem,
      deleteItems,
      toggleFavorite,
      markOpened,
      createBoard,
      updateBoard,
      deleteBoard,
    }),
    [],
  )();
}
