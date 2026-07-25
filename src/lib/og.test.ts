import assert from "node:assert/strict";
import { test } from "node:test";
import { isPrivateHost, parseMetadata, titleFromUrl } from "./og.ts";

/**
 * Roda com o transpilador nativo do Node, sem framework:
 *   npm test
 */

const FULL_PAGE = `
<!doctype html>
<html>
<head>
  <title>Título da tag title</title>
  <meta property="og:title" content="Como montar um design system" />
  <meta name="og:description" content="Um guia com 12 passos &amp; muitos exemplos" />
  <meta content="/static/capa.png" property="og:image" />
  <meta property="og:site_name" content="Blog do Fulano" />
  <link rel="icon" href="/favicon.ico" />
</head>
<body>
  <meta property="og:title" content="Isto está no body e deve ser ignorado" />
</body>
</html>`;

test("lê og:title, descrição, capa e site", () => {
  const parsed = parseMetadata(FULL_PAGE, "https://blog.exemplo.com/posts/design-system");
  assert.equal(parsed.title, "Como montar um design system");
  assert.equal(parsed.description, "Um guia com 12 passos & muitos exemplos");
  assert.equal(parsed.siteName, "Blog do Fulano");
});

test("transforma caminho relativo da capa em URL absoluta", () => {
  const parsed = parseMetadata(FULL_PAGE, "https://blog.exemplo.com/posts/design-system");
  assert.equal(parsed.imageUrl, "https://blog.exemplo.com/static/capa.png");
  assert.equal(parsed.faviconUrl, "https://blog.exemplo.com/favicon.ico");
});

test("aceita content antes de property", () => {
  const html = `<head><meta content="Capa invertida" property="og:title"></head>`;
  assert.equal(parseMetadata(html, "https://x.com").title, "Capa invertida");
});

test("ignora metadados que estão fora do head", () => {
  const html = `<head><title>Certo</title></head><body><meta property="og:title" content="Errado"></body>`;
  assert.equal(parseMetadata(html, "https://x.com").title, "Certo");
});

test("cai no <title> quando não há og:title", () => {
  const html = `<head><title>  Só   o title  </title></head>`;
  assert.equal(parseMetadata(html, "https://x.com").title, "Só o title");
});

test("decodifica entidades numéricas e nomeadas", () => {
  const html = `<head><meta property="og:title" content="Caf&#233; &amp; Pão &#x2764;"></head>`;
  assert.equal(parseMetadata(html, "https://x.com").title, "Café & Pão ❤");
});

test("página sem nenhum metadado não quebra", () => {
  const parsed = parseMetadata("<html><body>oi</body></html>", "https://x.com");
  assert.equal(parsed.title, undefined);
  assert.equal(parsed.imageUrl, undefined);
});

test("twitter:image entra quando não há og:image", () => {
  const html = `<head><meta name="twitter:image" content="https://cdn.x.com/a.jpg"></head>`;
  assert.equal(parseMetadata(html, "https://x.com").imageUrl, "https://cdn.x.com/a.jpg");
});

test("título deduzido do slug da URL", () => {
  assert.equal(
    titleFromUrl(new URL("https://site.com/blog/meu-post-legal")),
    "Meu post legal",
  );
  assert.equal(titleFromUrl(new URL("https://www.site.com/")), "site.com");
  assert.equal(titleFromUrl(new URL("https://site.com/arquivo.html")), "Arquivo");
});

test("bloqueia hosts internos (SSRF)", () => {
  for (const host of [
    "localhost",
    "app.localhost",
    "meu-servico.internal",
    "127.0.0.1",
    "0.0.0.0",
    "10.1.2.3",
    "172.16.0.9",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "::1",
    "fe80::1",
    "fd00::1",
  ]) {
    assert.equal(isPrivateHost(host), true, `deveria bloquear ${host}`);
  }
});

test("libera hosts públicos", () => {
  for (const host of [
    "example.com",
    "www.figma.com",
    "8.8.8.8",
    "172.32.0.1",
    "192.169.0.1",
    "100.128.0.1",
  ]) {
    assert.equal(isPrivateHost(host), false, `não deveria bloquear ${host}`);
  }
});
