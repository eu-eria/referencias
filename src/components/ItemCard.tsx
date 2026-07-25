"use client";

import { memo } from "react";
import type { Board, Item, ViewMode } from "@/lib/types";
import { cx, hostOf, timeAgo } from "@/lib/utils";
import { Cover } from "./Cover";
import { ArrowUpRightIcon, NoteIcon, StarIcon } from "./Icons";

export interface ItemCardProps {
  item: Item;
  view: ViewMode;
  boards: Board[];
  focused: boolean;
  eager?: boolean;
  onSelect: (item: Item) => void;
  onToggleFavorite: (item: Item) => void;
  onOpenSource: (item: Item) => void;
  onTagClick?: (tag: string) => void;
}

/**
 * O card inteiro é clicável através de um botão-título com `::before`
 * esticado por cima — assim a área de clique é grande sem aninhar botão
 * dentro de botão, e o leitor de tela anuncia só o título como alvo.
 * Os controles secundários sobem de camada (z-2) pra continuarem clicáveis.
 */
const OVERLAY = "before:absolute before:inset-0 before:z-[1] before:content-['']";
const ABOVE_OVERLAY = "relative z-[2]";

function ItemCardBase({
  item,
  view,
  boards,
  focused,
  eager,
  onSelect,
  onToggleFavorite,
  onOpenSource,
  onTagClick,
}: ItemCardProps) {
  const host = hostOf(item.url);
  const itemBoards = boards.filter((board) => item.boardIds.includes(board.id));

  const shell = cx(
    "group relative transition duration-150",
    "card-surface hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]",
    focused && "border-[var(--accent)] ring-2 ring-[var(--accent)]/35",
  );

  if (view === "lista") {
    return (
      <article
        className={cx(shell, "flex items-center gap-3.5 p-2.5")}
        data-item-id={item.id}
        onDoubleClick={() => onOpenSource(item)}
      >
        <Cover
          item={item}
          eager={eager}
          aspect="square"
          compact
          className="h-14 w-14 shrink-0 rounded-lg"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onSelect(item)}
              className={cx(
                "truncate text-left text-[13.5px] font-medium text-[var(--text)] outline-none",
                OVERLAY,
              )}
            >
              {item.title}
            </button>
            {item.favorite && (
              <StarIcon size={13} filled className="shrink-0 text-[var(--accent)]" />
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">
            {item.description || host || "Nota"}
          </p>
        </div>
        <div className={cx("hidden shrink-0 items-center gap-1.5 md:flex", ABOVE_OVERLAY)}>
          {item.tags.slice(0, 3).map((tag) => (
            <TagChip key={tag} tag={tag} onClick={onTagClick} />
          ))}
        </div>
        <span className="w-20 shrink-0 text-right text-[11px] text-[var(--text-faint)]">
          {timeAgo(item.createdAt)}
        </span>
        <RowActions
          item={item}
          onToggleFavorite={onToggleFavorite}
          onOpenSource={onOpenSource}
        />
      </article>
    );
  }

  const isGrid = view === "grade";
  // Nota não tem capa pra mostrar: o próprio texto é a capa. Sem isso o card
  // ficava com um retângulo vazio ocupando metade da altura.
  const showCover = item.kind !== "note";

  return (
    <article
      className={cx(shell, "flex flex-col overflow-hidden", isGrid && "h-full")}
      data-item-id={item.id}
      onDoubleClick={() => onOpenSource(item)}
    >
      {showCover ? (
        <div className="relative">
          <Cover
            item={item}
            eager={eager}
            aspect={isGrid ? "video" : "auto"}
            className={cx(isGrid && "shrink-0")}
          />
          <div className="pointer-events-none absolute inset-x-0 top-0 z-[2] flex items-start justify-between p-2 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
            <div className="pointer-events-auto flex gap-1.5">
              {itemBoards.slice(0, 2).map((board) => (
                <span
                  key={board.id}
                  title={board.name}
                  className="rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white/90 backdrop-blur-sm"
                >
                  {board.emoji} {board.name}
                </span>
              ))}
            </div>
            <RowActions
              item={item}
              floating
              onToggleFavorite={onToggleFavorite}
              onOpenSource={onOpenSource}
            />
          </div>
          {item.favorite && (
            <span className="absolute bottom-2 left-2 rounded-md border border-[var(--border)] bg-[var(--surface)]/90 p-1 text-[var(--accent)] backdrop-blur-sm transition group-hover:opacity-0">
              <StarIcon size={12} filled />
            </span>
          )}
        </div>
      ) : (
        <div className="absolute top-2 right-2 z-[2] opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
          <RowActions
            item={item}
            onToggleFavorite={onToggleFavorite}
            onOpenSource={onOpenSource}
          />
        </div>
      )}

      <div className={cx("flex flex-1 flex-col gap-1.5 p-3", isGrid && "min-h-0")}>
        {!showCover && item.favorite && (
          <StarIcon size={12} filled className="text-[var(--accent)]" />
        )}

        <h3
          className={cx(
            "leading-snug font-medium text-[var(--text)]",
            // Nota vira o conteúdo principal do card, então respira mais.
            showCover ? "text-[13.5px]" : "text-[14.5px] tracking-tight",
          )}
        >
          <button
            type="button"
            onClick={() => onSelect(item)}
            className={cx(
              "block w-full text-left outline-none",
              isGrid ? "clamp-2" : "clamp-3",
              OVERLAY,
            )}
          >
            {item.title}
          </button>
        </h3>

        {item.kind === "note" && item.description && (
          <p
            className={cx(
              "text-xs leading-relaxed whitespace-pre-line text-[var(--text-muted)]",
              isGrid ? "clamp-3" : "clamp-4",
            )}
          >
            {item.description}
          </p>
        )}

        <div className="mt-auto flex items-center gap-1.5 pt-1 text-[11px] text-[var(--text-faint)]">
          {item.kind === "note" ? (
            <>
              <NoteIcon size={12} />
              <span>Nota</span>
            </>
          ) : (
            <>
              {item.faviconUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.faviconUrl}
                  alt=""
                  width={12}
                  height={12}
                  className="h-3 w-3 rounded-[3px]"
                  referrerPolicy="no-referrer"
                />
              )}
              <span className="truncate">{item.siteName || host || "referência"}</span>
            </>
          )}
          <span aria-hidden="true">·</span>
          <span className="shrink-0">{timeAgo(item.createdAt)}</span>
        </div>

        {item.tags.length > 0 && (
          <div className={cx("flex flex-wrap gap-1", ABOVE_OVERLAY)}>
            {item.tags.slice(0, isGrid ? 2 : 4).map((tag) => (
              <TagChip key={tag} tag={tag} onClick={onTagClick} />
            ))}
            {item.tags.length > (isGrid ? 2 : 4) && (
              <span className="px-1 text-[10px] text-[var(--text-faint)]">
                +{item.tags.length - (isGrid ? 2 : 4)}
              </span>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

function TagChip({ tag, onClick }: { tag: string; onClick?: (tag: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onClick?.(tag)}
      tabIndex={-1}
      className="rounded-md bg-[var(--bg-sunken)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-muted)] transition hover:bg-[var(--accent-soft)] hover:text-[var(--accent-text)]"
    >
      {tag}
    </button>
  );
}

function RowActions({
  item,
  floating,
  onToggleFavorite,
  onOpenSource,
}: {
  item: Item;
  floating?: boolean;
  onToggleFavorite: (item: Item) => void;
  onOpenSource: (item: Item) => void;
}) {
  const buttonClass = floating
    ? "rounded-md bg-black/55 p-1.5 text-white/85 backdrop-blur-sm transition hover:bg-black/75 hover:text-white"
    : "rounded-md p-1.5 text-[var(--text-faint)] transition hover:bg-[var(--bg-sunken)] hover:text-[var(--text)]";

  return (
    <div
      className={cx(
        "pointer-events-auto flex shrink-0 items-center gap-1",
        !floating &&
          "relative z-[2] opacity-0 transition group-hover:opacity-100 focus-within:opacity-100",
      )}
    >
      <button
        type="button"
        aria-label={
          item.favorite
            ? `Remover “${item.title}” dos favoritos`
            : `Favoritar “${item.title}”`
        }
        onClick={() => onToggleFavorite(item)}
        className={cx(buttonClass, item.favorite && "text-[var(--accent)]")}
      >
        <StarIcon size={14} filled={item.favorite} />
      </button>
      {item.url && (
        <button
          type="button"
          aria-label={`Abrir o link original de “${item.title}”`}
          onClick={() => onOpenSource(item)}
          className={buttonClass}
        >
          <ArrowUpRightIcon size={14} />
        </button>
      )}
    </div>
  );
}

export const ItemCard = memo(ItemCardBase);
