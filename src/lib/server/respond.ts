import "server-only";

import { NextResponse } from "next/server";
import { SyncNotConfiguredError } from "./db";

/**
 * Toda rota de conta/sync passa por aqui pra dar a mesma resposta em dois
 * casos que confundem muito quando se misturam:
 *   503 → a sincronização nem foi ligada (falta DATABASE_URL)
 *   500 → foi ligada, mas o banco falhou agora
 */
export async function handled<T>(
  fn: () => Promise<T>,
): Promise<T | NextResponse> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof SyncNotConfiguredError) {
      return NextResponse.json(
        { error: error.message, code: "sync_not_configured" },
        { status: 503 },
      );
    }
    console.error("[sync]", error);
    return NextResponse.json(
      { error: "Falha ao falar com o banco de dados", code: "database_error" },
      { status: 500 },
    );
  }
}

export function badRequest(message: string, code = "invalid_request") {
  return NextResponse.json({ error: message, code }, { status: 400 });
}

export function unauthorized(message = "Faça login para sincronizar") {
  return NextResponse.json({ error: message, code: "unauthorized" }, { status: 401 });
}
