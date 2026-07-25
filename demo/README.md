# Página autônoma

`index.html` é a plataforma inteira num arquivo só: sem build, sem servidor,
sem dependência. É um documento HTML completo — dá pra abrir com dois cliques
ou publicar em qualquer lugar que sirva arquivo estático.

## Publicando

Não há passo de build: o arquivo que está aqui é o que vai para o ar.

| Onde | Como |
| --- | --- |
| **GitHub Pages** | Copie `index.html` para a raiz do branch publicado e ligue Pages em Settings → Pages |
| **Netlify / Vercel** | Arraste a pasta `demo/` na área de deploy — ela já é o site |
| **Cloudflare Pages** | Aponte para `demo/` como diretório de saída, sem comando de build |
| **S3, nginx, Apache** | Suba o arquivo e sirva como `index.html` |
| **Sem servidor nenhum** | Abra o arquivo direto do disco: `file://` funciona, inclusive salvando |

O `<head>` já traz charset, viewport, descrição, ícone embutido como data URI,
`theme-color` para as duas preferências de tema e as tags Open Graph do
compartilhamento. Um script inline aplica o tema salvo antes da primeira
pintura, então não há lampejo claro ao abrir no escuro.

Existe para dois usos:

1. **Mostrar a plataforma sem instalar nada** — é a versão publicada, que
   qualquer pessoa abre e usa na hora.
2. **Ser um plano B** — se um dia você não quiser manter o app Next.js rodando,
   este arquivo continua abrindo o seu acervo. O JSON exportado pela versão
   completa importa aqui, e vice-versa: o formato é o mesmo.

## O que muda em relação ao app completo

Sem servidor, duas coisas ficam de fora:

- **Metadados de link.** O navegador não consegue ler o HTML de outro domínio
  (CORS), então o título vem do próprio endereço e não há capa vinda do site.
  O card já nasce editável.
- **Sincronização entre dispositivos**, que depende de conta e banco.

Todo o resto é igual: captura de links, notas e imagens, boards, tags
automáticas, busca ⌘K, anotações, referências relacionadas, três visões,
atalhos de teclado, tema claro/escuro e backup em JSON.

## Como está construído

Vanilla JS, sem framework. Os mesmos tokens de cor do app (`src/app/globals.css`)
e a mesma lógica de produto — busca fuzzy, auto-tagging, pontuação de
relacionadas — reescritos sem React para caber num arquivo.

Os "estudos de cor" que aparecem no acervo de exemplo são desenhados no canvas
quando a página abre pela primeira vez: como capas remotas não carregam, é assim
que o mural mostra cards de imagem de verdade.

Nada externo é carregado — nenhuma fonte, script ou imagem de outro domínio.
Isso mantém a página funcionando offline e sobrevivendo a qualquer política de
segurança de conteúdo restritiva.
