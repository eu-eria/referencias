"use client";

import type { Selection } from "@/lib/view";
import { SearchIcon, SparkIcon } from "./Icons";

export function EmptyState({
  selection,
  query,
  hasAnyItem,
  onClearFilters,
  onFocusCapture,
}: {
  selection: Selection;
  query: string;
  hasAnyItem: boolean;
  onClearFilters: () => void;
  onFocusCapture: () => void;
}) {
  const filtering = query.trim().length > 0;

  const { title, body, action } = filtering
    ? {
        title: `Nada encontrado para “${query.trim()}”`,
        body: "Tente outra palavra, ou limpe os filtros pra ver tudo de novo.",
        action: { label: "Limpar filtros", run: onClearFilters },
      }
    : !hasAnyItem
      ? {
          title: "Seu acervo começa aqui",
          body: "Cole um link na barra de cima, escreva uma ideia ou arraste uma imagem pra dentro da janela. O título, a capa e as primeiras tags vêm sozinhos.",
          action: { label: "Adicionar a primeira referência", run: onFocusCapture },
        }
      : selection.type === "board"
        ? {
            title: "Board vazio por enquanto",
            body: "Salve algo com este board selecionado na barra de captura, ou abra uma referência existente e marque este board no painel de detalhe.",
            action: { label: "Adicionar referência", run: onFocusCapture },
          }
        : selection.type === "favoritos"
          ? {
              title: "Nenhum favorito ainda",
              body: "Aperte F sobre um card (ou clique na estrela) pra deixar as referências mais importantes sempre à mão.",
              action: null,
            }
          : selection.type === "recentes"
            ? {
                title: "Nada aberto ainda nesta sessão",
                body: "As referências que você abrir aparecem aqui, na ordem em que foram consultadas.",
                action: null,
              }
            : {
                title: "Nada por aqui",
                body: "Nenhuma referência corresponde a este recorte.",
                action: { label: "Ver tudo", run: onClearFilters },
              };

  return (
    <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
      <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text-faint)]">
        {filtering ? <SearchIcon size={19} /> : <SparkIcon size={19} />}
      </span>
      <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
      <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-[var(--text-muted)]">
        {body}
      </p>
      {action && (
        <button
          type="button"
          onClick={action.run}
          className="mt-4 rounded-lg bg-[var(--accent)] px-3.5 py-2 text-[13px] font-semibold text-white transition hover:opacity-90"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
