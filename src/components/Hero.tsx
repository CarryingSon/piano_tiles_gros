"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { event, heroMedia, lineup, tickets } from "@/data/event";

/**
 * Junaški del: celozaslonski, kinematografski. Utišan video izsek iz
 * uradnega aftermovia 2024 se naloži šele po prvi izrisani sliki (LCP je
 * statični poster prek next/image) in samo, če uporabnik ne zahteva
 * zmanjšanega gibanja oz. varčevanja s podatki.
 */
export default function Hero() {
  const [videoOn, setVideoOn] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const playVideo = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    // iOS Safari checks the DOM properties in addition to the JSX attributes.
    video.muted = true;
    video.defaultMuted = true;
    video.setAttribute("muted", "");
    void video.play().catch(() => {
      // Safari may defer autoplay until the first touch. The poster stays visible
      // underneath and the interaction listeners below try again immediately.
    });
  }, []);

  useEffect(() => {
    const previousScrollRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";

    const navigation = performance.getEntriesByType(
      "navigation",
    )[0] as PerformanceNavigationTiming | undefined;

    if (navigation?.type === "reload") {
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}`,
      );
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }

    return () => {
      window.history.scrollRestoration = previousScrollRestoration;
    };
  }, []);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    type NetInfo = { saveData?: boolean };
    const connection = (navigator as Navigator & { connection?: NetInfo })
      .connection;
    if (reduced.matches || connection?.saveData) return;
    const id = window.requestAnimationFrame(() => setVideoOn(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (!videoOn) return;

    const video = videoRef.current;
    if (!video) return;

    const resumeWhenVisible = () => {
      if (!document.hidden) playVideo();
    };

    playVideo();
    video.addEventListener("canplay", playVideo);
    window.addEventListener("pageshow", playVideo);
    window.addEventListener("pointerdown", playVideo, { once: true, passive: true });
    window.addEventListener("touchstart", playVideo, { once: true, passive: true });
    document.addEventListener("visibilitychange", resumeWhenVisible);

    return () => {
      video.removeEventListener("canplay", playVideo);
      window.removeEventListener("pageshow", playVideo);
      window.removeEventListener("pointerdown", playVideo);
      window.removeEventListener("touchstart", playVideo);
      document.removeEventListener("visibilitychange", resumeWhenVisible);
    };
  }, [playVideo, videoOn]);

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
          className="scale-y-[1.24] object-cover object-center grayscale-[35%] sm:scale-[1.25]"
        />
        {videoOn && (
          <video
            ref={videoRef}
            className="absolute inset-0 h-full w-full scale-y-[1.24] object-cover object-center grayscale-[35%] sm:scale-[1.25]"
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            poster={heroMedia.poster}
          >
            <source src={heroMedia.videoMp4} type="video/mp4" />
            <source src={heroMedia.videoWebm} type="video/webm" />
          </video>
        )}
        {/* Temnitev za berljivost */}
        <div className="absolute inset-0 bg-gradient-to-t from-night via-night/45 to-night/10 sm:via-night/55 sm:to-night/30" />
        <div className="absolute inset-0 bg-gradient-to-r from-night/55 to-transparent sm:from-night/60" />
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

      <div className="relative mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-28">
        <p className="mb-3 inline-flex items-center gap-2.5 text-[0.68rem] uppercase tracking-[0.24em] text-atlas sm:mb-4 sm:gap-3 sm:text-sm sm:tracking-[0.3em]">
          <span aria-hidden className="relative flex h-2 w-2">
            <span className="motion-pulse absolute inline-flex h-full w-full rounded-full bg-atlas" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-atlas" />
          </span>
          {event.tagline}
        </p>

        <h1 className="font-display uppercase leading-[0.9]">
          <span className="block text-[17vw] text-white sm:text-[13vw] lg:text-[9.5rem]">
            Glasbeni
          </span>
          <span className="flex items-center gap-4 sm:gap-6">
            <span className="block text-[17vw] text-white sm:text-[13vw] lg:text-[9.5rem]">
              Atlas
            </span>
            <span className="block bg-atlas px-3 py-1 text-[9vw] text-night sm:text-[7vw] lg:text-[5.5rem]">
              2026
            </span>
          </span>
        </h1>

        <p className="mt-5 max-w-xl text-[0.95rem] text-white sm:mt-6 sm:text-lg">
          <strong className="text-atlas">
            {lineup.map((p) => p.name).join(" · ")}
          </strong>
          <span className="mt-1 block text-fog">
            {event.dateLong} · {event.venue}
          </span>
        </p>

        <div className="mt-6 grid w-full max-w-[21rem] gap-3 sm:mt-8 sm:flex sm:max-w-none sm:flex-wrap sm:items-center sm:gap-4">
          <a
            href={tickets.url}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-atlas px-6 py-3 text-center font-display text-base uppercase tracking-wide text-night transition-transform hover:-translate-y-0.5 sm:px-8 sm:py-4 sm:text-lg"
          >
            {tickets.ctaLabel}
          </a>
          <a
            href="#aftermovie"
            onClick={(clickEvent) => {
              const aftermovie = document.getElementById("aftermovie");
              if (!aftermovie) return;

              clickEvent.preventDefault();
              const reduceMotion = window.matchMedia(
                "(prefers-reduced-motion: reduce)",
              ).matches;
              aftermovie.scrollIntoView({
                behavior: reduceMotion ? "auto" : "smooth",
                block: "start",
              });
            }}
            className="border border-white/40 px-6 py-3 text-center font-display text-base uppercase tracking-wide text-white transition-colors hover:border-atlas hover:text-atlas sm:px-8 sm:py-4 sm:text-lg"
          >
            Oglej si aftermovie
          </a>
        </div>

        <p className="mt-3 text-xs text-fog sm:mt-4 sm:text-sm">
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
