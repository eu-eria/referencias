import type { Board, Item } from "./types";
import { faviconFor, hostOf } from "./utils";

/**
 * Acervo inicial: boards de exemplo e um punhado de referências reais, pra
 * primeira abertura já mostrar como as coisas se organizam. Tudo pode ser
 * apagado em Ajustes → Limpar acervo.
 *
 * Sem capas remotas de propósito: os cards usam o degradê gerado a partir do
 * domínio, então o mural fica bonito mesmo offline.
 */

interface SeedLink {
  title: string;
  url: string;
  description: string;
  siteName: string;
  tags: string[];
  board: string;
}

const BOARD_SEED: Omit<Board, "id" | "createdAt" | "updatedAt">[] = [
  {
    name: "Interfaces que amo",
    emoji: "🎨",
    color: "#d97757",
    description: "Telas, microinterações e detalhes de produto que valem copiar.",
    position: 0,
  },
  {
    name: "Landing pages",
    emoji: "🚀",
    color: "#4a86c5",
    description: "Estruturas de página, headlines e provas sociais que convertem.",
    position: 1,
  },
  {
    name: "Tipografia & cor",
    emoji: "🔤",
    color: "#c9a227",
    description: "Fontes, paletas e combinações pra ter sempre à mão.",
    position: 2,
  },
  {
    name: "Ideias soltas",
    emoji: "💡",
    color: "#5b9279",
    description: "Pensamentos crus. Depois viram projeto — ou não.",
    position: 3,
  },
];

const LINK_SEED: SeedLink[] = [
  {
    title: "Mobbin — padrões de UI de apps reais",
    url: "https://mobbin.com/",
    description:
      "Biblioteca de fluxos completos de apps iOS e Android. Ótimo pra ver como produtos maduros resolvem onboarding, paywall e busca.",
    siteName: "Mobbin",
    tags: ["ui", "mobile", "inspiracao"],
    board: "Interfaces que amo",
  },
  {
    title: "Refactoring UI — dicas de design para quem programa",
    url: "https://www.refactoringui.com/",
    description:
      "Regras práticas de hierarquia, espaçamento e cor. A referência mais objetiva pra tirar uma tela do 'quase bom'.",
    siteName: "Refactoring UI",
    tags: ["ui", "design-system", "tutorial"],
    board: "Interfaces que amo",
  },
  {
    title: "Godly — o melhor do design web",
    url: "https://godly.website/",
    description: "Curadoria diária de sites com direção de arte forte.",
    siteName: "Godly",
    tags: ["web", "inspiracao"],
    board: "Interfaces que amo",
  },
  {
    title: "Land-book — galeria de landing pages",
    url: "https://land-book.com/",
    description:
      "Filtra por indústria e estilo. Bom pra montar o esqueleto de uma página antes de desenhar qualquer coisa.",
    siteName: "Land-book",
    tags: ["landing-page", "web", "inspiracao"],
    board: "Landing pages",
  },
  {
    title: "Really Good Emails",
    url: "https://reallygoodemails.com/",
    description: "Milhares de e-mails reais, com código. Ótimo pra copy e estrutura.",
    siteName: "Really Good Emails",
    tags: ["email", "copy", "marketing"],
    board: "Landing pages",
  },
  {
    title: "Marketing Examples — estudos de copy que funcionou",
    url: "https://marketingexamples.com/",
    description:
      "Casos curtos e diretos de headline, landing page e SEO. Leitura de 3 minutos por caso.",
    siteName: "Marketing Examples",
    tags: ["copy", "marketing", "case"],
    board: "Landing pages",
  },
  {
    title: "Fontshare — fontes gratuitas para uso comercial",
    url: "https://www.fontshare.com/",
    description: "Famílias completas, bem desenhadas e liberadas pra produto.",
    siteName: "Fontshare",
    tags: ["tipografia", "recurso"],
    board: "Tipografia & cor",
  },
  {
    title: "Fonts in Use — tipografia aplicada de verdade",
    url: "https://fontsinuse.com/",
    description: "Arquivo de tipografia no mundo real, catalogado por formato e indústria.",
    siteName: "Fonts in Use",
    tags: ["tipografia", "inspiracao"],
    board: "Tipografia & cor",
  },
  {
    title: "Happy Hues — paletas em contexto",
    url: "https://www.happyhues.co/",
    description:
      "Mostra a paleta aplicada numa página inteira, então dá pra julgar antes de usar.",
    siteName: "Happy Hues",
    tags: ["cor", "recurso"],
    board: "Tipografia & cor",
  },
  {
    title: "Laws of UX",
    url: "https://lawsofux.com/",
    description:
      "Princípios de psicologia aplicados a interface, cada um com exemplo e leitura extra.",
    siteName: "Laws of UX",
    tags: ["ux", "tutorial"],
    board: "Interfaces que amo",
  },
];

const NOTE_SEED: { title: string; body: string; tags: string[]; board: string }[] = [
  {
    title: "Como eu quero usar esse espaço",
    body: `Regra: capturar em 3 segundos, achar em 3 segundos.

• Cola a URL na barra de cima e dá Enter — o resto (título, capa, tags) vem sozinho.
• Arrasta um print de qualquer lugar pra dentro da janela e ele vira card.
• Cmd/Ctrl + K abre a busca de tudo: referência, board ou tag.
• Board é assunto amplo. Tag é o detalhe. Uma referência pode estar em vários boards.`,
    tags: ["meta"],
    board: "Ideias soltas",
  },
  {
    title: "Ideia: página de planos com comparação honesta",
    body: `Em vez da tabela de 3 colunas de sempre, começar perguntando "quantas pessoas usam?" e mostrar só o plano que faz sentido.

Referência mental: calculadoras de preço de infra. Menos escolha, mais resposta.`,
    tags: ["pricing", "produto"],
    board: "Ideias soltas",
  },
];

export function buildSeed(): { boards: Board[]; items: Item[] } {
  const now = Date.now();
  const hour = 3_600_000;

  const boards: Board[] = BOARD_SEED.map((board, index) => ({
    ...board,
    id: `seed-board-${index + 1}`,
    createdAt: now - (BOARD_SEED.length - index) * hour,
    updatedAt: now - (BOARD_SEED.length - index) * hour,
  }));

  const boardIdByName = new Map(boards.map((board) => [board.name, board.id]));
  const items: Item[] = [];

  LINK_SEED.forEach((link, index) => {
    const createdAt = now - (index + 1) * hour * 5;
    const boardId = boardIdByName.get(link.board);
    items.push({
      id: `seed-item-${index + 1}`,
      kind: "link",
      title: link.title,
      url: link.url,
      description: link.description,
      siteName: link.siteName || hostOf(link.url),
      faviconUrl: faviconFor(link.url),
      boardIds: boardId ? [boardId] : [],
      tags: link.tags,
      favorite: index < 2,
      createdAt,
      updatedAt: createdAt,
    });
  });

  NOTE_SEED.forEach((note, index) => {
    const createdAt = now - (index + 1) * hour * 2;
    const boardId = boardIdByName.get(note.board);
    items.push({
      id: `seed-note-${index + 1}`,
      kind: "note",
      title: note.title,
      description: note.body,
      boardIds: boardId ? [boardId] : [],
      tags: note.tags,
      favorite: index === 0,
      createdAt,
      updatedAt: createdAt,
    });
  });

  return { boards, items };
}
