"use client";

import { useRef } from "react";
import type { ItemKind, SortMode, ViewMode } from "@/lib/types";
import { KIND_LABELS, SORT_LABELS } from "@/lib/view";
import { cx } from "@/lib/utils";
import { CloseIcon, GridIcon, ListIcon, MuralIcon, SearchIcon } from "./Icons";

export function Toolbar({
  query,
  kinds,
  view,
  sort,
  count,
  onQueryChange,
  onToggleKind,
  onViewChange,
  onSortChange,
}: {
  query: string;
  kinds: ItemKind[];
  view: ViewMode;
  sort: SortMode;
  count: number;
  onQueryChange: (value: string) => void;
  onToggleKind: (kind: ItemKind) => void;
  onViewChange: (view: ViewMode) => void;
  onSortChange: (sort: SortMode) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[12rem] flex-1">
        <SearchIcon
          size={15}
          className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[var(--text-faint)]"
        />
        <input
          ref={inputRef}
          id="filter-input"
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              onQueryChange("");
              event.currentTarget.blur();
            }
          }}
          placeholder="Filtrar aqui dentro…"
          className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-sunken)] pr-8 pl-8 text-[13px] text-[var(--text)] outline-none transition placeholder:text-[var(--text-faint)] focus:border-[var(--border-strong)] [&::-webkit-search-cancel-button]:hidden"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              onQueryChange("");
              inputRef.current?.focus();
            }}
            aria-label="Limpar filtro"
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1 text-[var(--text-faint)] transition hover:text-[var(--text)]"
          >
            <CloseIcon size={13} />
          </button>
        )}
      </div>

      <div className="no-scrollbar flex items-center gap-1 overflow-x-auto">
        {(Object.keys(KIND_LABELS) as ItemKind[]).map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => onToggleKind(kind)}
            className={cx(
              "h-9 shrink-0 rounded-lg border px-2.5 text-xs font-medium transition",
              kinds.includes(kind)
                ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-text)]"
                : "border-[var(--border)] bg-[var(--bg-sunken)] text-[var(--text-muted)] hover:text-[var(--text)]",
            )}
          >
            {KIND_LABELS[kind]}
          </button>
        ))}
      </div>

      <select
        value={sort}
        onChange={(event) => onSortChange(event.target.value as SortMode)}
        aria-label="Ordenar por"
        className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg-sunken)] px-2 text-xs text-[var(--text-muted)] outline-none transition hover:text-[var(--text)]"
      >
        {(Object.keys(SORT_LABELS) as SortMode[]).map((mode) => (
          <option key={mode} value={mode}>
            {SORT_LABELS[mode]}
          </option>
        ))}
      </select>

      <div className="flex h-9 items-center rounded-lg border border-[var(--border)] bg-[var(--bg-sunken)] p-0.5">
        <ViewButton
          active={view === "mural"}
          label="Mural"
          onClick={() => onViewChange("mural")}
        >
          <MuralIcon size={15} />
        </ViewButton>
        <ViewButton
          active={view === "grade"}
          label="Grade"
          onClick={() => onViewChange("grade")}
        >
          <GridIcon size={15} />
        </ViewButton>
        <ViewButton
          active={view === "lista"}
          label="Lista"
          onClick={() => onViewChange("lista")}
        >
          <ListIcon size={15} />
        </ViewButton>
      </div>

      <span className="ml-auto hidden shrink-0 text-xs text-[var(--text-faint)] tabular-nums sm:block">
        {count} {count === 1 ? "referência" : "referências"}
      </span>
    </div>
  );
}

function ViewButton({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Visualização em ${label.toLowerCase()}`}
      aria-label={label}
      aria-pressed={active}
      className={cx(
        "rounded-md px-2 py-1.5 transition",
        active
          ? "bg-[var(--surface)] text-[var(--text)] shadow-sm"
          : "text-[var(--text-faint)] hover:text-[var(--text)]",
      )}
    >
      {children}
    </button>
  );
}
