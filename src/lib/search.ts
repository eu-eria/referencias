import type { Board, Item } from "./types";
import { deaccent, hostOf } from "./utils";

/**
 * Busca fuzzy por subsequência: "dsn sys" acha "Design System".
 * Devolve a pontuação e as posições casadas (pra grifar no resultado).
 */
export interface FuzzyMatch {
  score: number;
  positions: number[];
}

export function fuzzyMatch(query: string, target: string): FuzzyMatch | null {
  if (!query) return { score: 0, positions: [] };

  const haystack = deaccent(target);
  const needle = deaccent(query);
  if (!haystack) return null;

  // Caminho rápido: substring contígua vale muito mais que letras espalhadas.
  const direct = haystack.indexOf(needle);
  if (direct !== -1) {
    const positions = Array.from({ length: needle.length }, (_, i) => direct + i);
    let score = 120 - direct;
    if (direct === 0) score += 60;
    else if (isBoundary(haystack, direct)) score += 30;
    return { score, positions };
  }

  const positions: number[] = [];
  let score = 0;
  let cursor = 0;
  let previousIndex = -1;

  for (const char of needle) {
    if (char === " ") continue;
    const index = haystack.indexOf(char, cursor);
    if (index === -1) return null;
    positions.push(index);
    if (index === previousIndex + 1) score += 8; // letras coladas
    if (index === 0 || isBoundary(haystack, index)) score += 12; // início de palavra
    score += Math.max(0, 6 - (index - cursor));
    previousIndex = index;
    cursor = index + 1;
  }

  // Casar num texto curto é mais significativo do que num parágrafo longo.
  score += Math.max(0, 20 - haystack.length / 6);
  return { score, positions };
}

function isBoundary(text: string, index: number): boolean {
  const previous = text[index - 1];
  return previous === undefined || /[\s\-_/.:|]/.test(previous);
}

export interface ScoredItem {
  item: Item;
  score: number;
  /** Posições casadas no título, pra grifar. */
  titlePositions: number[];
}

/**
 * Ordena os itens por relevância. Cada campo tem peso próprio: o título manda,
 * tag casada vale quase tanto, e descrição/notas entram como desempate.
 */
export function searchItems(items: Item[], query: string): ScoredItem[] {
  const trimmed = query.trim();
  if (!trimmed) {
    return items.map((item) => ({ item, score: 0, titlePositions: [] }));
  }

  const results: ScoredItem[] = [];

  for (const item of items) {
    const title = fuzzyMatch(trimmed, item.title);
    let score = title ? title.score * 3 : 0;

    for (const tag of item.tags) {
      const tagMatch = fuzzyMatch(trimmed, tag);
      if (tagMatch) score = Math.max(score, tagMatch.score * 2.4);
    }

    const host = hostOf(item.url);
    if (host) {
      const hostMatch = fuzzyMatch(trimmed, host);
      if (hostMatch) score = Math.max(score, hostMatch.score * 1.8);
    }

    if (item.siteName) {
      const siteMatch = fuzzyMatch(trimmed, item.siteName);
      if (siteMatch) score = Math.max(score, siteMatch.score * 1.5);
    }

    // Textos longos só contam por substring — fuzzy neles gera muito ruído.
    const longText = `${item.description ?? ""} ${item.notes ?? ""}`.trim();
    if (longText && deaccent(longText).includes(deaccent(trimmed))) {
      score = Math.max(score, 70);
    }

    if (score > 0) {
      results.push({ item, score, titlePositions: title?.positions ?? [] });
    }
  }

  return results.sort((a, b) => b.score - a.score || b.item.updatedAt - a.item.updatedAt);
}

export interface ScoredBoard {
  board: Board;
  score: number;
}

export function searchBoards(boards: Board[], query: string): ScoredBoard[] {
  const trimmed = query.trim();
  if (!trimmed) return boards.map((board) => ({ board, score: 0 }));

  const results: ScoredBoard[] = [];
  for (const board of boards) {
    const name = fuzzyMatch(trimmed, board.name);
    const description = board.description
      ? fuzzyMatch(trimmed, board.description)
      : null;
    const score = Math.max(name ? name.score * 2 : 0, description ? description.score : 0);
    if (score > 0) results.push({ board, score });
  }
  return results.sort((a, b) => b.score - a.score);
}

export function searchTags(tags: string[], query: string): string[] {
  const trimmed = query.trim();
  if (!trimmed) return tags;
  return tags
    .map((tag) => ({ tag, match: fuzzyMatch(trimmed, tag) }))
    .filter((entry): entry is { tag: string; match: FuzzyMatch } => entry.match !== null)
    .sort((a, b) => b.match.score - a.match.score)
    .map((entry) => entry.tag);
}
