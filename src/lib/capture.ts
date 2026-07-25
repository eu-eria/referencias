"use client";

import type { Metadata } from "@/app/api/metadata/route";
import { suggestTags } from "./autotag";
import { createItem, createItems, type NewItem } from "./store";
import type { Item } from "./types";
import { compressImage, faviconFor, hostOf, normalizeUrl } from "./utils";

/**
 * Tudo que transforma "uma coisa que você colou" em referência salva.
 * A regra é uma só: nunca falhar. Se a busca de metadados não responder,
 * o item entra assim mesmo com o que dá pra deduzir da URL.
 */

async function fetchMetadata(url: string): Promise<Metadata | null> {
  try {
    const response = await fetch(`/api/metadata?url=${encodeURIComponent(url)}`);
    if (!response.ok) return null;
    return (await response.json()) as Metadata;
  } catch {
    return null;
  }
}

function fallbackTitle(url: string): string {
  const host = hostOf(url);
  try {
    const slug = new URL(url).pathname.split("/").filter(Boolean).pop();
    if (slug) {
      const cleaned = decodeURIComponent(slug)
        .replace(/\.\w{2,5}$/, "")
        .replace(/[-_]+/g, " ")
        .trim();
      if (cleaned) return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    }
  } catch {
    /* cai no host */
  }
  return host || url;
}

export async function captureLink(rawUrl: string, boardIds: string[]): Promise<Item> {
  const url = normalizeUrl(rawUrl);
  if (!url) throw new Error("Essa URL não parece válida");

  const metadata = await fetchMetadata(url);

  const title = metadata?.title?.trim() || fallbackTitle(url);
  const description = metadata?.description?.trim() || undefined;
  const siteName = metadata?.siteName || hostOf(url);

  return createItem({
    kind: "link",
    title,
    url,
    description,
    imageUrl: metadata?.imageUrl,
    siteName,
    faviconUrl: metadata?.faviconUrl ?? faviconFor(url),
    boardIds,
    tags: suggestTags({ url, title, description, siteName }),
  });
}

/** Cola com vários links de uma vez: busca os metadados em paralelo. */
export async function captureLinks(
  rawUrls: string[],
  boardIds: string[],
): Promise<Item[]> {
  const urls = rawUrls
    .map(normalizeUrl)
    .filter((url): url is string => Boolean(url))
    .filter((url, index, list) => list.indexOf(url) === index);

  if (urls.length === 0) throw new Error("Nenhuma URL válida no que você colou");
  if (urls.length === 1) return [await captureLink(urls[0], boardIds)];

  const drafts = await Promise.all(
    urls.map(async (url): Promise<NewItem> => {
      const metadata = await fetchMetadata(url);
      const title = metadata?.title?.trim() || fallbackTitle(url);
      const description = metadata?.description?.trim() || undefined;
      const siteName = metadata?.siteName || hostOf(url);
      return {
        kind: "link",
        title,
        url,
        description,
        imageUrl: metadata?.imageUrl,
        siteName,
        faviconUrl: metadata?.faviconUrl ?? faviconFor(url),
        boardIds,
        tags: suggestTags({ url, title, description, siteName }),
      };
    }),
  );

  return createItems(drafts);
}

export async function captureNote(text: string, boardIds: string[]): Promise<Item> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("A nota está vazia");

  // Primeira linha vira título; o resto, corpo. Título só ganha reticências
  // se a linha for longa demais pra caber num card.
  const [firstLine, ...rest] = trimmed.split("\n");
  const title = firstLine.length > 90 ? `${firstLine.slice(0, 88).trimEnd()}…` : firstLine;
  const body = rest.join("\n").trim() || (firstLine.length > 90 ? trimmed : undefined);

  return createItem({
    kind: "note",
    title,
    description: body,
    boardIds,
    tags: suggestTags({ title, description: body }, 3),
  });
}

const IMAGE_TYPES = /^image\/(png|jpe?g|gif|webp|avif|bmp|svg\+xml)$/i;

export function isImageFile(file: File | Blob): boolean {
  return IMAGE_TYPES.test(file.type);
}

export async function captureImages(
  files: File[],
  boardIds: string[],
): Promise<Item[]> {
  const images = files.filter(isImageFile);
  if (images.length === 0) throw new Error("Nenhuma imagem reconhecida no arquivo");

  const drafts = await Promise.all(
    images.map(async (file): Promise<NewItem> => {
      // SVG não passa pelo canvas sem perder nitidez — guardamos o original.
      const isVector = file.type === "image/svg+xml";
      const { blob, ratio } = isVector
        ? { blob: file as Blob, ratio: 1 }
        : await compressImage(file).catch(() => ({ blob: file as Blob, ratio: 1 }));

      const title = file.name.replace(/\.\w+$/, "").replace(/[-_]+/g, " ").trim();
      return {
        kind: "image",
        title: title || "Imagem sem nome",
        imageBlob: blob,
        imageRatio: ratio,
        boardIds,
        tags: suggestTags({ title }, 3),
      };
    }),
  );

  return createItems(drafts);
}

/**
 * Salva a imagem de uma URL trazendo o arquivo pra dentro do banco local —
 * assim a referência sobrevive mesmo se o site sair do ar.
 */
export async function captureImageUrl(url: string, boardIds: string[]): Promise<Item> {
  const normalized = normalizeUrl(url);
  if (!normalized) throw new Error("Essa URL não parece válida");

  try {
    const response = await fetch(normalized, { mode: "cors" });
    const blob = await response.blob();
    if (isImageFile(blob)) {
      const { blob: compressed, ratio } = await compressImage(blob).catch(() => ({
        blob,
        ratio: 1,
      }));
      return createItem({
        kind: "image",
        title: fallbackTitle(normalized),
        url: normalized,
        imageBlob: compressed,
        imageRatio: ratio,
        siteName: hostOf(normalized),
        boardIds,
        tags: suggestTags({ url: normalized }, 3),
      });
    }
  } catch {
    // CORS bloqueou o download: guardamos a URL remota como capa.
  }

  return createItem({
    kind: "image",
    title: fallbackTitle(normalized),
    url: normalized,
    imageUrl: normalized,
    siteName: hostOf(normalized),
    boardIds,
    tags: suggestTags({ url: normalized }, 3),
  });
}

/** Extrai todas as URLs de um texto colado (uma por linha ou soltas no meio). */
export function extractUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s<>"')]+/gi);
  if (matches && matches.length > 0) return matches;

  const lines = text
    .split(/[\n,]/)
    .map((line) => line.trim())
    .filter(Boolean);
  const candidates = lines.filter((line) => /^[\w-]+(\.[\w-]+)+([/?#].*)?$/.test(line));
  return candidates;
}
