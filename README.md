# Referências

Seu espaço pessoal de referências: capture links, imagens e ideias em segundos e
encontre a referência certa na hora em que você está criando alguma coisa.

Inspirado no [Eden](https://eden.so/) — boards como unidade central, captura de
um clique, busca instantânea — mas rodando inteiro no seu navegador, sem conta,
sem servidor e sem mensalidade.

> A regra que guiou cada decisão de produto aqui: **capturar em 3 segundos,
> achar em 3 segundos.** Se algo levava mais que isso, virou atalho.

---

## O que dá pra fazer

**Capturar**

- Cole uma URL na barra do topo e dê Enter — título, resumo, capa (og:image),
  favicon e as primeiras tags vêm sozinhos.
- Cole várias URLs de uma vez (uma por linha): todas entram em paralelo.
- Escreva qualquer texto que não seja link e ele vira uma **nota**. A primeira
  linha vira o título, o resto vira o corpo.
- Arraste imagens e prints pra qualquer lugar da janela, ou cole com `Ctrl/⌘ V`
  direto na página. As imagens são comprimidas para WebP antes de guardar.
- `Ctrl/⌘ V` com um link na área de transferência salva sem nem clicar no campo.

**Organizar**

- **Boards** agrupam por assunto (com emoji, cor e descrição). Uma referência
  pode estar em vários boards ao mesmo tempo.
- **Tags** são o detalhe fino. Sugeridas automaticamente a partir do domínio e
  de palavras-chave do título — `figma.com` já nasce com `figma` e `ui`,
  "landing page" já nasce com `landing-page`.
- **Anotações** próprias em cada referência, separadas do resumo que veio do
  site: por que isso importa, o que você quer reaproveitar.
- Favoritos, "Sem board" (o que ainda não foi organizado) e "Vistos
  recentemente".

**Encontrar**

- `⌘K` / `Ctrl K` abre a busca de tudo: referências, boards, tags e ações, com
  busca fuzzy — "dsn sys" acha "Design System". Sem digitar nada, ela mostra o
  que você abriu por último.
- Filtro dentro do recorte atual, por tipo (links / imagens / notas) e por
  ordenação.
- Três leituras do acervo: **mural** (colunas com alturas naturais, pra passar
  o olho), **grade** (cards uniformes, pra comparar) e **lista** (densa, pra
  quando você já sabe o que procura).
- **Relacionadas**: ao abrir uma referência, o painel sugere outras por tags,
  board e domínio em comum. É o que transforma o acervo num fio a puxar.

---

## Atalhos

| Tecla | O que faz |
| --- | --- |
| `⌘K` / `Ctrl K` | Busca rápida de tudo |
| `A` | Focar a barra de captura |
| `/` | Focar o filtro da lista atual |
| `B` | Criar um board |
| `T` | Alternar tema claro/escuro |
| `?` | Quadro de atalhos |
| `← ↑ ↓ →` | Mover o foco entre os cards |
| `J` / `K` | Próxima / anterior (também dentro do painel de detalhe) |
| `Enter` | Abrir o painel de detalhe |
| `O` | Abrir o link original em nova aba |
| `F` | Favoritar |
| `Delete` | Excluir (com desfazer) |
| `Esc` | Fechar o que estiver aberto |

---

## Rodando

```bash
npm install
npm run dev      # http://localhost:3000
```

Outros comandos:

```bash
npm run build      # build de produção
npm start          # sobe o build
npm test           # testes do parser de metadados
npm run typecheck  # tsc --noEmit
```

Na primeira abertura o acervo vem com alguns boards e referências de exemplo,
pra plataforma não abrir vazia. Dá pra apagar tudo em **Ajustes → Limpar
acervo**.

---

## Onde ficam os dados

Tudo no **IndexedDB do seu navegador** — inclusive as imagens que você envia.
Nada é enviado pra lugar nenhum, não existe conta nem sincronização.

As duas consequências práticas:

1. **Limpar os dados do navegador apaga o acervo.** Exporte de vez em quando em
   **Ajustes → Exportar tudo**: sai um único `.json` com boards, referências e
   imagens embutidas.
2. **O import soma ao que já existe** e usa o mesmo id, então reimportar o
   mesmo arquivo não duplica nada — dá pra usar o backup pra levar o acervo pra
   outro navegador ou outra máquina.

A única chamada de rede que a aplicação faz é para a própria rota
`/api/metadata`, que busca o `<head>` do link que você colou pra montar o card.
Ela roda no servidor porque o navegador não consegue ler HTML de outro domínio
(CORS), lê no máximo 512 KB, desiste em 8 segundos e recusa endereços de rede
interna (proteção contra SSRF). Nada é armazenado nela.

---

## Como o código está organizado

```
src/
├─ app/
│  ├─ layout.tsx              tema aplicado antes da primeira pintura
│  ├─ page.tsx
│  └─ api/metadata/route.ts   busca o HTML e devolve os metadados do link
├─ lib/
│  ├─ types.ts                Item, Board, Settings
│  ├─ idb.ts                  wrapper fino sobre o IndexedDB
│  ├─ store.ts                estado reativo + persistência + backup
│  ├─ capture.ts              link / imagem / nota → referência salva
│  ├─ og.ts                   parser de Open Graph (puro, testado)
│  ├─ autotag.ts              sugestão de tags por domínio e palavra-chave
│  ├─ search.ts               busca fuzzy com pesos por campo
│  ├─ view.ts                 recorte, ordenação e "relacionadas"
│  ├─ hooks.ts
│  └─ utils.ts
└─ components/                AppShell, Sidebar, CaptureBar, ItemGrid, …
```

O estado global é um *external store* pequeno (`lib/store.ts`) consumido via
`useSyncExternalStore` — sem Redux, sem Zustand, sem Context aninhado. Toda
escrita atualiza o estado na hora e persiste no IndexedDB em seguida, então a
interface nunca espera o disco.

**Stack:** Next.js 16 (App Router), React 19, TypeScript e Tailwind CSS v4.
Fora isso, nenhuma dependência de runtime.

---

## Publicando

Como não existe banco nem variável de ambiente, dá pra subir em qualquer lugar
que rode Node — Vercel, Railway, Render, um container próprio:

```bash
npm run build && npm start
```

Cada navegador tem o seu próprio acervo. Se você usar em dois lugares, o
export/import é a ponte entre eles.
