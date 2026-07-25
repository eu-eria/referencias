import type { Board, Item } from "./types";

/**
 * Formato trocado entre o navegador e `/api/sync`. Fica fora de `lib/server`
 * porque os dois lados importam daqui.
 */

/** Item sem o Blob: a imagem viaja separada, por `/api/assets`. */
export type SyncItem = Omit<Item, "imageBlob"> & { imageAssetId?: string };
export type SyncBoard = Board;

export interface Tombstone {
  kind: "item" | "board";
  id: string;
  deletedAt: number;
}

export interface SyncRequest {
  /** Última revisão que este dispositivo já recebeu. 0 na primeira vez. */
  since: number;
  boards: SyncBoard[];
  items: SyncItem[];
  deletions: Tombstone[];
}

export interface SyncResponse {
  /** Nova posição do cursor. O cliente guarda e manda no próximo `since`. */
  revision: number;
  boards: SyncBoard[];
  items: SyncItem[];
  deletions: Tombstone[];
  serverTime: number;
}

/** Quantos registros vão por requisição — mantém o corpo em alguns poucos MB. */
export const SYNC_BATCH_SIZE = 200;

/** Teto por imagem enviada ao servidor. */
export const MAX_ASSET_BYTES = 8 * 1024 * 1024;
