import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";
import {
  clearAttempts,
  clientKey,
  createSession,
  normalizeEmail,
  setSessionCookie,
  tooManyAttempts,
  verifyPassword,
} from "@/lib/server/auth";
import { badRequest, handled } from "@/lib/server/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handled(async () => {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!email || !password) return badRequest("E-mail e senha são obrigatórios");

    const throttleKey = clientKey(request, `login:${email}`);
    if (tooManyAttempts(throttleKey)) {
      return NextResponse.json(
        { error: "Muitas tentativas. Tente de novo daqui a pouco." },
        { status: 429 },
      );
    }

    const db = await getDb();
    const rows = await db.query<{ id: string; email: string; password_hash: string }>(
      `SELECT id, email, password_hash FROM users WHERE email = $1`,
      [email],
    );

    const row = rows[0];
    // Mesma mensagem para e-mail inexistente e senha errada: dizer qual dos
    // dois falhou entrega a lista de quem tem conta.
    const invalid = badRequest("E-mail ou senha incorretos", "invalid_credentials");
    if (!row) return invalid;
    if (!(await verifyPassword(password, row.password_hash))) return invalid;

    clearAttempts(throttleKey);
    const token = await createSession(db, row.id);
    await setSessionCookie(token);

    return NextResponse.json({ user: { id: row.id, email: row.email } });
  });
}
