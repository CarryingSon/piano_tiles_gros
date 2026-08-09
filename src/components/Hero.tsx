"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { event, heroMedia, lineup, tickets } from "@/data/event";
import Wordmark from "@/components/Wordmark";

/**
 * Junaški del: celozaslonski, kinematografski. Utišan video izsek iz
 * uradnega aftermovia 2024 se naloži šele po prvi izrisani sliki (LCP je
 * statični poster prek next/image) in samo, če uporabnik ne zahteva
 * zmanjšanega gibanja oz. varčevanja s podatki.
 */
export default function Hero() {
  const [videoOn, setVideoOn] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    type NetInfo = { saveData?: boolean };
    const connection = (navigator as Navigator & { connection?: NetInfo })
      .connection;
    if (reduced.matches || connection?.saveData) return;
    const id = window.setTimeout(() => setVideoOn(true), 600);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <section
      id="vrh"
      className="grain relative flex min-h-svh flex-col justify-center overflow-hidden"
    >
      {/* Ozadje: poster (LCP) + utišan video, ko je smiselno */}
      <div className="absolute inset-0" aria-hidden>
        <Image
          src={heroMedia.poster}
          alt=""
          fill
          priority
          sizes="100vw"
          className="scale-[1.25] object-cover grayscale-[35%]"
        />
        {videoOn && (
          <video
            className="absolute inset-0 h-full w-full scale-[1.25] object-cover grayscale-[35%]"
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            poster={heroMedia.poster}
          >
            <source src={heroMedia.videoWebm} type="video/webm" />
            <source src={heroMedia.videoMp4} type="video/mp4" />
          </video>
        )}
        {/* Temnitev za berljivost */}
        <div className="absolute inset-0 bg-gradient-to-t from-night via-night/55 to-night/30" />
        <div className="absolute inset-0 bg-gradient-to-r from-night/60 to-transparent" />
      </div>

      {/* Koordinatni okvir — atlas motiv */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-6 hidden text-[11px] uppercase tracking-[0.25em] text-fog/70 sm:block"
      >
        <div className="mx-auto flex w-full max-w-6xl justify-between px-4 sm:px-6">
          <span>{event.coords.lat}</span>
          <span>Naslednja postaja</span>
          <span>{event.coords.lng}</span>
        </div>
      </div>

      <div className="relative mx-auto w-full max-w-6xl px-4 py-24 sm:px-6 sm:py-28">
        <p className="mb-4 inline-flex items-center gap-3 text-xs uppercase tracking-[0.3em] text-atlas sm:text-sm">
          <span aria-hidden className="relative flex h-2 w-2">
            <span className="motion-pulse absolute inline-flex h-full w-full rounded-full bg-atlas" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-atlas" />
          </span>
          {event.tagline}
        </p>

        <h1>
          <span className="sr-only">Glasbeni Atlas 2026</span>
          <span aria-hidden className="flex items-end gap-3 sm:gap-5">
            <Wordmark className="h-auto w-[54vw] drop-shadow-[0_10px_32px_rgb(0_0_0/0.3)] sm:w-[min(64vw,38rem)]" />
            <span className="mb-1 block bg-atlas px-2 py-1 font-display text-[9vw] leading-none text-night sm:px-3 sm:text-[8vw] lg:text-[7rem]">
              2026
            </span>
          </span>
        </h1>

        <p className="mt-6 max-w-xl text-base text-white sm:text-lg">
          <strong className="text-atlas">
            {lineup.map((p) => p.name).join(" · ")}
          </strong>
          <span className="mt-1 block text-fog">
            {event.dateLong} · {event.venue}
          </span>
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-4">
          <a
            href={tickets.url}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-atlas px-8 py-4 font-display text-lg uppercase tracking-wide text-night transition-transform hover:-translate-y-0.5"
          >
            {tickets.ctaLabel}
          </a>
          <a
            href="#aftermovie"
            className="border border-white/40 px-8 py-4 font-display text-lg uppercase tracking-wide text-white transition-colors hover:border-atlas hover:text-atlas"
          >
            Oglej si aftermovie
          </a>
        </div>

        <p className="mt-4 text-sm text-fog">
          Vstopnice {tickets.priceFromHuman} · {tickets.provider}
        </p>
      </div>

      {/* Namig za pomik */}
      <a
        href="#dozivetje"
        aria-label="Pomakni se do vsebine"
        className="absolute bottom-6 right-6 hidden text-fog transition-colors hover:text-atlas md:block"
      >
        <svg
          width="24"
          height="32"
          viewBox="0 0 24 32"
          fill="none"
          aria-hidden
        >
          <path
            d="M12 2v26m0 0l-8-8m8 8l8-8"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </a>
    </section>
  );
}
