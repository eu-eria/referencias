import assert from "node:assert/strict";
import { test } from "node:test";
import { colorName, normalizeHex, parsePalette, readableOn, siteWord } from "./color.ts";

test("normaliza hexadecimais em qualquer forma", () => {
  assert.equal(normalizeHex("#D97757"), "#d97757");
  assert.equal(normalizeHex("d97757"), "#d97757");
  assert.equal(normalizeHex("  #abc  "), "#aabbcc");
  assert.equal(normalizeHex("#gg1122"), null);
  assert.equal(normalizeHex("#12345"), null);
  assert.equal(normalizeHex(""), null);
});

test("lê paletas separadas por espaço, vírgula e quebra de linha", () => {
  assert.deepEqual(parsePalette("#d97757 #c9a227"), ["#d97757", "#c9a227"]);
  assert.deepEqual(parsePalette("#111, #222, #333"), ["#111111", "#222222", "#333333"]);
  assert.deepEqual(parsePalette("d97757\nc9a227"), ["#d97757", "#c9a227"]);
  assert.deepEqual(parsePalette("#AAA;#BBB|#CCC"), ["#aaaaaa", "#bbbbbb", "#cccccc"]);
});

test("descarta cores repetidas mantendo a ordem", () => {
  assert.deepEqual(parsePalette("#d97757 #c9a227 #d97757"), ["#d97757", "#c9a227"]);
});

test("uma cor sozinha só vale em forma completa", () => {
  assert.deepEqual(parsePalette("#d97757"), ["#d97757"]);
  // "#abc" sozinho parece uma tag, não uma cor
  assert.equal(parsePalette("#abc"), null);
});

test("texto que não é só cor nunca vira paleta", () => {
  assert.equal(parsePalette("isso é uma nota #cor"), null);
  assert.equal(parsePalette("https://exemplo.com"), null);
  assert.equal(parsePalette("#d97757 e mais um pouco"), null);
  assert.equal(parsePalette(""), null);
  assert.equal(parsePalette("   "), null);
});

test("recusa listas longas demais para ser paleta", () => {
  const muitas = Array.from({ length: 25 }, (_, i) =>
    "#" + i.toString(16).padStart(6, "0")).join(" ");
  assert.equal(parsePalette(muitas), null);
});

test("nomeia a cor em português", () => {
  assert.equal(colorName("#d97757"), "laranja");
  assert.equal(colorName("#1d3557"), "azul escuro");
  assert.equal(colorName("#a8dadc"), "turquesa claro");
  assert.equal(colorName("#000000"), "preto");
  assert.equal(colorName("#ffffff"), "branco");
  assert.equal(colorName("#808080"), "cinza");
  assert.equal(colorName("#e63946"), "vermelho");
});

test("escolhe texto legível sobre o swatch", () => {
  assert.equal(readableOn("#ffffff"), "#101014");
  assert.equal(readableOn("#f1faee"), "#101014");
  assert.equal(readableOn("#000000"), "#ffffff");
  assert.equal(readableOn("#1d3557"), "#ffffff");
});

test("extrai o nome do site do domínio", () => {
  assert.equal(siteWord("www.refactoringui.com"), "refactoringui");
  assert.equal(siteWord("mobbin.com"), "mobbin");
  assert.equal(siteWord("godly.website"), "godly");
  assert.equal(siteWord("blog.exemplo.com.br"), "exemplo");
  assert.equal(siteWord("land-book.com"), "land-book");
});
