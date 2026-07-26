# Página autônoma — o que vai para o GitHub Pages

`index.html` é a plataforma inteira num arquivo: sem build, sem servidor, sem
dependência. É um documento HTML completo, então dá pra abrir com dois cliques
ou servir como site estático.

O workflow [`.github/workflows/pages.yml`](../.github/workflows/pages.yml)
publica esta pasta no GitHub Pages a cada push na branch padrão.

**No ar em:** https://produtosauvp.github.io/teste_ref/

## Ligando o Pages (uma vez só)

O GitHub não habilita Pages sozinho. Uma vez feito isso, nunca mais precisa
mexer:

1. No repositório, vá em **Settings → Pages**.
2. Em **Source**, escolha **GitHub Actions** (não "Deploy from a branch").
3. Pronto. O próximo push na branch padrão publica; ou rode o workflow à mão em
   **Actions → Publicar no GitHub Pages → Run workflow**.

Só a branch padrão vai ao ar. O workflow roda em qualquer branch para validar a
página, mas o passo de publicação é guardado por
`github.ref_name == github.event.repository.default_branch` — assim o nome da
branch padrão pode mudar sem precisar editar o arquivo.

## O que o workflow faz

Não há compilação: o arquivo do repositório é literalmente o que vai ao ar. O
workflow só monta a pasta e confere:

- copia `index.html` e `social-card.png`;
- copia `index.html` também como `404.html` — a plataforma é uma página só, então
  qualquer caminho errado cai no app em vez do 404 do GitHub;
- cria `.nojekyll`, senão o Jekyll ignoraria arquivos que começam com `_` ou `.`;
- confere que o documento está inteiro (doctype, charset, viewport, o app);
- **falha se a página passar a carregar qualquer coisa de outro domínio.** É a
  garantia de que ela continua funcionando offline e sob política de segurança
  restritiva. URL absoluta em `canonical` e nas tags `og:` passa: é metadado,
  não recurso buscado.

## Trocando de domínio

Três linhas no `<head>` de `index.html` são absolutas porque os robôs de
compartilhamento não resolvem caminho relativo: `canonical`, `og:url` e
`og:image`. Ao publicar em outro endereço, ajuste as três — o resto da página
não conhece o próprio domínio.

## Hospedando em outro lugar

Sem Pages, o arquivo continua sendo só um arquivo:

| Onde | Como |
| --- | --- |
| **Netlify / Vercel** | Arraste a pasta `demo/` na área de deploy — ela já é o site |
| **Cloudflare Pages** | Aponte para `demo/`, sem comando de build |
| **S3, nginx, Apache** | Suba e sirva como `index.html` |
| **Sem servidor nenhum** | Abra direto do disco: `file://` funciona, inclusive salvando |

## O que muda em relação ao app completo

Sem servidor, duas coisas ficam de fora — e a própria página explica isso em
"Como esta página funciona", no rodapé da barra lateral:

- **Metadados de link.** O navegador não consegue ler o HTML de outro domínio
  (CORS), então o título vem do próprio endereço e não há capa vinda do site.
  O card já nasce editável.
- **Sincronização entre dispositivos**, que depende de conta e banco.

Todo o resto é igual: captura de links, notas e imagens, boards, tags
automáticas, busca ⌘K, anotações, referências relacionadas, três visões,
atalhos de teclado, tema claro/escuro e backup em JSON. O formato do backup é o
mesmo do app completo, então um export daqui importa lá e vice-versa.

## Como está construído

Vanilla JS, sem framework. Os mesmos tokens de cor do app
(`src/app/globals.css`) e a mesma lógica de produto — busca fuzzy,
auto-tagging, pontuação de relacionadas — reescritos sem React para caber num
arquivo.

Os "estudos de cor" do acervo de exemplo são desenhados no canvas quando a
página abre pela primeira vez: como capas remotas não carregam, é assim que o
mural mostra cards de imagem de verdade.

Nada externo é carregado — nenhuma fonte, script ou imagem de outro domínio. O
ícone da aba é um SVG embutido como data URI. `social-card.png` é o único
arquivo além do HTML, e serve só para o preview do link nas redes.
