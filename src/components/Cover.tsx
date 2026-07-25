"use client";

import { useEffect, useState } from "react";
import type { Item } from "@/lib/types";
import { useBlobUrl } from "@/lib/hooks";
import { colorFromString, cx, hostOf } from "@/lib/utils";
import { NoteIcon } from "./Icons";

/**
 * Capa da referência. Sempre tem algo pra mostrar: imagem local, og:image ou
 * um degradê derivado do domínio — assim o mural nunca fica com buracos
 * cinzentos quando um site bloqueia hotlink.
 */
export function Cover({
  item,
  className,
  aspect = "auto",
  eager = false,
  compact = false,
}: {
  item: Item;
  className?: string;
  /** "auto" respeita a proporção original; os outros recortam. */
  aspect?: "auto" | "video" | "square" | "wide";
  eager?: boolean;
  /** Miniaturas: o nome do domínio não cabe, então mostramos só a inicial. */
  compact?: boolean;
}) {
  const blobUrl = useBlobUrl(item.imageBlob);
  const [remoteFailed, setRemoteFailed] = useState(false);

  useEffect(() => {
    setRemoteFailed(false);
  }, [item.imageUrl]);

  const source = blobUrl ?? (remoteFailed ? undefined : item.imageUrl);
  const seed = item.url ? hostOf(item.url) || item.title : item.title;

  const aspectClass =
    aspect === "video"
      ? "aspect-video"
      : aspect === "square"
        ? "aspect-square"
        : aspect === "wide"
          ? "aspect-[16/7]"
          : undefined;

  if (!source) {
    return (
      <Placeholder
        item={item}
        seed={seed}
        compact={compact}
        // Sem capa de verdade, um bloco baixo e largo lê como cabeçalho do
        // card em vez de um buraco no meio do mural.
        className={cx(aspectClass ?? "aspect-[5/2]", className)}
      />
    );
  }

  return (
    <div
      className={cx(
        "relative overflow-hidden bg-[var(--bg-sunken)]",
        aspectClass,
        className,
      )}
      style={
        aspect === "auto" && item.imageRatio
          ? { aspectRatio: String(item.imageRatio) }
          : undefined
      }
    >
      {/* <img> puro: as capas vêm de domínios arbitrários da web. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={source}
        alt=""
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setRemoteFailed(true)}
        className={cx(
          "h-full w-full",
          aspect === "auto" ? "object-cover" : "object-cover",
        )}
      />
    </div>
  );
}

function Placeholder({
  item,
  seed,
  compact,
  className,
}: {
  item: Item;
  seed: string;
  compact?: boolean;
  className?: string;
}) {
  const base = item.accentColor ?? colorFromString(seed || item.id);
  const label = (hostOf(item.url) || item.title || "?").replace(/^www\./, "");

  if (compact) {
    return (
      <div
        className={cx("flex items-center justify-center overflow-hidden", className)}
        style={{ background: `${base}22` }}
      >
        {item.kind === "note" ? (
          <NoteIcon size={14} style={{ color: base }} />
        ) : (
          <span
            className="font-mono text-[11px] font-semibold uppercase"
            style={{ color: base }}
          >
            {label.charAt(0)}
          </span>
        )}
      </div>
    );
  }

  if (item.kind === "note") {
    return (
      <div
        className={cx(
          "relative flex items-center justify-center overflow-hidden",
          className,
        )}
        style={{
          background: `linear-gradient(150deg, ${base}22, ${base}0d 60%, transparent)`,
        }}
      >
        {/* Pauta de caderno pra nota se distinguir de link à distância */}
        <div
          className="absolute inset-0 opacity-[0.5]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(to bottom, transparent 0 26px, var(--border) 26px 27px)",
          }}
        />
        <NoteIcon size={26} className="relative text-[var(--text-faint)]" />
      </div>
    );
  }

  return (
    <div
      className={cx("relative flex items-center justify-center overflow-hidden", className)}
      style={{
        background: `radial-gradient(120% 100% at 20% 0%, ${base}40, ${base}14 45%, var(--bg-sunken) 100%)`,
      }}
    >
      <span
        className="px-4 text-center font-mono text-[11px] tracking-[0.16em] text-[var(--text-faint)] uppercase"
        style={{ color: base }}
      >
        {label.slice(0, 28)}
      </span>
    </div>
  );
}
