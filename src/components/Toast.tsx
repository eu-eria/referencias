"use client";

import { useEffect, useSyncExternalStore } from "react";
import { CheckIcon, CloseIcon } from "./Icons";
import { cx, uid } from "@/lib/utils";

export interface Toast {
  id: string;
  message: string;
  tone: "info" | "success" | "error";
  action?: { label: string; run: () => void };
}

let toasts: Toast[] = [];
const listeners = new Set<() => void>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const EMPTY: Toast[] = [];

export function dismissToast(id: string) {
  const timer = timers.get(id);
  if (timer) {
    clearTimeout(timer);
    timers.delete(id);
  }
  toasts = toasts.filter((toast) => toast.id !== id);
  emit();
}

export function toast(
  message: string,
  options: { tone?: Toast["tone"]; action?: Toast["action"]; duration?: number } = {},
) {
  const entry: Toast = {
    id: uid(),
    message,
    tone: options.tone ?? "info",
    action: options.action,
  };
  // No máximo três de cada vez: além disso vira ruído sobre o conteúdo.
  toasts = [...toasts, entry].slice(-3);
  emit();

  const duration = options.duration ?? (options.action ? 7_000 : 3_600);
  timers.set(
    entry.id,
    setTimeout(() => dismissToast(entry.id), duration),
  );

  return entry.id;
}

export function ToastViewport() {
  const items = useSyncExternalStore(
    subscribe,
    () => toasts,
    () => EMPTY,
  );

  useEffect(() => () => timers.forEach(clearTimeout), []);

  if (items.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-5 left-1/2 z-[80] flex w-[min(92vw,26rem)] -translate-x-1/2 flex-col gap-2"
      role="status"
      aria-live="polite"
    >
      {items.map((item) => (
        <div
          key={item.id}
          className={cx(
            "pointer-events-auto flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-sm shadow-lg backdrop-blur animate-pop-in",
            item.tone === "error"
              ? "border-red-500/40 bg-red-500/12 text-red-200"
              : "border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--text)]",
          )}
        >
          {item.tone === "success" && (
            <CheckIcon size={16} className="shrink-0 text-[var(--accent-text)]" />
          )}
          <span className="min-w-0 flex-1 leading-snug">{item.message}</span>
          {item.action && (
            <button
              type="button"
              onClick={() => {
                item.action?.run();
                dismissToast(item.id);
              }}
              className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-[var(--accent-text)] transition hover:bg-[var(--surface-hover)]"
            >
              {item.action.label}
            </button>
          )}
          <button
            type="button"
            onClick={() => dismissToast(item.id)}
            aria-label="Fechar aviso"
            className="shrink-0 rounded-lg p-1 text-[var(--text-faint)] transition hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
          >
            <CloseIcon size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
