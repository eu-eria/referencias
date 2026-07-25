import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";
import {
  clientKey,
  createSession,
  hashPassword,
  newId,
  setSessionCookie,
  tooManyAttempts,
  validateCredentials,
} from "@/lib/server/auth";
import { badRequest, handled } from "@/lib/server/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handled(async () => {
    if (tooManyAttempts(clientKey(request, "register"))) {
      return NextResponse.json(
        { error: "Muitas tentativas. Tente de novo daqui a pouco." },
        { status: 429 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const parsed = validateCredentials(body.email, body.password);
    if ("error" in parsed) return badRequest(parsed.error);

    const db = await getDb();

    const existing = await db.query<{ id: string }>(
      `SELECT id FROM users WHERE email = $1`,
      [parsed.email],
    );
    if (existing.length > 0) {
      return badRequest("Já existe uma conta com esse e-mail", "email_taken");
    }

    const user = { id: newId(), email: parsed.email };
    await db.execute(
      `INSERT INTO users (id, email, password_hash, created_at) VALUES ($1, $2, $3, $4)`,
      [user.id, user.email, await hashPassword(parsed.password), Date.now()],
    );

    const token = await createSession(db, user.id);
    await setSessionCookie(token);

    return NextResponse.json({ user });
  });
}
