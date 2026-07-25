import { NextResponse } from "next/server";
import { currentUser, newId } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { badRequest, handled, unauthorized } from "@/lib/server/respond";
import { MAX_ASSET_BYTES } from "@/lib/syncTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_MIME = /^image\/(png|jpeg|gif|webp|avif|bmp|svg\+xml)$/i;

/**
 * Envia a imagem de uma referência. O corpo é o arquivo cru — sem multipart,
 * já que é sempre um arquivo só e o cliente já tem o Blob na mão.
 */
export async function POST(request: Request) {
  return handled(async () => {
    const user = await currentUser();
    if (!user) return unauthorized();

    const mime = (request.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!ALLOWED_MIME.test(mime)) {
      return badRequest("Tipo de arquivo não suportado", "unsupported_media");
    }

    const declared = Number(request.headers.get("content-length") ?? 0);
    if (declared > MAX_ASSET_BYTES) {
      return badRequest("Imagem grande demais (máximo 8 MB)", "too_large");
    }

    const buffer = new Uint8Array(await request.arrayBuffer());
    if (buffer.byteLength === 0) return badRequest("Arquivo vazio");
    // Content-length pode mentir ou nem vir: o tamanho real manda.
    if (buffer.byteLength > MAX_ASSET_BYTES) {
      return badRequest("Imagem grande demais (máximo 8 MB)", "too_large");
    }

    const id = newId();
    const db = await getDb();
    await db.execute(
      `INSERT INTO assets (user_id, id, mime, size, data, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [user.id, id, mime, buffer.byteLength, buffer, Date.now()],
    );

    return NextResponse.json({ id, size: buffer.byteLength });
  });
}
