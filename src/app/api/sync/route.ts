import { NextResponse } from "next/server";
import { currentUser } from "@/lib/server/auth";
import { getDb, nextRevision, type Db } from "@/lib/server/db";
import { badRequest, handled, unauthorized } from "@/lib/server/respond";
import type {
  SyncBoard,
  SyncItem,
  SyncRequest,
  SyncResponse,
  Tombstone,
} from "@/lib/syncTypes";
import { SYNC_BATCH_SIZE } from "@/lib/syncTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Push e pull na mesma transação.
 *
 * O cliente manda o que mudou desde o último sync e a revisão que já viu; o
 * servidor grava, atribui uma revisão nova ao lote e devolve tudo que passou
 * dessa revisão — inclusive o que acabou de ser gravado. Fazer os dois de uma
 * vez elimina a janela em que outro dispositivo escreve entre o push e o pull
 * e a mudança dele fica para trás do cursor sem nunca ter sido baixada.
 *
 * Conflito resolve por `updatedAt` do registro (última escrita vence). Quando
 * o servidor ganha, a linha ainda assim recebe a revisão nova — assim ela volta
 * no mesmo pull e o dispositivo que perdeu se corrige na hora, em vez de ficar
 * com a versão velha até a próxima edição.
 */
export async function POST(request: Request) {
  return handled(async () => {
    const user = await currentUser();
    if (!user) return unauthorized();

    const body = (await request.json().catch(() => null)) as SyncRequest | null;
    if (!body || typeof body !== "object") return badRequest("Corpo inválido");

    const since = Number.isFinite(body.since) ? Math.max(0, Number(body.since)) : 0;
    const boards = Array.isArray(body.boards) ? body.boards.slice(0, SYNC_BATCH_SIZE) : [];
    const items = Array.isArray(body.items) ? body.items.slice(0, SYNC_BATCH_SIZE) : [];
    const deletions = Array.isArray(body.deletions)
      ? body.deletions.slice(0, SYNC_BATCH_SIZE * 2)
      : [];

    const db = await getDb();

    const payload = await db.transaction<SyncResponse>(async (tx) => {
      const revision = await nextRevision(tx, user.id);

      for (const board of boards) {
        if (isValidBoard(board)) await writeBoard(tx, user.id, board, revision);
      }
      for (const item of items) {
        if (isValidItem(item)) await writeItem(tx, user.id, item, revision);
      }
      for (const tombstone of deletions) {
        if (isValidTombstone(tombstone)) {
          await writeTombstone(tx, user.id, tombstone, revision);
        }
      }

      return readSince(tx, user.id, since, revision);
    });

    return NextResponse.json(payload);
  });
}

/* ─────────────────────────────── escrita ─────────────────────────────────── */

async function currentUpdatedAt(
  db: Db,
  table: "boards" | "items",
  userId: string,
  id: string,
): Promise<number | null> {
  const rows = await db.query<{ updated_at: number | string }>(
    `SELECT updated_at FROM ${table} WHERE user_id = $1 AND id = $2`,
    [userId, id],
  );
  return rows[0] ? Number(rows[0].updated_at) : null;
}

/** Só marca a revisão, mantendo os valores do servidor (ele venceu o conflito). */
async function touch(
  db: Db,
  table: "boards" | "items",
  userId: string,
  id: string,
  revision: number,
) {
  await db.execute(
    `UPDATE ${table} SET revision = $1 WHERE user_id = $2 AND id = $3`,
    [revision, userId, id],
  );
}

async function writeBoard(db: Db, userId: string, board: SyncBoard, revision: number) {
  const existing = await currentUpdatedAt(db, "boards", userId, board.id);
  if (existing !== null && existing > board.updatedAt) {
    await touch(db, "boards", userId, board.id, revision);
    return;
  }

  await db.execute(
    `INSERT INTO boards
       (user_id, id, name, emoji, color, description, position,
        created_at, updated_at, deleted_at, revision)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NULL, $10)
     ON CONFLICT (user_id, id) DO UPDATE SET
       name = EXCLUDED.name,
       emoji = EXCLUDED.emoji,
       color = EXCLUDED.color,
       description = EXCLUDED.description,
       position = EXCLUDED.position,
       created_at = EXCLUDED.created_at,
       updated_at = EXCLUDED.updated_at,
       deleted_at = NULL,
       revision = EXCLUDED.revision`,
    [
      userId,
      board.id,
      text(board.name, 200),
      text(board.emoji, 16),
      text(board.color, 32),
      optionalText(board.description, 500),
      Math.trunc(Number(board.position) || 0),
      timestamp(board.createdAt),
      timestamp(board.updatedAt),
      revision,
    ],
  );
}

async function writeItem(db: Db, userId: string, item: SyncItem, revision: number) {
  const existing = await currentUpdatedAt(db, "items", userId, item.id);
  if (existing !== null && existing > item.updatedAt) {
    await touch(db, "items", userId, item.id, revision);
    return;
  }

  await db.execute(
    `INSERT INTO items
       (user_id, id, kind, title, url, description, image_url, image_asset_id,
        image_ratio, site_name, favicon_url, accent_color, board_ids, tags,
        colors, notes, favorite, created_at, updated_at, opened_at, deleted_at, revision)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
             $15, $16, $17, $18, $19, $20, NULL, $21)
     ON CONFLICT (user_id, id) DO UPDATE SET
       kind = EXCLUDED.kind,
       title = EXCLUDED.title,
       url = EXCLUDED.url,
       description = EXCLUDED.description,
       image_url = EXCLUDED.image_url,
       image_asset_id = EXCLUDED.image_asset_id,
       image_ratio = EXCLUDED.image_ratio,
       site_name = EXCLUDED.site_name,
       favicon_url = EXCLUDED.favicon_url,
       accent_color = EXCLUDED.accent_color,
       board_ids = EXCLUDED.board_ids,
       tags = EXCLUDED.tags,
       colors = EXCLUDED.colors,
       notes = EXCLUDED.notes,
       favorite = EXCLUDED.favorite,
       created_at = EXCLUDED.created_at,
       updated_at = EXCLUDED.updated_at,
       opened_at = EXCLUDED.opened_at,
       deleted_at = NULL,
       revision = EXCLUDED.revision`,
    [
      userId,
      item.id,
      text(item.kind, 16),
      text(item.title, 500),
      optionalText(item.url, 2_048),
      optionalText(item.description, 20_000),
      optionalText(item.imageUrl, 2_048),
      optionalText(item.imageAssetId, 64),
      Number.isFinite(item.imageRatio) ? Number(item.imageRatio) : null,
      optionalText(item.siteName, 200),
      optionalText(item.faviconUrl, 2_048),
      optionalText(item.accentColor, 32),
      JSON.stringify(stringList(item.boardIds, 64)),
      JSON.stringify(stringList(item.tags, 64)),
      JSON.stringify(stringList(item.colors ?? [], 16)),
      optionalText(item.notes, 20_000),
      Boolean(item.favorite),
      timestamp(item.createdAt),
      timestamp(item.updatedAt),
      item.openedAt ? timestamp(item.openedAt) : null,
      revision,
    ],
  );
}

/**
 * Exclusão vira lápide: a linha continua existindo com `deleted_at` para que
 * os outros dispositivos descubram que ela sumiu. Os campos pesados são
 * zerados — não faz sentido guardar o texto de algo apagado.
 */
async function writeTombstone(
  db: Db,
  userId: string,
  tombstone: Tombstone,
  revision: number,
) {
  const table = tombstone.kind === "board" ? "boards" : "items";
  const existing = await currentUpdatedAt(db, table, userId, tombstone.id);

  if (existing !== null && existing > tombstone.deletedAt) {
    // A linha foi editada em outro dispositivo depois desta exclusão: a edição
    // vence e o item "ressuscita".
    await touch(db, table, userId, tombstone.id, revision);
    return;
  }

  if (existing === null) {
    // Apagado num dispositivo antes de nunca ter chegado ao servidor: guardamos
    // só a lápide, pra não reaparecer vindo de um terceiro dispositivo atrasado.
    if (table === "boards") {
      await db.execute(
        `INSERT INTO boards (user_id, id, name, emoji, color, description, position,
                             created_at, updated_at, deleted_at, revision)
         VALUES ($1, $2, '', '', '', NULL, 0, $3, $3, $3, $4)
         ON CONFLICT (user_id, id) DO NOTHING`,
        [userId, tombstone.id, timestamp(tombstone.deletedAt), revision],
      );
    } else {
      await db.execute(
        `INSERT INTO items (user_id, id, kind, title, board_ids, tags, colors, favorite,
                            created_at, updated_at, deleted_at, revision)
         VALUES ($1, $2, 'link', '', '[]', '[]', '[]', false, $3, $3, $3, $4)
         ON CONFLICT (user_id, id) DO NOTHING`,
        [userId, tombstone.id, timestamp(tombstone.deletedAt), revision],
      );
    }
    return;
  }

  if (table === "boards") {
    await db.execute(
      `UPDATE boards
          SET deleted_at = $1, updated_at = $1, revision = $2, description = NULL
        WHERE user_id = $3 AND id = $4`,
      [timestamp(tombstone.deletedAt), revision, userId, tombstone.id],
    );
    return;
  }

  // A imagem é apagada junto — mas o id precisa ser lido antes do UPDATE, que
  // é justamente quem zera a referência.
  const assetRows = await db.query<{ image_asset_id: string | null }>(
    `SELECT image_asset_id FROM items WHERE user_id = $1 AND id = $2`,
    [userId, tombstone.id],
  );

  await db.execute(
    `UPDATE items
        SET deleted_at = $1, updated_at = $1, revision = $2,
            description = NULL, notes = NULL, image_asset_id = NULL, colors = '[]'
      WHERE user_id = $3 AND id = $4`,
    [timestamp(tombstone.deletedAt), revision, userId, tombstone.id],
  );

  const assetId = assetRows[0]?.image_asset_id;
  if (assetId) {
    await db.execute(`DELETE FROM assets WHERE user_id = $1 AND id = $2`, [
      userId,
      assetId,
    ]);
  }
}

/* ─────────────────────────────── leitura ─────────────────────────────────── */

async function readSince(
  db: Db,
  userId: string,
  since: number,
  revision: number,
): Promise<SyncResponse> {
  const boardRows = await db.query<BoardRow>(
    `SELECT * FROM boards WHERE user_id = $1 AND revision > $2 ORDER BY revision`,
    [userId, since],
  );
  const itemRows = await db.query<ItemRow>(
    `SELECT * FROM items WHERE user_id = $1 AND revision > $2 ORDER BY revision`,
    [userId, since],
  );

  const deletions: Tombstone[] = [];
  const boards: SyncBoard[] = [];
  const items: SyncItem[] = [];

  for (const row of boardRows) {
    if (row.deleted_at) {
      deletions.push({ kind: "board", id: row.id, deletedAt: Number(row.deleted_at) });
    } else {
      boards.push(toBoard(row));
    }
  }
  for (const row of itemRows) {
    if (row.deleted_at) {
      deletions.push({ kind: "item", id: row.id, deletedAt: Number(row.deleted_at) });
    } else {
      items.push(toItem(row));
    }
  }

  return { revision, boards, items, deletions, serverTime: Date.now() };
}

interface BoardRow {
  id: string;
  name: string;
  emoji: string;
  color: string;
  description: string | null;
  position: number;
  created_at: number | string;
  updated_at: number | string;
  deleted_at: number | string | null;
}

interface ItemRow {
  id: string;
  kind: string;
  title: string;
  url: string | null;
  description: string | null;
  image_url: string | null;
  image_asset_id: string | null;
  image_ratio: number | null;
  site_name: string | null;
  favicon_url: string | null;
  accent_color: string | null;
  board_ids: string;
  tags: string;
  colors: string | null;
  notes: string | null;
  favorite: boolean | number;
  created_at: number | string;
  updated_at: number | string;
  opened_at: number | string | null;
  deleted_at: number | string | null;
}

function toBoard(row: BoardRow): SyncBoard {
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    color: row.color,
    description: row.description ?? undefined,
    position: Number(row.position),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

const KNOWN_KINDS = new Set<string>(["link", "image", "note", "palette"]);

function toItem(row: ItemRow): SyncItem {
  return {
    id: row.id,
    // Lista fechada de tipos conhecidos, com "link" como último recurso. Um
    // tipo novo tem de entrar aqui, senão volta do servidor descaracterizado.
    kind: (KNOWN_KINDS.has(row.kind) ? row.kind : "link") as SyncItem["kind"],
    title: row.title,
    url: row.url ?? undefined,
    description: row.description ?? undefined,
    imageUrl: row.image_url ?? undefined,
    imageAssetId: row.image_asset_id ?? undefined,
    imageRatio: row.image_ratio ?? undefined,
    siteName: row.site_name ?? undefined,
    faviconUrl: row.favicon_url ?? undefined,
    accentColor: row.accent_color ?? undefined,
    boardIds: parseList(row.board_ids),
    tags: parseList(row.tags),
    colors: row.colors ? parseList(row.colors) : undefined,
    notes: row.notes ?? undefined,
    favorite: Boolean(row.favorite),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    openedAt: row.opened_at ? Number(row.opened_at) : undefined,
  };
}

/* ───────────────────────────── saneamento ────────────────────────────────── */

function isValidBoard(board: unknown): board is SyncBoard {
  const value = board as SyncBoard;
  return (
    Boolean(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    value.id.length <= 64 &&
    typeof value.name === "string" &&
    Number.isFinite(value.updatedAt)
  );
}

function isValidItem(item: unknown): item is SyncItem {
  const value = item as SyncItem;
  return (
    Boolean(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    value.id.length <= 64 &&
    typeof value.title === "string" &&
    Number.isFinite(value.updatedAt)
  );
}

function isValidTombstone(tombstone: unknown): tombstone is Tombstone {
  const value = tombstone as Tombstone;
  return (
    Boolean(value) &&
    (value.kind === "item" || value.kind === "board") &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    value.id.length <= 64 &&
    Number.isFinite(value.deletedAt)
  );
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function optionalText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.slice(0, max);
  return trimmed.length > 0 ? trimmed : null;
}

function stringList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
    .map((entry) => entry.slice(0, max))
    .slice(0, 64);
}

function parseList(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((e) => typeof e === "string") : [];
  } catch {
    return [];
  }
}

/** Datas vindas do cliente não podem virar NaN nem estourar o bigint. */
function timestamp(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return Date.now();
  return Math.min(Math.max(Math.trunc(number), 0), 8.64e15);
}
