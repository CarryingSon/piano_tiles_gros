"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import type { EditionImage } from "@/data/event";

/** Koliko časa se zadrži posamezna fotografija. */
const SLIDE_MS = 4500;

/**
 * Samodejni prehod med fotografijami ene postaje (2022 in 2024 jih imata po
 * štiri — po eno na bend), v polni barvi. Vrtenje se ustavi ob prehodu z miško
 * in ob fokusu, ustavljeno pa ostane tudi pri `prefers-reduced-motion`; listati
 * se da s puščicama na sami fotografiji.
 */
export default function EditionGallery({
  images,
  year,
}: {
  images: EditionImage[];
  year: string;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (calm.matches) return;
    const id = window.setInterval(
      () => setIndex((current) => (current + 1) % images.length),
      SLIDE_MS,
    );
    return () => window.clearInterval(id);
  }, [paused, images.length]);

  const captionOf = (image: EditionImage) =>
    image.caption ?? `Arhiv · Glasbeni Atlas ${year}`;

  /** Naprej ali nazaj, z zavijanjem naokoli. */
  const step = (delta: number) =>
    setIndex((current) => (current + delta + images.length) % images.length);

  const arrow =
    "absolute top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-night/70 text-lg text-white backdrop-blur transition-colors hover:border-atlas hover:text-atlas";

  return (
    <figure
      aria-roledescription="vrtiljak fotografij"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="relative aspect-[3/2] overflow-hidden bg-coal">
        {images.map((image, position) => (
          <Image
            key={image.src}
            src={image.src}
            alt={image.alt}
            fill
            sizes="(min-width: 768px) 45vw, 100vw"
            className={`object-cover transition-opacity duration-700 ${
              position === index ? "opacity-100" : "opacity-0"
            }`}
            aria-hidden={position !== index}
          />
        ))}

        {/* Puščici ležita na sami fotografiji — pike so povedale, koliko slik
            je, ne pa, da se da med njimi listati. */}
        <button
          type="button"
          onClick={() => step(-1)}
          aria-label="Prejšnja fotografija"
          className={`${arrow} left-3`}
        >
          <span aria-hidden>‹</span>
        </button>
        <button
          type="button"
          onClick={() => step(1)}
          aria-label="Naslednja fotografija"
          className={`${arrow} right-3`}
        >
          <span aria-hidden>›</span>
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <figcaption className="text-xs uppercase tracking-widest text-fog">
          {captionOf(images[index])}
        </figcaption>
        <span className="text-xs tabular-nums tracking-widest text-fog">
          {index + 1} / {images.length}
        </span>
      </div>
    </figure>
  );
}
