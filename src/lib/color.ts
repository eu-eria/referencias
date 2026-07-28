/**
 * Leitura e nomeação de cores — sem DOM, sem rede, testável sozinho:
 * `npm test`.
 *
 * É o que permite colar um punhado de hexadecimais na barra de captura e
 * receber uma paleta de volta, em vez de uma nota com texto solto.
 */

const HEX_TOKEN = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** "#ABC" ou "d97757" → "#aabbcc" / "#d97757". Null se não for cor. */
export function normalizeHex(raw: string): string | null {
  const match = String(raw).trim().match(HEX_TOKEN);
  if (!match) return null;
  const hex = match[1].toLowerCase();
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  return `#${full}`;
}

/** Limite de cores por paleta — acima disso vira lista, não paleta. */
export const MAX_PALETTE_COLORS = 24;

/**
 * Reconhece um texto que é *só* cores: "#d97757 #c9a227", uma por linha,
 * separadas por vírgula, com ou sem "#". Devolve null se qualquer pedaço não
 * for cor — assim uma nota comum nunca vira paleta por engano.
 */
export function parsePalette(text: string): string[] | null {
  const tokens = String(text).split(/[\s,;|]+/).filter(Boolean);
  if (tokens.length === 0 || tokens.length > MAX_PALETTE_COLORS) return null;

  const colors: string[] = [];
  for (const token of tokens) {
    const hex = normalizeHex(token);
    if (!hex) return null;
    if (!colors.includes(hex)) colors.push(hex);
  }

  // Uma cor só, em três dígitos, é ambígua demais: "#abc" parece uma tag.
  if (colors.length === 1 && !/^[0-9a-f]{6}$/i.test(tokens[0].replace(/^#/, ""))) {
    return null;
  }

  return colors;
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function hexToRgb(hex: string): Rgb {
  const value = normalizeHex(hex) ?? "#000000";
  return {
    r: Number.parseInt(value.slice(1, 3), 16),
    g: Number.parseInt(value.slice(3, 5), 16),
    b: Number.parseInt(value.slice(5, 7), 16),
  };
}

export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const { r, g, b } = hexToRgb(hex);
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;

  if (max === min) return { h: 0, s: 0, l };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === rn
      ? ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6
      : max === gn
        ? ((bn - rn) / d + 2) / 6
        : ((rn - gn) / d + 4) / 6;

  return { h: h * 360, s, l };
}

const HUE_NAMES: [limit: number, name: string][] = [
  // 12° e não 15°: terracota (#d97757) cai em 14,8° e lê como laranja,
  // não como vermelho. O vermelho de verdade vive perto de 355°.
  [12, "vermelho"],
  [45, "laranja"],
  [70, "amarelo"],
  [160, "verde"],
  [200, "turquesa"],
  [250, "azul"],
  [290, "violeta"],
  [335, "rosa"],
  [361, "vermelho"],
];

/** Nome em português da cor — é por ele que a busca também encontra a paleta. */
export function colorName(hex: string): string {
  const { h, s, l } = hexToHsl(hex);
  if (l < 0.08) return "preto";
  if (l > 0.94 && s < 0.1) return "branco";
  if (s < 0.12) return "cinza";

  const base = HUE_NAMES.find(([limit]) => h < limit)![1];
  if (l < 0.28) return `${base} escuro`;
  if (l > 0.75) return `${base} claro`;
  return base;
}

/** Preto ou branco sobre o swatch — o que tiver mais contraste (WCAG). */
export function readableOn(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  const channel = (value: number) => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  return luminance > 0.42 ? "#101014" : "#ffffff";
}

export function paletteTitle(colors: string[]): string {
  const name = colorName(colors[0]);
  return colors.length === 1 ? `Cor ${name}` : `Paleta ${name} · ${colors.length} cores`;
}

/**
 * "www.refactoringui.com" → "refactoringui": o nome que identifica o site na
 * capa gerada, sem o "www" nem o sufixo de domínio.
 */
export function siteWord(host: string): string {
  const parts = host.split(".").filter(Boolean);
  const generic = new Set([
    "com", "co", "net", "org", "gov", "edu", "io", "app", "dev", "br", "website", "www",
  ]);
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    if (!generic.has(parts[i])) return parts[i];
  }
  return parts[0] ?? host;
}
