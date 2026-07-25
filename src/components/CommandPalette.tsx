"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Board, Item } from "@/lib/types";
import type { Selection } from "@/lib/view";
import { searchBoards, searchItems, searchTags } from "@/lib/search";
import { cx, hostOf } from "@/lib/utils";
import { useScrollLock } from "@/lib/hooks";
import { Cover } from "./Cover";
import {
  BoardIcon,
  ClockIcon,
  PlusIcon,
  SearchIcon,
  SparkIcon,
  StarIcon,
  TagIcon,
} from "./Icons";

interface Row {
  key: string;
  group: string;
  label: string;
  hint?: string;
  icon?: React.ReactNode;
  item?: Item;
  run: () => void;
}

const MAX_ITEMS = 8;
const MAX_BOARDS = 4;
const MAX_TAGS = 5;

/**
 * Cmd/Ctrl + K: um campo só que alcança referência, board, tag e ação.
 * Sem query, mostra o que foi aberto por último — no meio de um projeto,
 * quase sempre é pra lá que você quer voltar.
 */
export function CommandPalette({
  items,
  boards,
  onClose,
  onOpenItem,
  onSelect,
  onCreateBoard,
  onFocusCapture,
}: {
  items: Item[];
  boards: Board[];
  onClose: () => void;
  onOpenItem: (item: Item) => void;
  onSelect: (selection: Selection) => void;
  onCreateBoard: () => void;
  onFocusCapture: () => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useScrollLock(true);

  const tags = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) for (const tag of item.tags) set.add(tag);
    return Array.from(set).sort();
  }, [items]);

  const rows = useMemo<Row[]>(() => {
    const trimmed = query.trim();
    const result: Row[] = [];

    if (!trimmed) {
      const recent = [...items]
        .sort(
          (a, b) => (b.openedAt ?? b.createdAt) - (a.openedAt ?? a.createdAt),
        )
        .slice(0, 6);

      for (const item of recent) {
        result.push({
          key: `item:${item.id}`,
          group: "Continuar de onde parou",
          label: item.title,
          hint: hostOf(item.url) || (item.kind === "note" ? "Nota" : "Imagem"),
          item,
          run: () => onOpenItem(item),
        });
      }
    } else {
      for (const scored of searchItems(items, trimmed).slice(0, MAX_ITEMS)) {
        result.push({
          key: `item:${scored.item.id}`,
          group: "Referências",
          label: scored.item.title,
          hint:
            hostOf(scored.item.url) ||
            (scored.item.kind === "note" ? "Nota" : "Imagem"),
          item: scored.item,
          run: () => onOpenItem(scored.item),
        });
      }

      for (const scored of searchBoards(boards, trimmed).slice(0, MAX_BOARDS)) {
        result.push({
          key: `board:${scored.board.id}`,
          group: "Boards",
          label: `${scored.board.emoji} ${scored.board.name}`,
          hint: "Abrir board",
          icon: <BoardIcon size={15} />,
          run: () => onSelect({ type: "board", id: scored.board.id }),
        });
      }

      for (const tag of searchTags(tags, trimmed).slice(0, MAX_TAGS)) {
        result.push({
          key: `tag:${tag}`,
          group: "Tags",
          label: tag,
          hint: "Filtrar por tag",
          icon: <TagIcon size={15} />,
          run: () => onSelect({ type: "tag", name: tag }),
        });
      }
    }

    result.push(
      {
        key: "action:capture",
        group: "Ações",
        label: "Adicionar referência",
        hint: "A",
        icon: <PlusIcon size={15} />,
        run: onFocusCapture,
      },
      {
        key: "action:board",
        group: "Ações",
        label: "Criar novo board",
        hint: "B",
        icon: <BoardIcon size={15} />,
        run: onCreateBoard,
      },
      {
        key: "action:favorites",
        group: "Ações",
        label: "Ver favoritos",
        icon: <StarIcon size={15} />,
        run: () => onSelect({ type: "favoritos" }),
      },
      {
        key: "action:recent",
        group: "Ações",
        label: "Ver os abertos recentemente",
        icon: <ClockIcon size={15} />,
        run: () => onSelect({ type: "recentes" }),
      },
    );

    return result;
  }, [query, items, boards, tags, onOpenItem, onSelect, onCreateBoard, onFocusCapture]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  // Mantém a linha ativa visível conforme as setas descem a lista.
  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    node?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown" || (event.key === "n" && event.ctrlKey)) {
      event.preventDefault();
      setActive((index) => (index + 1) % Math.max(rows.length, 1));
    } else if (event.key === "ArrowUp" || (event.key === "p" && event.ctrlKey)) {
      event.preventDefault();
      setActive((index) => (index - 1 + rows.length) % Math.max(rows.length, 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const row = rows[active];
      if (row) {
        row.run();
        onClose();
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }

  let lastGroup = "";

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-black/55 px-4 pt-[12vh] animate-fade-in"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Busca rápida"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
        className="flex w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] shadow-2xl animate-pop-in"
      >
        <div className="flex items-center gap-2.5 border-b border-[var(--border)] px-4">
          <SearchIcon size={17} className="shrink-0 text-[var(--text-faint)]" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar referência, board ou tag…"
            className="h-13 min-w-0 flex-1 bg-transparent py-4 text-sm text-[var(--text)] outline-none focus-visible:outline-none placeholder:text-[var(--text-faint)]"
          />
          <kbd className="hidden shrink-0 rounded border border-[var(--border)] px-1.5 py-0.5 font-sans text-[10px] text-[var(--text-faint)] sm:block">
            esc
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-1.5">
          {rows.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-[var(--text-faint)]">
              Nada encontrado para “{query}”.
            </p>
          )}

          {rows.map((row, index) => {
            const showGroup = row.group !== lastGroup;
            lastGroup = row.group;
            return (
              <div key={row.key}>
                {showGroup && (
                  <p className="px-2.5 pt-3 pb-1 text-[10px] font-semibold tracking-[0.12em] text-[var(--text-faint)] uppercase">
                    {row.group}
                  </p>
                )}
                <button
                  type="button"
                  data-index={index}
                  onMouseMove={() => setActive(index)}
                  onClick={() => {
                    row.run();
                    onClose();
                  }}
                  className={cx(
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition",
                    index === active
                      ? "bg-[var(--surface-hover)]"
                      : "hover:bg-[var(--surface-hover)]",
                  )}
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md text-[var(--text-faint)]">
                    {row.item ? (
                      <Cover
                        item={row.item}
                        aspect="square"
                        compact
                        className="h-7 w-7"
                      />
                    ) : (
                      (row.icon ?? <SparkIcon size={15} />)
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--text)]">
                    {row.label}
                  </span>
                  {row.hint && (
                    <span className="shrink-0 text-[11px] text-[var(--text-faint)]">
                      {row.hint}
                    </span>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-3 border-t border-[var(--border)] px-4 py-2 text-[11px] text-[var(--text-faint)]">
          <Legend keys="↑↓" label="navegar" />
          <Legend keys="↵" label="abrir" />
          <Legend keys="esc" label="fechar" />
        </div>
      </div>
    </div>
  );
}

function Legend({ keys, label }: { keys: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <kbd className="rounded border border-[var(--border)] px-1 py-0.5 font-sans text-[10px]">
        {keys}
      </kbd>
      {label}
    </span>
  );
}
