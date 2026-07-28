"use client";

import { Modal } from "./Modal";

const GROUPS: { title: string; rows: [keys: string, label: string][] }[] = [
  {
    title: "Em qualquer lugar",
    rows: [
      ["⌘K / Ctrl K", "Busca rápida de tudo"],
      ["A", "Focar a barra de captura"],
      ["/", "Focar o filtro da lista atual"],
      ["B", "Criar um board"],
      ["T", "Alternar tema claro/escuro"],
      ["?", "Este quadro de atalhos"],
    ],
  },
  {
    title: "Navegando pelas referências",
    rows: [
      ["← ↑ ↓ →", "Mover o foco entre os cards"],
      ["J / K", "Próxima / anterior"],
      ["Enter", "Abrir o painel de detalhe"],
      ["O", "Abrir o link original em nova aba"],
      ["F", "Favoritar"],
      ["Delete", "Excluir (com desfazer)"],
      ["Esc", "Fechar o que estiver aberto"],
    ],
  },
  {
    title: "Capturando",
    rows: [
      ["Enter", "Salvar o que está na barra"],
      ["Shift Enter", "Quebrar linha na nota"],
      ["#d97757 …", "Colar hexadecimais cria uma paleta"],
      ["Ctrl/⌘ V", "Colar link, cores ou print direto na página"],
      ["Arrastar", "Soltar imagens em qualquer lugar da janela"],
    ],
  },
];

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      title="Atalhos do teclado"
      description="A ideia é nunca precisar do mouse pra capturar ou achar algo."
      onClose={onClose}
      width="lg"
    >
      <div className="grid gap-6 sm:grid-cols-2">
        {GROUPS.map((group) => (
          <section key={group.title} className={group.title === "Capturando" ? "sm:col-span-2" : undefined}>
            <h3 className="mb-2 text-[10px] font-semibold tracking-[0.12em] text-[var(--text-faint)] uppercase">
              {group.title}
            </h3>
            <dl className="flex flex-col gap-1.5">
              {group.rows.map(([keys, label]) => (
                <div key={keys} className="flex items-center gap-3">
                  <dt className="w-28 shrink-0">
                    <kbd className="rounded-md border border-[var(--border)] bg-[var(--bg-sunken)] px-1.5 py-0.5 font-sans text-[11px] text-[var(--text-muted)]">
                      {keys}
                    </kbd>
                  </dt>
                  <dd className="text-[13px] text-[var(--text-muted)]">{label}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Modal>
  );
}
