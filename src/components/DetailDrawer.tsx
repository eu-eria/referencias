"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Board, Item } from "@/lib/types";
import { relatedItems } from "@/lib/view";
import { cx, formatDate, hostOf, slugifyTag } from "@/lib/utils";
import { colorName, normalizeHex, parsePalette } from "@/lib/color";
import { isTypingTarget, useScrollLock } from "@/lib/hooks";
import { Cover } from "./Cover";
import { toast } from "./Toast";
import {
  ArrowUpRightIcon,
  CheckIcon,
  ChevronRightIcon,
  CloseIcon,
  CopyIcon,
  PlusIcon,
  StarIcon,
  TrashIcon,
} from "./Icons";

/**
 * Painel de detalhe. Além de mostrar a referência, é onde se pula pra próxima:
 * as setas percorrem a lista filtrada e o bloco "Relacionadas" liga um item ao
 * outro por tag, board e domínio.
 */
export function DetailDrawer({
  item,
  items,
  boards,
  hasPrevious,
  hasNext,
  onClose,
  onNavigate,
  onSelectItem,
  onUpdate,
  onDelete,
  onToggleFavorite,
  onOpenSource,
  onTagClick,
}: {
  item: Item;
  items: Item[];
  boards: Board[];
  hasPrevious: boolean;
  hasNext: boolean;
  onClose: () => void;
  onNavigate: (direction: -1 | 1) => void;
  onSelectItem: (item: Item) => void;
  onUpdate: (id: string, patch: Partial<Item>) => void;
  onDelete: (item: Item) => void;
  onToggleFavorite: (item: Item) => void;
  onOpenSource: (item: Item) => void;
  onTagClick: (tag: string) => void;
}) {
  const [title, setTitle] = useState(item.title);
  const [notes, setNotes] = useState(item.notes ?? "");
  const [tagDraft, setTagDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useScrollLock(true);

  // Trocar de item pelas setas precisa recarregar os campos editáveis.
  useEffect(() => {
    setTitle(item.title);
    setNotes(item.notes ?? "");
    setTagDraft("");
    setCopied(false);
    panelRef.current?.scrollTo({ top: 0 });
  }, [item.id, item.title, item.notes]);

  // Esc fecha o painel mesmo com o cursor num campo. O blur explícito roda
  // antes de fechar, então o que estava sendo escrito é salvo em vez de sumir.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      const target = event.target;
      if (target instanceof HTMLElement && isTypingTarget(target)) target.blur();
      onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const related = useMemo(() => relatedItems(item, items), [item, items]);
  const host = hostOf(item.url);

  function commitTitle() {
    const next = title.trim();
    if (next && next !== item.title) onUpdate(item.id, { title: next });
    else if (!next) setTitle(item.title);
  }

  function commitNotes() {
    const next = notes.trim();
    if (next !== (item.notes ?? "")) onUpdate(item.id, { notes: next || undefined });
  }

  function addTag(raw: string) {
    const tag = slugifyTag(raw);
    if (!tag || item.tags.includes(tag)) {
      setTagDraft("");
      return;
    }
    onUpdate(item.id, { tags: [...item.tags, tag] });
    setTagDraft("");
  }

  function removeTag(tag: string) {
    onUpdate(item.id, { tags: item.tags.filter((entry) => entry !== tag) });
  }

  function toggleBoard(boardId: string) {
    const next = item.boardIds.includes(boardId)
      ? item.boardIds.filter((id) => id !== boardId)
      : [...item.boardIds, boardId];
    onUpdate(item.id, { boardIds: next });
  }

  async function copyUrl() {
    if (!item.url) return;
    try {
      await navigator.clipboard.writeText(item.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1_600);
    } catch {
      toast("Não consegui copiar — o navegador bloqueou", { tone: "error" });
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/45 animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label={item.title}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[34rem] flex-col border-l border-[var(--border)] bg-[var(--bg-elevated)] shadow-2xl animate-slide-in-right"
      >
        <header className="flex items-center gap-1 border-b border-[var(--border)] px-3 py-2.5">
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar (Esc)"
            className="rounded-lg p-1.5 text-[var(--text-faint)] transition hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
          >
            <CloseIcon size={16} />
          </button>

          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => onNavigate(-1)}
              disabled={!hasPrevious}
              aria-label="Referência anterior (K)"
              className="rounded-lg p-1.5 text-[var(--text-faint)] transition hover:bg-[var(--surface-hover)] hover:text-[var(--text)] disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronRightIcon size={16} className="rotate-180" />
            </button>
            <button
              type="button"
              onClick={() => onNavigate(1)}
              disabled={!hasNext}
              aria-label="Próxima referência (J)"
              className="rounded-lg p-1.5 text-[var(--text-faint)] transition hover:bg-[var(--surface-hover)] hover:text-[var(--text)] disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronRightIcon size={16} />
            </button>

            <span className="mx-1 h-4 w-px bg-[var(--border)]" />

            <button
              type="button"
              onClick={() => onToggleFavorite(item)}
              aria-label={item.favorite ? "Remover dos favoritos" : "Favoritar (F)"}
              className={cx(
                "rounded-lg p-1.5 transition hover:bg-[var(--surface-hover)]",
                item.favorite
                  ? "text-[var(--accent)]"
                  : "text-[var(--text-faint)] hover:text-[var(--text)]",
              )}
            >
              <StarIcon size={16} filled={item.favorite} />
            </button>
            <button
              type="button"
              onClick={() => onDelete(item)}
              aria-label="Excluir referência"
              className="rounded-lg p-1.5 text-[var(--text-faint)] transition hover:bg-red-500/12 hover:text-red-400"
            >
              <TrashIcon size={16} />
            </button>
          </div>
        </header>

        <div ref={panelRef} className="min-h-0 flex-1 overflow-y-auto">
          {(item.imageBlob ||
            item.imageUrl ||
            item.kind === "image" ||
            item.kind === "palette" ||
            hostOf(item.url)) && (
            <Cover item={item} eager aspect="auto" className="w-full" />
          )}

          <div className="flex flex-col gap-5 p-5">
            <div>
              <textarea
                value={title}
                rows={1}
                onChange={(event) => setTitle(event.target.value)}
                onBlur={commitTitle}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    event.currentTarget.blur();
                  }
                }}
                className="w-full resize-none rounded-lg bg-transparent text-[19px] leading-snug font-semibold tracking-tight text-[var(--text)] outline-none transition focus:bg-[var(--bg-sunken)] focus:px-2 focus:py-1"
              />

              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--text-faint)]">
                {item.faviconUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.faviconUrl}
                    alt=""
                    className="h-3.5 w-3.5 rounded-[3px]"
                    referrerPolicy="no-referrer"
                  />
                )}
                {host && <span>{item.siteName || host}</span>}
                {host && <span aria-hidden="true">·</span>}
                <span>Salvo em {formatDate(item.createdAt)}</span>
              </div>
            </div>

            {item.url && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onOpenSource(item)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-3 py-2 text-[13px] font-semibold text-white transition hover:opacity-90"
                >
                  <ArrowUpRightIcon size={15} />
                  Abrir original
                </button>
                <button
                  type="button"
                  onClick={() => void copyUrl()}
                  className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-[13px] font-medium text-[var(--text-muted)] transition hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                >
                  {copied ? <CheckIcon size={15} /> : <CopyIcon size={15} />}
                  {copied ? "Copiado" : "Copiar link"}
                </button>
              </div>
            )}

            {item.description && (
              <Field label={item.kind === "note" ? "Conteúdo" : "Resumo do site"}>
                <p className="text-[13px] leading-relaxed whitespace-pre-line text-[var(--text-muted)]">
                  {item.description}
                </p>
              </Field>
            )}

            <Field label="Suas anotações">
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                onBlur={commitNotes}
                rows={3}
                placeholder="Por que isso importa? O que você quer reaproveitar daqui?"
                className="w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--bg-sunken)] px-3 py-2 text-[13px] leading-relaxed text-[var(--text)] outline-none transition placeholder:text-[var(--text-faint)] focus:border-[var(--border-strong)]"
              />
            </Field>

            {item.kind === "palette" && (
              <PaletteEditor
                colors={item.colors ?? []}
                onChange={(colors) => onUpdate(item.id, { colors })}
              />
            )}

            <Field label="Tags">
              <div className="flex flex-wrap items-center gap-1.5">
                {item.tags.map((tag) => (
                  <span
                    key={tag}
                    className="group/tag flex items-center gap-1 rounded-md bg-[var(--bg-sunken)] py-1 pr-1 pl-2 text-[11px] font-medium text-[var(--text-muted)]"
                  >
                    <button
                      type="button"
                      onClick={() => onTagClick(tag)}
                      className="transition hover:text-[var(--accent-text)]"
                    >
                      {tag}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      aria-label={`Remover tag ${tag}`}
                      className="rounded p-0.5 text-[var(--text-faint)] transition hover:text-red-400"
                    >
                      <CloseIcon size={11} />
                    </button>
                  </span>
                ))}
                <input
                  value={tagDraft}
                  onChange={(event) => setTagDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === ",") {
                      event.preventDefault();
                      addTag(tagDraft);
                    }
                    if (event.key === "Backspace" && !tagDraft && item.tags.length > 0) {
                      removeTag(item.tags[item.tags.length - 1]);
                    }
                    if (event.key === "Escape" && tagDraft) {
                      // Esc aqui descarta a tag pela metade em vez de fechar o
                      // painel — só o segundo Esc sai.
                      event.stopPropagation();
                      setTagDraft("");
                    }
                  }}
                  onBlur={() => tagDraft && addTag(tagDraft)}
                  placeholder="+ tag"
                  className="w-20 rounded-md bg-transparent px-1.5 py-1 text-[11px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]"
                />
              </div>
            </Field>

            <Field label="Boards">
              <div className="flex flex-wrap gap-1.5">
                {boards.length === 0 && (
                  <p className="text-xs text-[var(--text-faint)]">
                    Nenhum board criado ainda.
                  </p>
                )}
                {boards.map((board) => {
                  const active = item.boardIds.includes(board.id);
                  return (
                    <button
                      key={board.id}
                      type="button"
                      onClick={() => toggleBoard(board.id)}
                      className={cx(
                        "flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition",
                        active
                          ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-text)]"
                          : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]",
                      )}
                    >
                      <span>{board.emoji}</span>
                      {board.name}
                      {active ? <CheckIcon size={11} /> : <PlusIcon size={11} />}
                    </button>
                  );
                })}
              </div>
            </Field>

            {related.length > 0 && (
              <Field label="Relacionadas">
                <div className="flex flex-col gap-1">
                  {related.map((candidate) => (
                    <button
                      key={candidate.id}
                      type="button"
                      onClick={() => onSelectItem(candidate)}
                      className="flex items-center gap-2.5 rounded-lg p-1.5 text-left transition hover:bg-[var(--surface-hover)]"
                    >
                      <Cover
                        item={candidate}
                        aspect="square"
                        compact
                        className="h-9 w-9 shrink-0 rounded-md"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] text-[var(--text)]">
                          {candidate.title}
                        </span>
                        <span className="block truncate text-[11px] text-[var(--text-faint)]">
                          {candidate.tags.slice(0, 3).join(" · ") ||
                            hostOf(candidate.url) ||
                            "Nota"}
                        </span>
                      </span>
                      <ChevronRightIcon
                        size={14}
                        className="shrink-0 text-[var(--text-faint)]"
                      />
                    </button>
                  ))}
                </div>
              </Field>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

/** Lista editável de cores: trocar, copiar, remover e acrescentar. */
function PaletteEditor({
  colors,
  onChange,
}: {
  colors: string[];
  onChange: (colors: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
      setTimeout(() => setCopied(null), 1400);
    } catch {
      toast("Não consegui copiar — o navegador bloqueou", { tone: "error" });
    }
  }

  function add() {
    // Aceita tanto uma cor quanto um punhado colado de uma vez.
    const parsed = parsePalette(draft) ?? (normalizeHex(draft) ? [normalizeHex(draft)!] : null);
    setDraft("");
    if (!parsed) return;
    const next = [...colors];
    for (const color of parsed) if (!next.includes(color)) next.push(color);
    if (next.length !== colors.length) onChange(next);
  }

  return (
    <Field label="Cores">
      <div className="flex flex-col gap-1.5">
        {colors.map((color, index) => (
          <div
            key={`${color}-${index}`}
            className="flex items-center gap-2.5 rounded-lg p-1.5 transition hover:bg-[var(--surface-hover)]"
          >
            <span
              className="relative h-8 w-8 shrink-0 rounded-lg border border-[var(--border)]"
              style={{ background: color }}
            >
              {/* O seletor nativo fica invisível por cima do swatch: clicar
                  abre a paleta do sistema e editar troca a cor no lugar. */}
              <input
                type="color"
                value={color}
                aria-label={`Editar ${color}`}
                onChange={(event) => {
                  const next = [...colors];
                  next[index] = normalizeHex(event.target.value) ?? color;
                  onChange(next);
                }}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </span>

            <button
              type="button"
              onClick={() => void copy(color)}
              className="min-w-0 flex-1 text-left font-mono text-[12.5px] uppercase transition hover:text-[var(--accent-text)]"
            >
              {copied === color ? "copiado!" : color}
            </button>

            <span className="shrink-0 text-[11px] text-[var(--text-faint)]">
              {colorName(color)}
            </span>

            <button
              type="button"
              aria-label={`Remover ${color}`}
              onClick={() => onChange(colors.filter((_, i) => i !== index))}
              className="shrink-0 rounded-md p-1 text-[var(--text-faint)] transition hover:text-red-400"
            >
              <CloseIcon size={13} />
            </button>
          </div>
        ))}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <input
          type="color"
          aria-label="Escolher cor"
          defaultValue="#d97757"
          onChange={(event) => {
            const color = normalizeHex(event.target.value);
            if (color && !colors.includes(color)) onChange([...colors, color]);
          }}
          className="h-8 w-8 shrink-0 cursor-pointer rounded-lg border border-[var(--border)] bg-transparent p-0"
        />
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
          placeholder="#rrggbb ou cole várias de uma vez"
          className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-sunken)] px-2.5 py-2 font-mono text-[12.5px] outline-none transition focus:border-[var(--border-strong)]"
        />
        <button
          type="button"
          onClick={add}
          className="shrink-0 rounded-lg border border-[var(--border)] px-3 py-2 text-[13px] font-medium text-[var(--text-muted)] transition hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
        >
          Adicionar
        </button>
      </div>

      {colors.length > 1 && (
        <button
          type="button"
          onClick={() => void copy(colors.join(" "))}
          className="mt-2.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-[13px] font-medium text-[var(--text-muted)] transition hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
        >
          {copied === colors.join(" ") ? "Copiado!" : "Copiar todas"}
        </button>
      )}
    </Field>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 text-[10px] font-semibold tracking-[0.12em] text-[var(--text-faint)] uppercase">
        {label}
      </h3>
      {children}
    </section>
  );
}
