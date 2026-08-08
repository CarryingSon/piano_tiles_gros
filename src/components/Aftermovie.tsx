"use client";

import Image from "next/image";
import { useState } from "react";
import { aftermovie } from "@/data/event";

/**
 * Aftermovie 2024 kot velika kinematografska sekcija. YouTube (nocookie)
 * iframe se naloži šele ob kliku na gumb za predvajanje — do takrat je na
 * strani samo lokalni poster (hitrost, zasebnost, brez samodejnega zvoka).
 */
export default function Aftermovie() {
  const [playing, setPlaying] = useState(false);

  return (
    <section
      id="aftermovie"
      aria-labelledby="aftermovie-naslov"
      className="relative bg-coal py-24 sm:py-32"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="reveal mb-3 text-xs uppercase tracking-[0.3em] text-atlas">
              Aftermovie · 2024
            </p>
            <h2
              id="aftermovie-naslov"
              className="reveal font-display text-4xl uppercase leading-tight text-white sm:text-6xl"
            >
              Takole je bilo <span className="text-atlas">zadnjič</span>.
            </h2>
          </div>
          <p className="reveal max-w-sm text-sm leading-relaxed text-fog">
            Posnetki niso obljuba — so dokaz. Uradni aftermovie z Glasbenega
            Atlasa 2024: Siddharta, Dan D, Jet Black Diamonds in Kreera pred
            polnim šotorom.
          </p>
        </div>

        <div className="reveal relative mt-10 aspect-video w-full overflow-hidden border border-line">
          {playing ? (
            <iframe
              className="absolute inset-0 h-full w-full"
              src={`https://www.youtube-nocookie.com/embed/${aftermovie.youtubeId}?rel=0&autoplay=1`}
              title={aftermovie.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          ) : (
            <>
              <Image
                src={aftermovie.poster}
                alt="Izsek iz uradnega aftermovia: oder Glasbenega Atlasa 2024 v vijolični svetlobi."
                fill
                sizes="(min-width: 1152px) 1104px, 100vw"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-night/30" aria-hidden />
              <button
                type="button"
                onClick={() => setPlaying(true)}
                aria-label="Predvajaj aftermovie Glasbeni Atlas 2024"
                className="group absolute inset-0 flex items-center justify-center"
              >
                <span className="flex h-20 w-20 items-center justify-center rounded-full bg-atlas transition-transform group-hover:scale-110 sm:h-24 sm:w-24">
                  <svg
                    width="28"
                    height="32"
                    viewBox="0 0 28 32"
                    aria-hidden
                    className="ml-1"
                  >
                    <path d="M0 0l28 16L0 32z" fill="#050708" />
                  </svg>
                </span>
                <span className="absolute bottom-4 left-4 bg-night/80 px-3 py-1.5 text-xs uppercase tracking-widest text-white sm:bottom-6 sm:left-6">
                  {aftermovie.title} · 1:03
                </span>
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
