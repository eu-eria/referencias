import { deaccent, hostOf, slugifyTag } from "./utils";

/**
 * Sugestão de tags no momento do salvamento — sem IA, sem rede: um mapa de
 * domínios conhecidos + palavras-chave no título/descrição. A ideia é que a
 * referência já nasça encontrável mesmo se você não parar pra taguear.
 */

const DOMAIN_TAGS: Record<string, string[]> = {
  "dribbble.com": ["ui", "inspiracao"],
  "behance.net": ["design", "portfolio"],
  "figma.com": ["figma", "ui"],
  "awwwards.com": ["web", "inspiracao"],
  "godly.website": ["web", "inspiracao"],
  "land-book.com": ["landing-page", "web"],
  "mobbin.com": ["mobile", "ui"],
  "pinterest.com": ["inspiracao"],
  "unsplash.com": ["foto"],
  "pexels.com": ["foto"],
  "youtube.com": ["video"],
  "youtu.be": ["video"],
  "vimeo.com": ["video"],
  "github.com": ["codigo", "open-source"],
  "gitlab.com": ["codigo"],
  "stackoverflow.com": ["codigo"],
  "codepen.io": ["codigo", "front-end"],
  "npmjs.com": ["codigo", "biblioteca"],
  "medium.com": ["artigo"],
  "substack.com": ["newsletter"],
  "notion.so": ["doc"],
  "notion.site": ["doc"],
  "linkedin.com": ["social"],
  "x.com": ["social"],
  "twitter.com": ["social"],
  "instagram.com": ["social"],
  "threads.net": ["social"],
  "tiktok.com": ["social", "video"],
  "reddit.com": ["comunidade"],
  "producthunt.com": ["produto"],
  "webflow.com": ["web", "no-code"],
  "framer.com": ["web", "no-code"],
  "fonts.google.com": ["tipografia"],
  "fontshare.com": ["tipografia"],
  "coolors.co": ["cor"],
  "lottiefiles.com": ["animacao"],
  "spotify.com": ["audio"],
  "arxiv.org": ["pesquisa"],
};

const KEYWORD_TAGS: [pattern: RegExp, tag: string][] = [
  [/\b(landing\s?page|lp)\b/, "landing-page"],
  [/\bdesign\s?system\b/, "design-system"],
  [/\bdashboard|painel\b/, "dashboard"],
  [/\bonboarding\b/, "onboarding"],
  [/\bcheckout|carrinho\b/, "checkout"],
  [/\bpricing|preco|planos\b/, "pricing"],
  [/\bemail|newsletter\b/, "email"],
  [/\bcopy(writing)?|headline\b/, "copy"],
  [/\bbrand(ing)?|marca\b/, "branding"],
  [/\blogo\b/, "logo"],
  [/\btipografia|typography|font(e|s)?\b/, "tipografia"],
  [/\bpalet(a|te)|cores?\b/, "cor"],
  [/\bilustra(cao|tion)\b/, "ilustracao"],
  [/\banima(cao|tion)|motion\b/, "animacao"],
  [/\b3d|blender\b/, "3d"],
  [/\bicone?s?|icon(s|set)?\b/, "icone"],
  [/\bmobile|app|ios|android\b/, "mobile"],
  [/\bux\b/, "ux"],
  [/\bui\b/, "ui"],
  [/\bacessibilidade|accessibility|a11y\b/, "acessibilidade"],
  [/\btutorial|como fazer|how to\b/, "tutorial"],
  [/\bcase study|estudo de caso\b/, "case"],
  [/\bportfolio\b/, "portfolio"],
  [/\bia\b|\bai\b|\bintelig(e|ê)ncia artificial\b/, "ia"],
  [/\bprompt\b/, "prompt"],
  [/\bsaas\b/, "saas"],
  [/\bfintech|investimento|financ(as|eiro)\b/, "financas"],
  [/\bmarketing|growth|funil\b/, "marketing"],
  [/\bvideo|reels?|short(s)?\b/, "video"],
  [/\bpodcast\b/, "podcast"],
  [/\bapresenta(cao|tion)|slide(s)?|deck\b/, "apresentacao"],
];

export interface AutoTagInput {
  url?: string;
  title?: string;
  description?: string;
  siteName?: string;
}

export function suggestTags(input: AutoTagInput, limit = 5): string[] {
  const tags = new Set<string>();

  const host = hostOf(input.url);
  if (host) {
    for (const [domain, domainTags] of Object.entries(DOMAIN_TAGS)) {
      if (host === domain || host.endsWith(`.${domain}`)) {
        domainTags.forEach((tag) => tags.add(tag));
      }
    }
  }

  const haystack = deaccent(
    [input.title, input.description, input.siteName].filter(Boolean).join(" "),
  );
  for (const [pattern, tag] of KEYWORD_TAGS) {
    if (tags.size >= limit) break;
    if (pattern.test(haystack)) tags.add(tag);
  }

  // Sem nenhum sinal, o próprio domínio já é um agrupador útil.
  if (tags.size === 0 && host) {
    const root = host.split(".").slice(-2)[0];
    if (root) tags.add(slugifyTag(root));
  }

  return Array.from(tags).slice(0, limit);
}
