/**
 * Leitura de metadados Open Graph a partir do HTML — sem rede, sem DOM.
 *
 * Fica separado do route handler porque é a parte com regra de verdade
 * (ordem de atributos, entidades, URLs relativas) e dá pra testar sozinha:
 * `node --experimental-strip-types src/lib/og.test.ts`.
 */

export interface ParsedMetadata {
  title?: string;
  description?: string;
  imageUrl?: string;
  siteName?: string;
  faviconUrl?: string;
}

export function parseMetadata(html: string, baseUrl: string): ParsedMetadata {
  // Metadado só existe no <head>; cortar aqui evita casar com exemplos de
  // código no corpo da página.
  const closing = html.search(/<\/head>/i);
  const head = closing === -1 ? html : html.slice(0, closing);

  let base: URL | null = null;
  try {
    base = new URL(baseUrl);
  } catch {
    base = null;
  }

  return {
    title: pickMeta(head, ["og:title", "twitter:title"]) ?? pickTitleTag(head),
    description:
      pickMeta(head, ["og:description", "twitter:description", "description"]) ??
      undefined,
    imageUrl: absolutize(
      pickMeta(head, ["og:image:secure_url", "og:image", "twitter:image"]),
      base,
    ),
    siteName: pickMeta(head, ["og:site_name"]) ?? undefined,
    faviconUrl: absolutize(pickIconHref(head), base),
  };
}

export function pickMeta(html: string, keys: string[]): string | undefined {
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // `content` pode vir antes ou depois de `property`/`name` — os sites não
    // seguem uma ordem única, então tentamos as duas montagens.
    const patterns = [
      new RegExp(
        `<meta[^>]+(?:property|name)\\s*=\\s*["']${escaped}["'][^>]*content\\s*=\\s*["']([^"']*)["']`,
        "i",
      ),
      new RegExp(
        `<meta[^>]+content\\s*=\\s*["']([^"']*)["'][^>]*(?:property|name)\\s*=\\s*["']${escaped}["']`,
        "i",
      ),
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      const value = match?.[1] && decodeEntities(match[1]).trim();
      if (value) return value;
    }
  }
  return undefined;
}

export function pickTitleTag(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const value = match?.[1] && decodeEntities(match[1]).replace(/\s+/g, " ").trim();
  return value || undefined;
}

export function pickIconHref(html: string): string | undefined {
  const matches = html.matchAll(/<link[^>]+rel\s*=\s*["']([^"']*icon[^"']*)["'][^>]*>/gi);
  for (const match of matches) {
    const href = match[0].match(/href\s*=\s*["']([^"']+)["']/i)?.[1];
    if (href) return decodeEntities(href);
  }
  return undefined;
}

export function absolutize(
  value: string | undefined,
  base: URL | null,
): string | undefined {
  if (!value) return undefined;
  try {
    return base ? new URL(value, base).toString() : new URL(value).toString();
  } catch {
    return undefined;
  }
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

export function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|\w+);/gi, (match, entity: string) => {
    const direct = ENTITIES[entity.toLowerCase()];
    if (direct) return direct;
    if (entity.startsWith("#x") || entity.startsWith("#X")) {
      const code = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(code) ? safeFromCodePoint(code, match) : match;
    }
    if (entity.startsWith("#")) {
      const code = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? safeFromCodePoint(code, match) : match;
    }
    return match;
  });
}

function safeFromCodePoint(code: number, fallback: string): string {
  try {
    return String.fromCodePoint(code);
  } catch {
    return fallback;
  }
}

/** "site.com/blog/meu-post-legal" → "Meu post legal" */
export function titleFromUrl(target: URL): string {
  const host = target.hostname.replace(/^www\./, "");
  const slug = target.pathname.split("/").filter(Boolean).pop();
  if (!slug) return host;
  const cleaned = decodeURIComponent(slug)
    .replace(/\.\w{2,5}$/, "")
    .replace(/[-_]+/g, " ")
    .trim();
  if (!cleaned) return host;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/**
 * Barra localhost e faixas privadas: sem isso o servidor viraria um proxy pra
 * varrer a rede interna de quem hospedar a plataforma (SSRF).
 */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "0.0.0.0"
  ) {
    return true;
  }

  // IPv6 loopback / link-local / unique-local
  if (host === "::1" || host.startsWith("fe80:") || /^f[cd][0-9a-f]{2}:/.test(host)) {
    return true;
  }

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) return false;

  const parts = ipv4.slice(1).map(Number);
  if (parts.some((part) => !Number.isFinite(part) || part > 255)) return true;

  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}
