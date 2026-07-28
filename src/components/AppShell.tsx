"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Board, Item, ItemKind } from "@/lib/types";
import {
  createBoard,
  createItem,
  deleteBoard,
  deleteItem,
  loadStore,
  markOpened,
  setSort,
  setView,
  toggleFavorite,
  toggleTheme,
  updateBoard,
  updateItem,
  useBoardCounts,
  useStore,
  useTagCounts,
} from "@/lib/store";
import {
  captureImages,
  captureLinks,
  capturePalette,
  extractUrls,
  readPalette,
} from "@/lib/capture";
import { filterItems, selectionKey, type Selection } from "@/lib/view";
import { cx, isProbablyUrl } from "@/lib/utils";
import { isTypingTarget, useDebounced } from "@/lib/hooks";
import { initSync, syncNow } from "@/lib/sync";
import { Sidebar } from "./Sidebar";
import { CaptureBar } from "./CaptureBar";
import { Toolbar } from "./Toolbar";
import { ItemGrid } from "./ItemGrid";
import { DetailDrawer } from "./DetailDrawer";
import { CommandPalette } from "./CommandPalette";
import { BoardDialog } from "./BoardDialog";
import { SettingsDialog } from "./SettingsDialog";
import { ShortcutsDialog } from "./ShortcutsDialog";
import { EmptyState } from "./EmptyState";
import { AccountDialog } from "./AccountDialog";
import { toast } from "./Toast";
import { ImageIcon, ListIcon, SearchIcon, SparkIcon } from "./Icons";

type BoardDialogState = { mode: "new" } | { mode: "edit"; board: Board } | null;

export function AppShell() {
  const { ready, items, boards, settings } = useStore();
  const boardCounts = useBoardCounts();
  const tagCounts = useTagCounts();

  const [selection, setSelection] = useState<Selection>({ type: "todos" });
  const [rawQuery, setRawQuery] = useState("");
  const [kinds, setKinds] = useState<ItemKind[]>([]);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [boardDialog, setBoardDialog] = useState<BoardDialogState>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dragging, setDragging] = useState(false);

  const query = useDebounced(rawQuery, 130);
  const gridRef = useRef<HTMLDivElement>(null);
  const dragDepth = useRef(0);

  useEffect(() => {
    // O acervo local abre primeiro; a sincronização entra por cima depois,
    // pra tela nunca esperar a rede pra pintar.
    void loadStore().then(() => initSync());
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.style.colorScheme = settings.theme;
  }, [settings.theme]);

  const visibleItems = useMemo(
    () => filterItems(items, { selection, query, kinds, sort: settings.sort }),
    [items, selection, query, kinds, settings.sort],
  );

  const detailItem = detailId ? (items.find((item) => item.id === detailId) ?? null) : null;
  const detailIndex = detailItem
    ? visibleItems.findIndex((item) => item.id === detailItem.id)
    : -1;

  // Trocar de recorte reposiciona o foco no começo da nova lista.
  useEffect(() => {
    setFocusedId(null);
  }, [selectionKey(selection), query, kinds.join(","), settings.sort]);

  /* ───────────────────────────── ações ─────────────────────────────── */

  const focusCapture = useCallback(() => {
    const input = document.getElementById("capture-input") as HTMLTextAreaElement | null;
    input?.focus();
    input?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, []);

  const openDetail = useCallback((item: Item) => {
    setDetailId(item.id);
    setFocusedId(item.id);
    void markOpened(item.id);
  }, []);

  const openSource = useCallback((item: Item) => {
    if (!item.url) {
      setDetailId(item.id);
      return;
    }
    window.open(item.url, "_blank", "noopener,noreferrer");
    void markOpened(item.id);
  }, []);

  const handleSelect = useCallback((next: Selection) => {
    setSelection(next);
    setSidebarOpen(false);
    setDetailId(null);
  }, []);

  const removeItem = useCallback(async (item: Item) => {
    await deleteItem(item.id);
    setDetailId((current) => (current === item.id ? null : current));
    toast(`“${item.title.slice(0, 40)}” excluída`, {
      action: {
        label: "Desfazer",
        // Recriar com o mesmo id devolve o item exatamente onde estava.
        run: () => void createItem({ ...item, id: item.id, createdAt: item.createdAt }),
      },
    });
  }, []);

  const navigateDetail = useCallback(
    (direction: -1 | 1) => {
      if (detailIndex < 0) return;
      const next = visibleItems[detailIndex + direction];
      if (next) openDetail(next);
    },
    [detailIndex, visibleItems, openDetail],
  );

  /* ─────────────────── navegação por teclado no mural ──────────────── */

  const moveFocus = useCallback(
    (direction: "up" | "down" | "left" | "right" | "next" | "previous") => {
      if (visibleItems.length === 0) return;

      const currentIndex = focusedId
        ? visibleItems.findIndex((item) => item.id === focusedId)
        : -1;

      if (direction === "next" || direction === "previous") {
        const delta = direction === "next" ? 1 : -1;
        const nextIndex = Math.min(
          Math.max(currentIndex + delta, 0),
          visibleItems.length - 1,
        );
        setFocusedId(visibleItems[currentIndex === -1 ? 0 : nextIndex].id);
        return;
      }

      const nodes = Array.from(
        gridRef.current?.querySelectorAll<HTMLElement>("[data-item-id]") ?? [],
      );
      if (nodes.length === 0) return;

      if (currentIndex === -1) {
        setFocusedId(visibleItems[0].id);
        return;
      }

      // Geometria em vez de índice: funciona no mural, onde as colunas têm
      // alturas diferentes e "o de baixo" não é simplesmente index + colunas.
      const currentNode = nodes.find((node) => node.dataset.itemId === focusedId);
      if (!currentNode) return;

      const origin = currentNode.getBoundingClientRect();
      const horizontal = direction === "left" || direction === "right";
      const sign = direction === "right" || direction === "down" ? 1 : -1;

      let best: { id: string; cost: number } | null = null;

      for (const node of nodes) {
        const id = node.dataset.itemId;
        if (!id || id === focusedId) continue;
        const rect = node.getBoundingClientRect();

        const mainDelta = horizontal
          ? rect.left - origin.left
          : rect.top - origin.top;
        if (mainDelta * sign <= 1) continue;

        const crossDelta = horizontal
          ? Math.abs(rect.top - origin.top)
          : Math.abs(rect.left - origin.left);

        // Desalinhar na outra direção custa caro, então a busca fica na coluna
        // (ou na linha) de origem enquanto houver candidato lá.
        const cost = Math.abs(mainDelta) + crossDelta * 2.5;
        if (!best || cost < best.cost) best = { id, cost };
      }

      if (best) {
        setFocusedId(best.id);
        nodes
          .find((node) => node.dataset.itemId === best!.id)
          ?.scrollIntoView({ block: "nearest" });
      }
    },
    [focusedId, visibleItems],
  );

  // Rolar até o card focado quando o foco muda por j/k.
  useEffect(() => {
    if (!focusedId) return;
    gridRef.current
      ?.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(focusedId)}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [focusedId]);

  /* ──────────────────────── atalhos globais ────────────────────────── */

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const meta = event.metaKey || event.ctrlKey;

      if (meta && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
        return;
      }

      if (isTypingTarget(event.target) || meta || event.altKey) return;

      const anyOverlay =
        paletteOpen || boardDialog || settingsOpen || shortcutsOpen || accountOpen;

      if (event.key === "Escape") {
        if (detailId) setDetailId(null);
        else if (focusedId) setFocusedId(null);
        return;
      }

      if (anyOverlay) return;

      switch (event.key) {
        case "a":
          event.preventDefault();
          focusCapture();
          return;
        case "/":
          event.preventDefault();
          document.getElementById("filter-input")?.focus();
          return;
        case "b":
          event.preventDefault();
          setBoardDialog({ mode: "new" });
          return;
        case "t":
          event.preventDefault();
          toggleTheme();
          return;
        case "?":
          event.preventDefault();
          setShortcutsOpen(true);
          return;
        case "ArrowDown":
          event.preventDefault();
          moveFocus("down");
          return;
        case "ArrowUp":
          event.preventDefault();
          moveFocus("up");
          return;
        case "ArrowLeft":
          event.preventDefault();
          moveFocus("left");
          return;
        case "ArrowRight":
          event.preventDefault();
          moveFocus("right");
          return;
        case "j":
          event.preventDefault();
          if (detailId) navigateDetail(1);
          else moveFocus("next");
          return;
        case "k":
          event.preventDefault();
          if (detailId) navigateDetail(-1);
          else moveFocus("previous");
          return;
        default:
          break;
      }

      const target = detailItem ?? visibleItems.find((item) => item.id === focusedId);
      if (!target) return;

      switch (event.key) {
        case "Enter":
          event.preventDefault();
          openDetail(target);
          break;
        case "o":
          event.preventDefault();
          openSource(target);
          break;
        case "f":
          event.preventDefault();
          void toggleFavorite(target.id);
          break;
        case "Delete":
        case "Backspace":
          event.preventDefault();
          void removeItem(target);
          break;
        default:
          break;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    paletteOpen,
    boardDialog,
    settingsOpen,
    shortcutsOpen,
    accountOpen,
    detailId,
    detailItem,
    focusedId,
    visibleItems,
    moveFocus,
    navigateDetail,
    openDetail,
    openSource,
    removeItem,
    focusCapture,
  ]);

  /* ─────────────────── colar e arrastar em qualquer lugar ──────────── */

  const targetBoardId = selection.type === "board" ? selection.id : null;
  const targetBoardIds = useMemo(
    () => (targetBoardId ? [targetBoardId] : []),
    [targetBoardId],
  );

  useEffect(() => {
    async function onPaste(event: ClipboardEvent) {
      if (isTypingTarget(event.target) || paletteOpen) return;

      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length > 0) {
        event.preventDefault();
        try {
          const saved = await captureImages(files, targetBoardIds);
          toast(`${saved.length > 1 ? `${saved.length} imagens salvas` : "Print salvo"}`, {
            tone: "success",
          });
        } catch {
          toast("Não consegui ler a imagem da área de transferência", { tone: "error" });
        }
        return;
      }

      const text = event.clipboardData?.getData("text/plain")?.trim();
      if (!text) return;

      const palette = readPalette(text);
      if (palette) {
        event.preventDefault();
        try {
          const saved = await capturePalette(palette, targetBoardIds);
          setFocusedId(saved.id);
          toast(
            palette.length === 1 ? "Cor salva" : `Paleta de ${palette.length} cores salva`,
            { tone: "success" },
          );
        } catch {
          toast("Não consegui salvar essas cores", { tone: "error" });
        }
        return;
      }

      if (!isProbablyUrl(text)) return;

      event.preventDefault();
      try {
        const saved = await captureLinks(extractUrls(text), targetBoardIds);
        toast(`“${saved[0].title.slice(0, 40)}” salvo`, { tone: "success" });
      } catch {
        toast("Não consegui salvar esse link", { tone: "error" });
      }
    }

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [targetBoardIds, paletteOpen]);

  useEffect(() => {
    function onDragEnter(event: DragEvent) {
      if (!event.dataTransfer?.types.includes("Files")) return;
      dragDepth.current += 1;
      setDragging(true);
    }
    function onDragOver(event: DragEvent) {
      if (event.dataTransfer?.types.includes("Files")) event.preventDefault();
    }
    function onDragLeave() {
      // dragleave dispara ao cruzar cada elemento filho; o contador evita
      // que o overlay pisque enquanto o arquivo ainda está sobre a janela.
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    }
    async function onDrop(event: DragEvent) {
      if (!event.dataTransfer?.types.includes("Files")) return;
      event.preventDefault();
      dragDepth.current = 0;
      setDragging(false);

      const files = Array.from(event.dataTransfer.files ?? []);
      if (files.length === 0) return;
      try {
        const saved = await captureImages(files, targetBoardIds);
        toast(saved.length > 1 ? `${saved.length} imagens salvas` : "Imagem salva", {
          tone: "success",
        });
      } catch (error) {
        toast(error instanceof Error ? error.message : "Não consegui salvar", {
          tone: "error",
        });
      }
    }

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [targetBoardIds]);

  /* ────────────────────────────── render ───────────────────────────── */

  const header = headerFor(selection, boards);
  const favoriteCount = items.filter((item) => item.favorite).length;
  const looseCount = items.filter((item) => item.boardIds.length === 0).length;

  return (
    <div className="flex h-dvh overflow-hidden bg-[var(--bg)]">
      <Sidebar
        boards={boards}
        boardCounts={boardCounts}
        tagCounts={tagCounts}
        totalCount={items.length}
        favoriteCount={favoriteCount}
        looseCount={looseCount}
        selection={selection}
        theme={settings.theme}
        open={sidebarOpen}
        onSelect={handleSelect}
        onCreateBoard={() => setBoardDialog({ mode: "new" })}
        onEditBoard={(board) => setBoardDialog({ mode: "edit", board })}
        onToggleTheme={toggleTheme}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenShortcuts={() => setShortcutsOpen(true)}
        onOpenAccount={() => setAccountOpen(true)}
        onClose={() => setSidebarOpen(false)}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="shrink-0 border-b border-[var(--border)] bg-[var(--bg)]/85 px-4 pt-3 pb-3 backdrop-blur md:px-6">
          <div className="mb-3 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Abrir menu"
              className="rounded-lg p-1.5 text-[var(--text-muted)] transition hover:bg-[var(--surface-hover)] lg:hidden"
            >
              <ListIcon size={18} />
            </button>

            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[17px] font-semibold tracking-tight">
                {header.title}
              </h1>
              {header.description && (
                <p className="truncate text-xs text-[var(--text-muted)]">
                  {header.description}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="flex shrink-0 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-sunken)] px-2.5 py-1.5 text-xs text-[var(--text-faint)] transition hover:border-[var(--border-strong)] hover:text-[var(--text-muted)]"
            >
              <SearchIcon size={14} />
              <span className="hidden sm:inline">Buscar tudo</span>
              <kbd className="hidden rounded border border-[var(--border)] px-1 font-sans text-[10px] sm:inline">
                ⌘K
              </kbd>
            </button>
          </div>

          <div className="flex flex-col gap-2.5">
            <CaptureBar
              boards={boards}
              targetBoardId={targetBoardId}
              onCaptured={(saved) => {
                if (saved[0]) setFocusedId(saved[0].id);
              }}
            />
            <Toolbar
              query={rawQuery}
              kinds={kinds}
              view={settings.view}
              sort={settings.sort}
              count={visibleItems.length}
              onQueryChange={setRawQuery}
              onToggleKind={(kind) =>
                setKinds((current) =>
                  current.includes(kind)
                    ? current.filter((entry) => entry !== kind)
                    : [...current, kind],
                )
              }
              onViewChange={setView}
              onSortChange={setSort}
            />
          </div>
        </div>

        <div ref={gridRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6">
          {!ready ? (
            <SkeletonGrid />
          ) : visibleItems.length === 0 ? (
            <EmptyState
              selection={selection}
              query={query}
              hasAnyItem={items.length > 0}
              onClearFilters={() => {
                setRawQuery("");
                setKinds([]);
                setSelection({ type: "todos" });
              }}
              onFocusCapture={focusCapture}
            />
          ) : (
            <ItemGrid
              items={visibleItems}
              view={settings.view}
              boards={boards}
              focusedId={focusedId}
              onSelect={openDetail}
              onToggleFavorite={(item) => void toggleFavorite(item.id)}
              onOpenSource={openSource}
              onTagClick={(tag) => handleSelect({ type: "tag", name: tag })}
            />
          )}
        </div>
      </main>

      {detailItem && (
        <DetailDrawer
          item={detailItem}
          items={items}
          boards={boards}
          hasPrevious={detailIndex > 0}
          hasNext={detailIndex >= 0 && detailIndex < visibleItems.length - 1}
          onClose={() => setDetailId(null)}
          onNavigate={navigateDetail}
          onSelectItem={openDetail}
          onUpdate={(id, patch) => void updateItem(id, patch)}
          onDelete={(item) => void removeItem(item)}
          onToggleFavorite={(item) => void toggleFavorite(item.id)}
          onOpenSource={openSource}
          onTagClick={(tag) => handleSelect({ type: "tag", name: tag })}
        />
      )}

      {paletteOpen && (
        <CommandPalette
          items={items}
          boards={boards}
          onClose={() => setPaletteOpen(false)}
          onOpenItem={openDetail}
          onSelect={handleSelect}
          onCreateBoard={() => setBoardDialog({ mode: "new" })}
          onFocusCapture={focusCapture}
        />
      )}

      {boardDialog && (
        <BoardDialog
          board={boardDialog.mode === "edit" ? boardDialog.board : null}
          itemCount={
            boardDialog.mode === "edit"
              ? (boardCounts.get(boardDialog.board.id) ?? 0)
              : 0
          }
          onClose={() => setBoardDialog(null)}
          onSave={async (values) => {
            if (boardDialog.mode === "edit") {
              await updateBoard(boardDialog.board.id, values);
              toast("Board atualizado", { tone: "success" });
            } else {
              const board = await createBoard(values);
              handleSelect({ type: "board", id: board.id });
              toast(`Board “${board.name}” criado`, { tone: "success" });
            }
            setBoardDialog(null);
          }}
          onDelete={
            boardDialog.mode === "edit"
              ? async () => {
                  await deleteBoard(boardDialog.board.id);
                  setSelection({ type: "todos" });
                  setBoardDialog(null);
                  toast("Board excluído — as referências continuam salvas");
                }
              : undefined
          }
        />
      )}

      {settingsOpen && (
        <SettingsDialog
          itemCount={items.length}
          boardCount={boards.length}
          onClose={() => setSettingsOpen(false)}
          onChanged={() => {
            setSelection({ type: "todos" });
            setDetailId(null);
            void syncNow();
          }}
        />
      )}

      {shortcutsOpen && <ShortcutsDialog onClose={() => setShortcutsOpen(false)} />}

      {accountOpen && <AccountDialog onClose={() => setAccountOpen(false)} />}

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-[75] flex items-center justify-center bg-[var(--bg)]/80 backdrop-blur-sm animate-fade-in">
          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-[var(--accent)] px-12 py-10">
            <ImageIcon size={30} className="text-[var(--accent)]" />
            <p className="text-sm font-medium">Solte para salvar no acervo</p>
            {targetBoardId && (
              <p className="text-xs text-[var(--text-muted)]">
                Vai direto para {header.title}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function headerFor(
  selection: Selection,
  boards: Board[],
): { title: string; description?: string } {
  switch (selection.type) {
    case "favoritos":
      return { title: "Favoritos", description: "O que você marcou como essencial" };
    case "recentes":
      return {
        title: "Vistos recentemente",
        description: "Na ordem em que você abriu",
      };
    case "soltos":
      return {
        title: "Sem board",
        description: "Referências que ainda não foram organizadas",
      };
    case "board": {
      const board = boards.find((entry) => entry.id === selection.id);
      return {
        title: board ? `${board.emoji} ${board.name}` : "Board",
        description: board?.description,
      };
    }
    case "tag":
      return { title: `#${selection.name}`, description: "Filtrando por tag" };
    default:
      return { title: "Tudo", description: "Todo o seu acervo, do mais novo ao mais antigo" };
  }
}

function SkeletonGrid() {
  return (
    <div className="masonry columns-1 sm:columns-2 lg:columns-3 xl:columns-4">
      {[220, 300, 180, 260, 200, 320, 240, 190].map((height, index) => (
        <div key={index} className="masonry-item">
          <div
            className={cx("card-surface animate-pulse")}
            style={{ height }}
            aria-hidden="true"
          />
        </div>
      ))}
      <span className="sr-only">
        <SparkIcon /> Carregando acervo…
      </span>
    </div>
  );
}
