# Referências

Seu espaço pessoal de referências: capture links, imagens e ideias em segundos e
encontre a referência certa na hora em que você está criando alguma coisa.

Inspirado no [Eden](https://eden.so/) — boards como unidade central, captura de
um clique, busca instantânea. Funciona sozinho no navegador, sem conta nem
configuração; ligando uma variável de ambiente, sincroniza entre computador e
celular.

> A regra que guiou cada decisão de produto aqui: **capturar em 3 segundos,
> achar em 3 segundos.** Se algo levava mais que isso, virou atalho.

**Quer só olhar?** → **https://produtosauvp.github.io/teste_ref/**

É a plataforma inteira num arquivo (`index.html`, na raiz), publicada no GitHub
Pages. Sem build, sem servidor: abre e funciona. Veja
[docs/pagina-publicada.md](docs/pagina-publicada.md) para como ela é publicada e
o que muda em relação à versão completa.

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

O acervo vive no **IndexedDB do seu navegador** — inclusive as imagens que você
envia. É de lá que a tela lê, sempre: nada na interface espera a rede, e o app
funciona igual offline.

Sem sincronização, esse é o único lugar onde os dados existem. Duas
consequências práticas:

1. **Limpar os dados do navegador apaga o acervo.** Exporte de vez em quando em
   **Ajustes → Exportar tudo**: sai um único `.json` com boards, referências e
   imagens embutidas.
2. **O import soma ao que já existe** e usa o mesmo id, então reimportar o
   mesmo arquivo não duplica nada.

A rota `/api/metadata` é o que busca o `<head>` do link colado pra montar o
card. Ela roda no servidor porque o navegador não consegue ler HTML de outro
domínio (CORS), lê no máximo 512 KB, desiste em 8 segundos e recusa endereços
de rede interna (proteção contra SSRF). Nada é armazenado nela.

---

## Sincronizar entre dispositivos

Opcional e desligada por padrão. Para ligar, aponte o app para um banco:

```bash
# Postgres gerenciado (Supabase, Neon, Railway, RDS…)
DATABASE_URL=postgres://usuario:senha@host:5432/banco

# ou SQLite em arquivo, se você mesmo hospeda
DATABASE_URL=file:./data/referencias.db
```

As tabelas são criadas sozinhas na primeira execução — não há passo de
migração. Feito isso, aparece **Entrar e sincronizar** no rodapé da barra
lateral: crie uma conta com e-mail e senha e use a mesma em cada dispositivo.

**Como funciona.** O IndexedDB continua sendo a fonte de render; por cima dele
roda um push/pull incremental. Cada alteração local entra numa fila; o servidor
grava o lote, carimba uma **revisão** e devolve, na mesma transação, tudo que
mudou acima da última revisão que aquele dispositivo viu. Push e pull juntos
fecham a janela em que outro aparelho escreve entre uma coisa e outra e a
alteração dele fica para trás do cursor.

O que isso te dá no uso:

- **Offline é normal, não é erro.** Sem rede o app funciona igual; a fila espera
  e sobe sozinha quando a conexão volta. O rodapé mostra quantas alterações
  estão esperando.
- **Conflito resolve pela alteração mais recente.** Se dois dispositivos editam
  a mesma referência, vale a última — e o que perdeu recebe a versão vencedora
  no mesmo ciclo, em vez de ficar com a cópia velha.
- **Exclusão propaga**, via lápide. Mas se você editou a referência depois de
  tê-la apagado noutro lugar, a edição ganha e ela volta.
- **Imagens sincronizam** como arquivo, não como link: sobem uma vez e cada
  dispositivo baixa a sua cópia local.
- **Entrar não apaga nada.** O que já estava no navegador sobe pra conta; ids
  iguais não duplicam. Sair também não apaga — o acervo local continua ali.
- **Com a sincronização ligada, "Limpar acervo" apaga em todos os dispositivos.**

Cada conta enxerga só os próprios dados, inclusive as imagens. As senhas são
guardadas com scrypt e salt por usuário, e a sessão é um cookie httpOnly de
90 dias.

O backup em JSON continua valendo, com ou sem sincronização — é a cópia que não
depende de nenhum serviço.

---

## Como o código está organizado

```
src/
├─ app/
│  ├─ layout.tsx              tema aplicado antes da primeira pintura
│  ├─ page.tsx
│  └─ api/
│     ├─ metadata/route.ts    busca o HTML e devolve os metadados do link
│     ├─ auth/…               register, login, logout, me
│     ├─ sync/route.ts        push + pull na mesma transação
│     └─ assets/…             upload e download das imagens
├─ lib/
│  ├─ types.ts                Item, Board, Settings
│  ├─ idb.ts                  wrapper do IndexedDB + filas de sync
│  ├─ store.ts                estado reativo + persistência + backup
│  ├─ sync.ts                 motor de sincronização do cliente
│  ├─ syncTypes.ts            contrato compartilhado cliente ↔ servidor
│  ├─ capture.ts              link / imagem / nota → referência salva
│  ├─ og.ts                   parser de Open Graph (puro, testado)
│  ├─ autotag.ts              sugestão de tags por domínio e palavra-chave
│  ├─ search.ts               busca fuzzy com pesos por campo
│  ├─ view.ts                 recorte, ordenação e "relacionadas"
│  ├─ hooks.ts / utils.ts
│  └─ server/
│     ├─ db.ts                adapter Postgres/SQLite + schema
│     ├─ auth.ts              scrypt, sessões, freio de força bruta
│     └─ respond.ts           503 "não configurado" vs 500 "falhou"
└─ components/                AppShell, Sidebar, CaptureBar, ItemGrid, …
```

O estado global é um *external store* pequeno (`lib/store.ts`) consumido via
`useSyncExternalStore` — sem Redux, sem Zustand, sem Context aninhado. Toda
escrita atualiza o estado na hora e persiste no IndexedDB em seguida, então a
interface nunca espera o disco. O motor de sync assina esse mesmo store: é
assim que ele sabe que algo mudou.

`lib/server/db.ts` fala uma linguagem só (placeholders `$1, $2…`) e traduz para
o SQLite quando é o caso, então o resto do servidor não sabe em qual banco está
rodando.

**Stack:** Next.js 16 (App Router), React 19, TypeScript e Tailwind CSS v4. A
única dependência de runtime é o driver `pg`, carregado sob demanda e apenas
quando a `DATABASE_URL` aponta para um Postgres.

---

## Publicando

Sobe em qualquer lugar que rode Node — Vercel, Railway, Render, um container
próprio:

```bash
npm run build && npm start
```

Sem `DATABASE_URL`, cada navegador tem o seu acervo e o export/import é a ponte
entre eles. Com `DATABASE_URL`, é só entrar na mesma conta em cada dispositivo.

Em plataformas serverless, use a URL do *pooler* do seu Postgres: cada instância
do app abre até 8 conexões, e num ambiente que escala sozinho isso passa rápido
do limite de conexões diretas.
