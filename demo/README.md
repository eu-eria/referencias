# Página autônoma

`index.html` é a plataforma inteira num arquivo só: sem build, sem servidor,
sem dependência. Abrir o arquivo no navegador já funciona, e ele pode ser
hospedado em qualquer lugar que sirva um HTML estático (GitHub Pages, Netlify
Drop, um bucket S3, um pendrive).

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
