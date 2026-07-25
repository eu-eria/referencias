import { NextResponse } from "next/server";
import { clearSessionCookie, destroyCurrentSession } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  // Sair nunca falha: mesmo sem banco, o cookie sai e o app volta ao modo local.
  await destroyCurrentSession();
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
