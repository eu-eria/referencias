import { searchItems } from "./search";
import type { Item, ItemKind, SortMode } from "./types";

/** O que está selecionado na barra lateral. */
export type Selection =
  | { type: "todos" }
  | { type: "favoritos" }
  | { type: "recentes" }
  | { type: "soltos" }
  | { type: "board"; id: string }
  | { type: "tag"; name: string };

export function selectionKey(selection: Selection): string {
  return selection.type === "board"
    ? `board:${selection.id}`
    : selection.type === "tag"
      ? `tag:${selection.name}`
      : selection.type;
}

export interface FilterOptions {
  selection: Selection;
  query: string;
  kinds: ItemKind[];
  sort: SortMode;
}

/**
 * Aplica, nesta ordem: recorte da barra lateral → tipo → busca → ordenação.
 * Com busca ativa a ordem passa a ser a relevância, não a data — quem digita
 * quer o resultado certo em cima, não o mais recente.
 */
export function filterItems(items: Item[], options: FilterOptions): Item[] {
  const { selection, query, kinds, sort } = options;

  let result = items;

  switch (selection.type) {
    case "favoritos":
      result = result.filter((item) => item.favorite);
      break;
    case "recentes":
      result = result
        .filter((item) => item.openedAt)
        .sort((a, b) => (b.openedAt ?? 0) - (a.openedAt ?? 0))
        .slice(0, 60);
      break;
    case "soltos":
      result = result.filter((item) => item.boardIds.length === 0);
      break;
    case "board":
      result = result.filter((item) => item.boardIds.includes(selection.id));
      break;
    case "tag":
      result = result.filter((item) => item.tags.includes(selection.name));
      break;
    default:
      break;
  }

  if (kinds.length > 0) {
    result = result.filter((item) => kinds.includes(item.kind));
  }

  const trimmed = query.trim();
  if (trimmed) {
    return searchItems(result, trimmed).map((scored) => scored.item);
  }

  // "Recentes" já vem ordenado por abertura; reordenar desfaria o recorte.
  if (selection.type === "recentes") return result;

  return sortItems(result, sort);
}

export function sortItems(items: Item[], sort: SortMode): Item[] {
  const sorted = [...items];
  switch (sort) {
    case "antigos":
      return sorted.sort((a, b) => a.createdAt - b.createdAt);
    case "titulo":
      return sorted.sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
    case "abertos":
      return sorted.sort((a, b) => (b.openedAt ?? 0) - (a.openedAt ?? 0));
    default:
      return sorted.sort((a, b) => b.createdAt - a.createdAt);
  }
}

export const SORT_LABELS: Record<SortMode, string> = {
  recentes: "Mais recentes",
  antigos: "Mais antigos",
  titulo: "Título (A–Z)",
  abertos: "Abertos por último",
};

export const KIND_LABELS: Record<ItemKind, string> = {
  link: "Links",
  image: "Imagens",
  note: "Notas",
};

/**
 * Referências parecidas com a atual: pontuadas por tags em comum, board em
 * comum e mesmo domínio. É o que faz o painel de detalhe puxar a próxima ideia.
 */
export function relatedItems(item: Item, items: Item[], limit = 6): Item[] {
  const tags = new Set(item.tags);
  const boards = new Set(item.boardIds);
  const host = item.url ? safeHost(item.url) : "";

  return items
    .filter((candidate) => candidate.id !== item.id)
    .map((candidate) => {
      let score = 0;
      for (const tag of candidate.tags) if (tags.has(tag)) score += 3;
      for (const boardId of candidate.boardIds) if (boards.has(boardId)) score += 2;
      if (host && candidate.url && safeHost(candidate.url) === host) score += 2;
      return { candidate, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || b.candidate.createdAt - a.candidate.createdAt)
    .slice(0, limit)
    .map((entry) => entry.candidate);
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
