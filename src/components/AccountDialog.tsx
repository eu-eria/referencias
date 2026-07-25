"use client";

import { useState } from "react";
import { signIn, signOut, syncNow, useSyncState } from "@/lib/sync";
import { cx, timeAgo } from "@/lib/utils";
import { Button, Modal } from "./Modal";
import { toast } from "./Toast";
import { CheckIcon, SparkIcon } from "./Icons";

/**
 * Entrar numa conta é o que liga a sincronização. Sem conta, o app continua
 * exatamente como era — por isso o diálogo explica o que muda em vez de
 * bloquear a tela pedindo login.
 */
export function AccountDialog({ onClose }: { onClose: () => void }) {
  const sync = useSyncState();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (sync.status === "unconfigured") {
    return (
      <Modal
        title="Sincronização entre dispositivos"
        description="Esta instalação está rodando só no modo local."
        onClose={onClose}
        footer={<Button onClick={onClose}>Entendi</Button>}
      >
        <div className="flex flex-col gap-4 text-[13px] leading-relaxed text-[var(--text-muted)]">
          <p>
            Suas referências estão salvas neste navegador e continuam
            funcionando normalmente. Pra acessá-las de outro computador ou do
            celular, é preciso apontar o app para um banco de dados.
          </p>
          <div>
            <p className="mb-1.5 font-medium text-[var(--text)]">
              Como ligar
            </p>
            <p>
              Defina a variável de ambiente <Code>DATABASE_URL</Code> e reinicie
              o servidor. Vale um Postgres gerenciado:
            </p>
            <pre className="mt-2 overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--bg-sunken)] p-3 font-mono text-[11.5px] text-[var(--text)]">
              DATABASE_URL=postgres://usuario:senha@host:5432/banco
            </pre>
            <p className="mt-2">
              …ou um arquivo SQLite, se você mesmo hospeda:
            </p>
            <pre className="mt-2 overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--bg-sunken)] p-3 font-mono text-[11.5px] text-[var(--text)]">
              DATABASE_URL=file:./data/referencias.db
            </pre>
          </div>
          <p>
            As tabelas são criadas sozinhas na primeira vez. Enquanto isso, o
            backup em JSON continua sendo a forma de levar o acervo daqui pra
            outro lugar.
          </p>
        </div>
      </Modal>
    );
  }

  if (sync.user) {
    return (
      <Modal
        title="Sua conta"
        description="As referências deste navegador estão sincronizadas."
        onClose={onClose}
        footer={
          <>
            <Button
              variant="danger"
              className="mr-auto"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await signOut();
                setBusy(false);
                toast("Você saiu. O acervo continua salvo neste navegador.");
                onClose();
              }}
            >
              Sair da conta
            </Button>
            <Button onClick={onClose}>Fechar</Button>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <div className="card-surface flex items-center gap-3 p-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent-text)]">
              <CheckIcon size={17} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium">{sync.user.email}</p>
              <p className="text-[11px] text-[var(--text-faint)]">
                {sync.status === "syncing"
                  ? "Sincronizando agora…"
                  : sync.lastSyncAt
                    ? `Última sincronização ${timeAgo(sync.lastSyncAt)}`
                    : "Ainda não sincronizou"}
              </p>
            </div>
          </div>

          {sync.pending > 0 && (
            <p className="text-[12.5px] text-[var(--text-muted)]">
              {sync.pending}{" "}
              {sync.pending === 1
                ? "alteração esperando para subir."
                : "alterações esperando para subir."}{" "}
              Elas sobem sozinhas assim que a conexão permitir.
            </p>
          )}

          {sync.error && (
            <p className="rounded-lg border border-red-500/35 bg-red-500/10 p-3 text-[12.5px] text-red-300">
              {sync.error}
            </p>
          )}

          <div>
            <Button
              variant="primary"
              disabled={sync.status === "syncing"}
              onClick={() => void syncNow()}
            >
              <span className="flex items-center gap-1.5">
                <SparkIcon size={14} />
                {sync.status === "syncing" ? "Sincronizando…" : "Sincronizar agora"}
              </span>
            </Button>
          </div>

          <p className="text-[12px] leading-relaxed text-[var(--text-faint)]">
            Entre com esta mesma conta em outro navegador e o acervo aparece lá.
            Quando dois dispositivos editam a mesma referência, vale a alteração
            mais recente.
          </p>
        </div>
      </Modal>
    );
  }

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password, mode);
      toast(
        mode === "register" ? "Conta criada e acervo sincronizado" : "Tudo sincronizado",
        { tone: "success" },
      );
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não consegui entrar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={mode === "login" ? "Entrar" : "Criar conta"}
      description="Sincronize suas referências entre computador e celular."
      onClose={onClose}
      footer={
        <>
          <Button
            className="mr-auto"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError(null);
            }}
          >
            {mode === "login" ? "Criar uma conta" : "Já tenho conta"}
          </Button>
          <Button onClick={onClose}>Cancelar</Button>
          <Button
            variant="primary"
            disabled={busy || !email || password.length < 8}
            onClick={() => void submit()}
          >
            {busy ? "Aguarde…" : mode === "login" ? "Entrar" : "Criar conta"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <Label>E-mail</Label>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && void submit()}
            placeholder="voce@exemplo.com"
            className={inputClass}
          />
        </div>

        <div>
          <Label>Senha</Label>
          <input
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && void submit()}
            placeholder="pelo menos 8 caracteres"
            className={inputClass}
          />
        </div>

        {error && (
          <p className="rounded-lg border border-red-500/35 bg-red-500/10 p-3 text-[12.5px] text-red-300">
            {error}
          </p>
        )}

        <p className="text-[12px] leading-relaxed text-[var(--text-faint)]">
          {mode === "register"
            ? "O que já está salvo neste navegador sobe pra conta assim que você criar o login — nada se perde."
            : "Ao entrar, as referências deste navegador se juntam às da conta. Referências iguais não duplicam."}
        </p>
      </div>
    </Modal>
  );
}

const inputClass =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--bg-sunken)] px-3 py-2 text-sm text-[var(--text)] outline-none transition placeholder:text-[var(--text-faint)] focus:border-[var(--border-strong)]";

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1.5 block text-[10px] font-semibold tracking-[0.12em] text-[var(--text-faint)] uppercase">
      {children}
    </label>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-[var(--bg-sunken)] px-1 py-0.5 font-mono text-[11.5px] text-[var(--text)]">
      {children}
    </code>
  );
}

/** Botão da barra lateral: mostra o estado da sincronização num relance. */
export function SyncButton({ onClick }: { onClick: () => void }) {
  const sync = useSyncState();

  const { label, dot, title } = describe(sync.status, sync.pending);

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-[7px] text-left text-[12px] text-[var(--text-muted)] transition hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
    >
      <span
        className={cx(
          "h-1.5 w-1.5 shrink-0 rounded-full",
          dot,
          sync.status === "syncing" && "animate-pulse",
        )}
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {sync.pending > 0 && sync.status !== "signed-out" && (
        <span className="shrink-0 text-[10px] text-[var(--text-faint)] tabular-nums">
          {sync.pending}
        </span>
      )}
    </button>
  );
}

function describe(status: ReturnType<typeof useSyncState>["status"], pending: number) {
  switch (status) {
    case "syncing":
      return {
        label: "Sincronizando…",
        dot: "bg-[var(--accent)]",
        title: "Enviando e baixando alterações",
      };
    case "idle":
      return {
        label: pending > 0 ? "Alterações na fila" : "Sincronizado",
        dot: pending > 0 ? "bg-amber-400" : "bg-emerald-500",
        title: "Clique para ver a conta",
      };
    case "offline":
      return {
        label: "Sem conexão",
        dot: "bg-amber-400",
        title: "As alterações sobem quando a internet voltar",
      };
    case "error":
      return {
        label: "Falha ao sincronizar",
        dot: "bg-red-500",
        title: "Clique para ver o erro e tentar de novo",
      };
    case "unconfigured":
      return {
        label: "Só neste navegador",
        dot: "bg-[var(--text-faint)]",
        title: "Sincronização não configurada nesta instalação",
      };
    default:
      return {
        label: "Entrar e sincronizar",
        dot: "bg-[var(--text-faint)]",
        title: "Sincronize suas referências entre dispositivos",
      };
  }
}
