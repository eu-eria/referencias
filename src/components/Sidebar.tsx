"use client";

import { useMemo, useState } from "react";
import type { Board } from "@/lib/types";
import type { Selection } from "@/lib/view";
import { selectionKey } from "@/lib/view";
import { cx } from "@/lib/utils";
import { SyncButton } from "./AccountDialog";
import {
  BoardIcon,
  ClockIcon,
  CloseIcon,
  EditIcon,
  KeyboardIcon,
  MoonIcon,
  PlusIcon,
  SettingsIcon,
  SparkIcon,
  StarIcon,
  SunIcon,
  TagIcon,
} from "./Icons";

const TAGS_COLLAPSED = 8;

export function Sidebar({
  boards,
  boardCounts,
  tagCounts,
  totalCount,
  favoriteCount,
  looseCount,
  selection,
  theme,
  open,
  onSelect,
  onCreateBoard,
  onEditBoard,
  onToggleTheme,
  onOpenSettings,
  onOpenShortcuts,
  onOpenAccount,
  onClose,
}: {
  boards: Board[];
  boardCounts: Map<string, number>;
  tagCounts: Map<string, number>;
  totalCount: number;
  favoriteCount: number;
  looseCount: number;
  selection: Selection;
  theme: "dark" | "light";
  open: boolean;
  onSelect: (selection: Selection) => void;
  onCreateBoard: () => void;
  onEditBoard: (board: Board) => void;
  onToggleTheme: () => void;
  onOpenSettings: () => void;
  onOpenShortcuts: () => void;
  onOpenAccount: () => void;
  onClose: () => void;
}) {
  const [showAllTags, setShowAllTags] = useState(false);
  const current = selectionKey(selection);

  const tags = useMemo(
    () => Array.from(tagCounts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
    [tagCounts],
  );
  const visibleTags = showAllTags ? tags : tags.slice(0, TAGS_COLLAPSED);

  return (
    <>
      {/* Fundo escuro só no mobile, onde a sidebar vira gaveta */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/50 animate-fade-in lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={cx(
          "fixed inset-y-0 left-0 z-40 flex w-[17rem] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-elevated)] transition-transform duration-200 lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center gap-2 px-4 pt-4 pb-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--accent)] text-white">
            <SparkIcon size={15} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold tracking-tight">Referências</p>
            <p className="truncate text-[11px] text-[var(--text-faint)]">
              {totalCount} {totalCount === 1 ? "item salvo" : "itens salvos"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar menu"
            className="rounded-lg p-1.5 text-[var(--text-faint)] transition hover:bg-[var(--surface-hover)] hover:text-[var(--text)] lg:hidden"
          >
            <CloseIcon size={16} />
          </button>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-3">
          <Section>
            <NavItem
              icon={<BoardIcon size={15} />}
              label="Tudo"
              count={totalCount}
              active={current === "todos"}
              onClick={() => onSelect({ type: "todos" })}
            />
            <NavItem
              icon={<StarIcon size={15} />}
              label="Favoritos"
              count={favoriteCount}
              active={current === "favoritos"}
              onClick={() => onSelect({ type: "favoritos" })}
            />
            <NavItem
              icon={<ClockIcon size={15} />}
              label="Vistos recentemente"
              active={current === "recentes"}
              onClick={() => onSelect({ type: "recentes" })}
            />
            {looseCount > 0 && (
              <NavItem
                icon={<TagIcon size={15} />}
                label="Sem board"
                count={looseCount}
                active={current === "soltos"}
                onClick={() => onSelect({ type: "soltos" })}
              />
            )}
          </Section>

          <SectionTitle
            title="Boards"
            action={
              <button
                type="button"
                onClick={onCreateBoard}
                aria-label="Criar board"
                className="rounded-md p-1 text-[var(--text-faint)] transition hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
              >
                <PlusIcon size={14} />
              </button>
            }
          />
          <Section>
            {boards.length === 0 && (
              <p className="px-2.5 py-2 text-xs leading-relaxed text-[var(--text-faint)]">
                Boards agrupam referências por assunto. Crie o primeiro no + acima.
              </p>
            )}
            {boards.map((board) => (
              <div key={board.id} className="group/board relative">
                <NavItem
                  icon={<span className="text-[13px] leading-none">{board.emoji}</span>}
                  label={board.name}
                  count={boardCounts.get(board.id) ?? 0}
                  active={current === `board:${board.id}`}
                  accent={board.color}
                  onClick={() => onSelect({ type: "board", id: board.id })}
                />
                <button
                  type="button"
                  aria-label={`Editar ${board.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onEditBoard(board);
                  }}
                  className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-md bg-[var(--surface-hover)] p-1 text-[var(--text-faint)] opacity-0 transition group-hover/board:opacity-100 hover:text-[var(--text)] focus-visible:opacity-100"
                >
                  <EditIcon size={13} />
                </button>
              </div>
            ))}
          </Section>

          {tags.length > 0 && (
            <>
              <SectionTitle title="Tags" />
              <Section>
                {visibleTags.map(([tag, count]) => (
                  <NavItem
                    key={tag}
                    icon={<TagIcon size={14} />}
                    label={tag}
                    count={count}
                    active={current === `tag:${tag}`}
                    onClick={() => onSelect({ type: "tag", name: tag })}
                  />
                ))}
                {tags.length > TAGS_COLLAPSED && (
                  <button
                    type="button"
                    onClick={() => setShowAllTags((value) => !value)}
                    className="w-full rounded-lg px-2.5 py-1.5 text-left text-[11px] font-medium text-[var(--text-faint)] transition hover:text-[var(--text)]"
                  >
                    {showAllTags
                      ? "Mostrar menos"
                      : `Ver todas as ${tags.length} tags`}
                  </button>
                )}
              </Section>
            </>
          )}
        </nav>

        <div className="border-t border-[var(--border)] px-2.5 pt-1.5">
          <SyncButton onClick={onOpenAccount} />
        </div>

        <div className="flex items-center gap-1 px-2.5 pb-2">
          <FooterButton
            label={theme === "dark" ? "Tema claro" : "Tema escuro"}
            onClick={onToggleTheme}
          >
            {theme === "dark" ? <SunIcon size={15} /> : <MoonIcon size={15} />}
          </FooterButton>
          <FooterButton label="Atalhos do teclado" onClick={onOpenShortcuts}>
            <KeyboardIcon size={15} />
          </FooterButton>
          <FooterButton label="Ajustes e backup" onClick={onOpenSettings}>
            <SettingsIcon size={15} />
          </FooterButton>
        </div>
      </aside>
    </>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-0.5">{children}</div>;
}

function SectionTitle({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-2.5 pt-5 pb-1.5">
      <h2 className="text-[10px] font-semibold tracking-[0.12em] text-[var(--text-faint)] uppercase">
        {title}
      </h2>
      {action}
    </div>
  );
}

function NavItem({
  icon,
  label,
  count,
  active,
  accent,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  count?: number;
  active: boolean;
  accent?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-left text-[13px] transition",
        active
          ? "bg-[var(--surface-hover)] font-medium text-[var(--text)]"
          : "text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]",
      )}
    >
      <span
        className="flex w-4 shrink-0 items-center justify-center"
        style={active && accent ? { color: accent } : undefined}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined && count > 0 && (
        <span className="shrink-0 text-[11px] text-[var(--text-faint)] tabular-nums">
          {count}
        </span>
      )}
    </button>
  );
}

function FooterButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex-1 rounded-lg px-2 py-2 text-[var(--text-faint)] transition hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
    >
      <span className="flex justify-center">{children}</span>
    </button>
  );
}
