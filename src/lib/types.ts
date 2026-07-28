export type ItemKind = "link" | "image" | "note" | "palette";

/** Uma referência salva: um link, uma imagem ou uma nota solta. */
export interface Item {
  id: string;
  kind: ItemKind;
  title: string;
  /** Só em `link`: a URL original. */
  url?: string;
  /** Resumo do link ou corpo da nota. */
  description?: string;
  /** Capa remota (og:image) — usada quando não há blob local. */
  imageUrl?: string;
  /** Capa local (upload/print), guardada como Blob no IndexedDB. */
  imageBlob?: Blob;
  /** Id da mesma imagem no servidor, quando a sincronização está ligada. */
  imageAssetId?: string;
  /** Proporção da capa (largura/altura), pra reservar espaço antes de carregar. */
  imageRatio?: number;
  siteName?: string;
  faviconUrl?: string;
  /** Cor dominante aproximada da capa, usada como placeholder. */
  accentColor?: string;
  boardIds: string[];
  tags: string[];
  /** Só em `palette`: as cores, em "#rrggbb" minúsculo. */
  colors?: string[];
  /** Anotações próprias, separadas da descrição que veio do site. */
  notes?: string;
  favorite: boolean;
  createdAt: number;
  updatedAt: number;
  /** Última vez que a referência foi aberta — alimenta "Vistos recentemente". */
  openedAt?: number;
}

export interface Board {
  id: string;
  name: string;
  emoji: string;
  description?: string;
  color: string;
  createdAt: number;
  updatedAt: number;
  /** Ordem manual na sidebar. */
  position: number;
}

export interface Settings {
  theme: "dark" | "light";
  view: ViewMode;
  sort: SortMode;
  onboarded: boolean;
}

export type ViewMode = "mural" | "grade" | "lista";
export type SortMode = "recentes" | "antigos" | "titulo" | "abertos";

export interface Snapshot {
  boards: Board[];
  items: Item[];
  settings: Settings;
}

/** Formato do arquivo de export/import (backup). */
export interface BackupFile {
  format: "referencias/backup";
  version: 1;
  exportedAt: string;
  boards: Board[];
  /** Imagens locais viram data URL pra caber num único JSON portátil. */
  items: (Omit<Item, "imageBlob"> & { imageData?: string })[];
}

export const BOARD_COLORS = [
  "#d97757",
  "#c9a227",
  "#5b9279",
  "#4a86c5",
  "#8a6fc4",
  "#c4699a",
  "#7d8a99",
] as const;

export const BOARD_EMOJIS = [
  "🎨", "💡", "📐", "🧩", "🖼️", "✍️", "🎬", "🎧", "📊", "🧪",
  "🚀", "🏷️", "🧠", "📦", "🌱", "⚡", "🔭", "🗂️", "🪄", "🧭",
] as const;
