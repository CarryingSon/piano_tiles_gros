"use client";

import { useRef } from "react";
import Image from "next/image";
import { campaign } from "@/data/event";
import PhotoWall from "@/components/PhotoWall";

/**
 * Drsnik z resničnimi kampanjskimi objavami 2026 (Instagram-grafike
 * organizatorja) — plakat, datum, lokacija in napovedi nastopajočih.
 * Native scroll-snap; puščici sta le bližnjica za miško/tipkovnico.
 */
export default function CampaignSlider() {
  const trackRef = useRef<HTMLDivElement>(null);

  const scrollByCard = (dir: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
  };

  return (
    <section
      aria-labelledby="kampanja-naslov"
      className="relative overflow-hidden py-24 sm:py-32"
    >
      <PhotoWall variant="a5" />
      <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="reveal mb-3 text-xs uppercase tracking-[0.3em] text-atlas">
              Kampanja · 2026
            </p>
            <h2
              id="kampanja-naslov"
              className="reveal font-display text-4xl uppercase leading-tight text-white sm:text-6xl"
            >
              Tako smo napovedali Atlas.
            </h2>
          </div>
          <div className="reveal hidden gap-3 sm:flex">
            <button
              type="button"
              onClick={() => scrollByCard(-1)}
              aria-label="Prikaži prejšnjo objavo"
              className="flex h-11 w-11 items-center justify-center border border-line text-atlas transition-colors hover:border-atlas"
            >
              <span aria-hidden>←</span>
            </button>
            <button
              type="button"
              onClick={() => scrollByCard(1)}
              aria-label="Prikaži naslednjo objavo"
              className="flex h-11 w-11 items-center justify-center border border-line text-atlas transition-colors hover:border-atlas"
            >
              <span aria-hidden>→</span>
            </button>
          </div>
        </div>
      </div>

      <div
        ref={trackRef}
        className="reveal relative z-10 mt-14 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 [scrollbar-width:none] sm:px-6 [&::-webkit-scrollbar]:hidden"
      >
        {campaign.map((item) => (
          <figure
            key={item.src}
            className="relative shrink-0 snap-center overflow-hidden border border-line"
            style={{ width: "min(78vw, 320px)" }}
          >
            <div className="relative aspect-[4/5] overflow-hidden">
              <Image
                src={item.src}
                alt={item.alt}
                fill
                sizes="(min-width: 640px) 320px, 78vw"
                className="object-cover"
              />
            </div>
          </figure>
        ))}
      </div>
    </section>
  );
}
