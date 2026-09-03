"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import type { EditionImage } from "@/data/event";

/** Koliko časa se zadrži posamezna fotografija. */
const SLIDE_MS = 4500;

/**
 * Samodejni prehod med fotografijami ene postaje (2024 jih ima štiri — po eno
 * na bend). Vrtenje se ustavi ob prehodu z miško, ob fokusu na pikah in ob
 * `prefers-reduced-motion`; takrat ostane ročno preklapljanje s pikami.
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
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <figcaption className="text-xs uppercase tracking-widest text-fog">
          {captionOf(images[index])}
        </figcaption>
        <div className="flex gap-2">
          {images.map((image, position) => (
            <button
              key={image.src}
              type="button"
              onClick={() => setIndex(position)}
              aria-label={`Prikaži fotografijo: ${captionOf(image)}`}
              aria-current={position === index}
              className={`h-2 w-2 rounded-full transition-colors ${
                position === index ? "bg-atlas" : "bg-line hover:bg-fog"
              }`}
            />
          ))}
        </div>
      </div>
    </figure>
  );
}
