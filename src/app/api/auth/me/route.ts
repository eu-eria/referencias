import { NextResponse } from "next/server";
import { currentUser } from "@/lib/server/auth";
import { isSyncConfigured } from "@/lib/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Consultado uma vez na abertura do app. Responde 200 mesmo sem banco: o
 * cliente precisa saber a diferença entre "não configurado" e "deslogado"
 * pra mostrar a mensagem certa.
 */
export async function GET() {
  if (!isSyncConfigured()) {
    return NextResponse.json({ configured: false, user: null });
  }

  try {
    return NextResponse.json({ configured: true, user: await currentUser() });
  } catch (error) {
    console.error("[auth/me]", error);
    return NextResponse.json(
      { configured: true, user: null, error: "Banco de dados indisponível" },
      { status: 200 },
    );
  }
}
