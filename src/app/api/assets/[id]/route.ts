import { NextResponse } from "next/server";
import { currentUser } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { handled, unauthorized } from "@/lib/server/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Baixa a imagem de uma referência. Sempre filtrada pelo usuário da sessão:
 * mesmo sabendo o id, ninguém lê o arquivo de outra conta.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handled(async () => {
    const user = await currentUser();
    if (!user) return unauthorized();

    const { id } = await params;
    const db = await getDb();
    const rows = await db.query<{ mime: string; data: Uint8Array | Buffer }>(
      `SELECT mime, data FROM assets WHERE user_id = $1 AND id = $2`,
      [user.id, id],
    );

    const row = rows[0];
    if (!row) {
      return NextResponse.json({ error: "Imagem não encontrada" }, { status: 404 });
    }

    const bytes = new Uint8Array(row.data);
    return new NextResponse(bytes, {
      headers: {
        "content-type": row.mime,
        "content-length": String(bytes.byteLength),
        // O id nunca é reutilizado, então o arquivo é imutável.
        "cache-control": "private, max-age=31536000, immutable",
      },
    });
  });
}
