"use client";

import { useEffect, useRef, useState } from "react";
import type { Board, Item } from "@/lib/types";
import { captureImages, captureLinks, captureNote, extractUrls } from "@/lib/capture";
import { cx } from "@/lib/utils";
import { toast } from "./Toast";
import { ImageIcon, LinkIcon, NoteIcon, PlusIcon, SparkIcon } from "./Icons";

/**
 * A porta de entrada do acervo. Cola uma URL e dá Enter: o resto vem sozinho.
 * Se o texto não for link, vira nota. Um textarea único evita o "qual botão eu
 * aperto?" que mata a captura rápida.
 */
export function CaptureBar({
  boards,
  targetBoardId,
  onCaptured,
}: {
  boards: Board[];
  targetBoardId: string | null;
  onCaptured: (items: Item[]) => void;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [boardId, setBoardId] = useState<string | null>(targetBoardId);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Navegar pra dentro de um board passa a mirar nele por padrão.
  useEffect(() => {
    setBoardId(targetBoardId);
  }, [targetBoardId]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`;
  }, [value]);

  const urls = extractUrls(value);
  const mode: "link" | "note" | "empty" =
    value.trim() === "" ? "empty" : urls.length > 0 ? "link" : "note";
  const boardIds = boardId ? [boardId] : [];

  async function submit() {
    const text = value.trim();
    if (!text || busy) return;

    // A barra esvazia na hora e continua habilitada: buscar os metadados leva
    // um segundo, e nesse tempo já dá pra colar o próximo link. Deixar o campo
    // desabilitado tiraria o foco dele e transformaria o que você digitasse
    // em atalho global.
    setValue("");
    setBusy(true);
    try {
      if (urls.length > 0) {
        const saved = await captureLinks(urls, boardIds);
        onCaptured(saved);
        toast(
          saved.length > 1
            ? `${saved.length} links salvos`
            : `“${truncate(saved[0].title)}” salvo`,
          { tone: "success" },
        );
      } else {
        const saved = await captureNote(text, boardIds);
        onCaptured([saved]);
        toast("Nota salva", { tone: "success" });
      }
    } catch (error) {
      // Devolve o texto pro campo pra nada se perder — a não ser que o
      // usuário já tenha começado a escrever outra coisa.
      setValue((current) => (current === "" ? text : current));
      toast(error instanceof Error ? error.message : "Não consegui salvar", {
        tone: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      const saved = await captureImages(Array.from(files), boardIds);
      onCaptured(saved);
      toast(saved.length > 1 ? `${saved.length} imagens salvas` : "Imagem salva", {
        tone: "success",
      });
    } catch (error) {
      toast(error instanceof Error ? error.message : "Não consegui salvar", {
        tone: "error",
      });
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div
      className={cx(
        "card-surface relative flex flex-col gap-2 p-2.5 transition sm:flex-row sm:items-start",
        "focus-within:border-[var(--border-strong)]",
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        <span className="mt-2 ml-1 shrink-0 text-[var(--text-faint)]">
          {mode === "link" ? (
            <LinkIcon size={17} className="text-[var(--accent)]" />
          ) : mode === "note" ? (
            <NoteIcon size={17} className="text-[var(--accent)]" />
          ) : (
            <PlusIcon size={17} />
          )}
        </span>

        <textarea
          ref={textareaRef}
          id="capture-input"
          value={value}
          rows={1}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
            if (event.key === "Escape") {
              setValue("");
              event.currentTarget.blur();
            }
          }}
          placeholder="Cole um link, escreva uma ideia ou arraste uma imagem…"
          className="mt-1 max-h-44 min-w-0 flex-1 resize-none bg-transparent text-sm leading-relaxed text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]"
        />
      </div>

      {/* No mobile os controles vão para uma linha própria: com tudo na mesma
          faixa, o campo de texto some entre o seletor e o botão. */}
      <div className="flex shrink-0 items-center justify-end gap-1.5 sm:self-end">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(event) => void handleFiles(event.target.files)}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          title="Enviar imagens"
          aria-label="Enviar imagens"
          className="rounded-lg p-2 text-[var(--text-faint)] transition hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
        >
          <ImageIcon size={16} />
        </button>

        {boards.length > 0 && (
          <select
            value={boardId ?? ""}
            onChange={(event) => setBoardId(event.target.value || null)}
            title="Board de destino"
            className="max-w-[10rem] truncate rounded-lg border border-[var(--border)] bg-[var(--bg-sunken)] px-2 py-1.5 text-xs text-[var(--text-muted)] outline-none transition hover:text-[var(--text)]"
          >
            <option value="">Sem board</option>
            {boards.map((board) => (
              <option key={board.id} value={board.id}>
                {board.emoji} {board.name}
              </option>
            ))}
          </select>
        )}

        <button
          type="button"
          onClick={() => void submit()}
          disabled={mode === "empty" || busy}
          className={cx(
            "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition",
            mode === "empty" || busy
              ? "cursor-not-allowed bg-[var(--bg-sunken)] text-[var(--text-faint)]"
              : "bg-[var(--accent)] text-white hover:opacity-90",
          )}
        >
          {busy ? (
            <>
              <SparkIcon size={14} className="animate-pulse" />
              Salvando…
            </>
          ) : (
            <>
              {urls.length > 1 ? `Salvar ${urls.length}` : "Salvar"}
              <kbd className="hidden font-sans text-[10px] opacity-70 sm:inline">↵</kbd>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function truncate(value: string, max = 42) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
