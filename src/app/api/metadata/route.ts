import { NextResponse } from "next/server";
import { isPrivateHost, parseMetadata, titleFromUrl } from "@/lib/og";

/**
 * Lê os metadados Open Graph de uma URL para montar o card da referência.
 *
 * Precisa rodar no servidor: o navegador não consegue buscar o HTML de outro
 * domínio por causa do CORS. Nada é armazenado aqui — a resposta vai direto
 * para o IndexedDB do usuário.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FETCH_TIMEOUT_MS = 8_000;
const MAX_HTML_BYTES = 512 * 1024; // O <head> sempre cabe nisso.

// Alguns sites entregam um HTML mais completo pra crawlers identificados do
// que para um user-agent genérico.
const USER_AGENT =
  "Mozilla/5.0 (compatible; ReferenciasBot/1.0; +https://github.com/ProdutosAUVP/teste_ref)";

export interface Metadata {
  url: string;
  title?: string;
  description?: string;
  imageUrl?: string;
  siteName?: string;
  faviconUrl?: string;
  kind: "link" | "image";
}

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("url");
  if (!raw) {
    return NextResponse.json({ error: "Parâmetro 'url' é obrigatório" }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ error: "URL inválida" }, { status: 400 });
  }

  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return NextResponse.json({ error: "Só aceito http e https" }, { status: 400 });
  }

  if (isPrivateHost(target.hostname)) {
    return NextResponse.json({ error: "Endereço não permitido" }, { status: 400 });
  }

  const host = target.hostname.replace(/^www\./, "");
  const fallback: Metadata = {
    url: target.toString(),
    title: titleFromUrl(target),
    siteName: host,
    faviconUrl: `https://www.google.com/s2/favicons?sz=64&domain=${target.hostname}`,
    kind: "link",
  };

  try {
    const response = await fetchWithTimeout(target.toString());
    const contentType = response.headers.get("content-type") ?? "";

    // A URL aponta direto pra uma imagem: ela já é a própria capa.
    if (contentType.startsWith("image/")) {
      return NextResponse.json({
        ...fallback,
        kind: "image",
        imageUrl: target.toString(),
      } satisfies Metadata);
    }

    if (!response.ok || !contentType.includes("html")) {
      return NextResponse.json(fallback);
    }

    const html = await readCapped(response, MAX_HTML_BYTES);
    const parsed = parseMetadata(html, response.url || target.toString());

    const metadata: Metadata = {
      url: target.toString(),
      kind: "link",
      title: parsed.title ?? fallback.title,
      description: parsed.description,
      imageUrl: parsed.imageUrl,
      siteName: parsed.siteName ?? fallback.siteName,
      faviconUrl: parsed.faviconUrl ?? fallback.faviconUrl,
    };

    return NextResponse.json(metadata, {
      // O mesmo link colado duas vezes seguidas não precisa de nova visita.
      headers: { "cache-control": "public, max-age=3600, s-maxage=86400" },
    });
  } catch {
    // Site fora do ar, bloqueando bots ou lento demais: salvamos com o que dá
    // pra deduzir da própria URL, em vez de falhar a captura.
    return NextResponse.json(fallback);
  }
}

async function fetchWithTimeout(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml,image/*;q=0.8,*/*;q=0.5",
        "accept-language": "pt-BR,pt;q=0.9,en;q=0.8",
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Lê no máximo `limit` bytes do corpo e abandona o resto da conexão. */
async function readCapped(response: Response, limit: number): Promise<string> {
  const body = response.body;
  if (!body) return response.text();

  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let output = "";
  let total = 0;

  try {
    while (total < limit) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      output += decoder.decode(value, { stream: true });
      if (/<\/head>/i.test(output)) break;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }

  return output;
}
