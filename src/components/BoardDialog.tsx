"use client";

import { useState } from "react";
import { BOARD_COLORS, BOARD_EMOJIS, type Board } from "@/lib/types";
import { cx } from "@/lib/utils";
import { Button, Modal } from "./Modal";

export function BoardDialog({
  board,
  itemCount,
  onClose,
  onSave,
  onDelete,
}: {
  /** `null` cria um board novo. */
  board: Board | null;
  itemCount: number;
  onClose: () => void;
  onSave: (values: { name: string; emoji: string; color: string; description: string }) => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(board?.name ?? "");
  const [emoji, setEmoji] = useState(board?.emoji ?? BOARD_EMOJIS[0]);
  const [color, setColor] = useState<string>(board?.color ?? BOARD_COLORS[0]);
  const [description, setDescription] = useState(board?.description ?? "");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const editing = Boolean(board);
  const canSave = name.trim().length > 0;

  function save() {
    if (!canSave) return;
    onSave({ name: name.trim(), emoji, color, description: description.trim() });
  }

  return (
    <Modal
      title={editing ? "Editar board" : "Novo board"}
      description={
        editing
          ? "Excluir o board não apaga as referências — elas voltam para “Sem board”."
          : "Boards agrupam referências por assunto. Uma referência pode estar em vários."
      }
      onClose={onClose}
      footer={
        <>
          {editing && onDelete && (
            <Button
              variant="danger"
              className="mr-auto"
              onClick={() => (confirmingDelete ? onDelete() : setConfirmingDelete(true))}
            >
              {confirmingDelete
                ? `Confirmar exclusão${itemCount > 0 ? ` (${itemCount} itens ficam soltos)` : ""}`
                : "Excluir board"}
            </Button>
          )}
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={!canSave} onClick={save}>
            {editing ? "Salvar" : "Criar board"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div>
          <Label>Nome</Label>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") save();
            }}
            placeholder="Ex.: Landing pages que convertem"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-sunken)] px-3 py-2 text-sm text-[var(--text)] outline-none transition placeholder:text-[var(--text-faint)] focus:border-[var(--border-strong)]"
          />
        </div>

        <div>
          <Label>Descrição (opcional)</Label>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={2}
            placeholder="Pra que serve esse board?"
            className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--bg-sunken)] px-3 py-2 text-sm text-[var(--text)] outline-none transition placeholder:text-[var(--text-faint)] focus:border-[var(--border-strong)]"
          />
        </div>

        <div>
          <Label>Ícone</Label>
          <div className="flex flex-wrap gap-1">
            {BOARD_EMOJIS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setEmoji(option)}
                className={cx(
                  "flex h-8 w-8 items-center justify-center rounded-lg text-base transition",
                  emoji === option
                    ? "bg-[var(--accent-soft)] ring-1 ring-[var(--accent)]"
                    : "hover:bg-[var(--surface-hover)]",
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label>Cor</Label>
          <div className="flex flex-wrap gap-2">
            {BOARD_COLORS.map((option) => (
              <button
                key={option}
                type="button"
                aria-label={`Cor ${option}`}
                onClick={() => setColor(option)}
                style={{ background: option }}
                className={cx(
                  "h-7 w-7 rounded-full transition",
                  color === option
                    ? "ring-2 ring-[var(--text)] ring-offset-2 ring-offset-[var(--bg-elevated)]"
                    : "opacity-70 hover:opacity-100",
                )}
              />
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1.5 block text-[10px] font-semibold tracking-[0.12em] text-[var(--text-faint)] uppercase">
      {children}
    </label>
  );
}
