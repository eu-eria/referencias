"use client";

import type { Board, Item, ViewMode } from "@/lib/types";
import { cx } from "@/lib/utils";
import { ItemCard } from "./ItemCard";

/**
 * Três leituras do mesmo acervo:
 *  • mural — colunas CSS, alturas naturais (o jeito de "passar o olho")
 *  • grade — cards uniformes, bom pra comparar
 *  • lista — densa, pra quando você já sabe o que procura
 */
export function ItemGrid({
  items,
  view,
  boards,
  focusedId,
  onSelect,
  onToggleFavorite,
  onOpenSource,
  onTagClick,
}: {
  items: Item[];
  view: ViewMode;
  boards: Board[];
  focusedId: string | null;
  onSelect: (item: Item) => void;
  onToggleFavorite: (item: Item) => void;
  onOpenSource: (item: Item) => void;
  onTagClick?: (tag: string) => void;
}) {
  const containerClass =
    view === "mural"
      ? "masonry columns-1 sm:columns-2 lg:columns-3 xl:columns-4 2xl:columns-5"
      : view === "grade"
        ? "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
        : "flex flex-col gap-1.5";

  return (
    <div className={containerClass}>
      {items.map((item, index) => (
        <div key={item.id} className={cx(view === "mural" && "masonry-item")}>
          <ItemCard
            item={item}
            view={view}
            boards={boards}
            focused={focusedId === item.id}
            // As primeiras dobras carregam de imediato; o resto é lazy.
            eager={index < 8}
            onSelect={onSelect}
            onToggleFavorite={onToggleFavorite}
            onOpenSource={onOpenSource}
            onTagClick={onTagClick}
          />
        </div>
      ))}
    </div>
  );
}
