"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  event,
  heroMedia,
  lineup,
  tickets,
  type PerformerAccent,
} from "@/data/event";

/* Razredi so izpisani v celoti, ker Tailwind bere izvorno kodo in sestavljenih
   imen (`text-${accent}`) ne bi našel. Iste barve nosijo vstopnice. */
const accentText: Record<PerformerAccent, string> = {
  kokosy: "text-kokosy",
  mrfy: "text-mrfy",
  atlas: "text-atlas",
};

/**
 * Junaški del: celozaslonski, kinematografski. Utišan video izsek iz
 * uradnega aftermovia 2024 (na telefonu pokončni koncertni reel) se naloži
 * šele po prvi izrisani sliki — ta je statični poster — in samo, če uporabnik
 * ne zahteva zmanjšanega gibanja oz. varčevanja s podatki.
 */
export default function Hero() {
  const [videoOn, setVideoOn] = useState(false);
  /**
   * `null`, dokler ne vemo, kako širok je zaslon: telefon dobi pokončni
   * posnetek, vse od `sm:` naprej pa širokega. Odločitev pade na odjemalcu,
   * ker strežnik širine ne pozna — video se tako ali tako priklopi šele po
   * prvem izrisu.
   */
  const [phone, setPhone] = useState<boolean | null>(null);
  /** Video se prelije čez poster šele, ko res teče — brez preskoka. */
  const [videoVisible, setVideoVisible] = useState(false);
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
    const narrow = window.matchMedia("(max-width: 639.98px)");
    const id = window.requestAnimationFrame(() => {
      setPhone(narrow.matches);
      setVideoOn(true);
    });
    return () => window.cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (!videoOn || phone === null) return;

    const video = videoRef.current;
    if (!video) return;

    const resumeWhenVisible = () => {
      if (!document.hidden) playVideo();
    };
    const reveal = () => setVideoVisible(true);

    playVideo();
    video.addEventListener("playing", reveal);
    video.addEventListener("canplay", playVideo);
    window.addEventListener("pageshow", playVideo);
    window.addEventListener("pointerdown", playVideo, { once: true, passive: true });
    window.addEventListener("touchstart", playVideo, { once: true, passive: true });
    document.addEventListener("visibilitychange", resumeWhenVisible);

    return () => {
      video.removeEventListener("playing", reveal);
      video.removeEventListener("canplay", playVideo);
      window.removeEventListener("pageshow", playVideo);
      window.removeEventListener("pointerdown", playVideo);
      window.removeEventListener("touchstart", playVideo);
      document.removeEventListener("visibilitychange", resumeWhenVisible);
    };
  }, [phone, playVideo, videoOn]);

  return (
    <section
      id="vrh"
      className="grain relative flex min-h-dvh flex-col justify-end overflow-hidden sm:justify-center"
    >
      {/*
        Ozadje: poster + utišan video, ko je smiselno — oboje čez cel zaslon.

        Višina je `dvh` in ne `svh`: `svh` meri zaslon s **prikazano** vrstico
        Safarija, zato je junaški del ostal tako visok tudi potem, ko se je ob
        prvem pomiku vrstica umaknila — pod videom je pogledala naslednja
        sekcija. `dvh` raste in pada z vrstico, tako pokončni posnetek res drži
        cel zaslon. Na namizju so vse tri mere enake, zato se tam ne spremeni nič.

        Široki vir je kinematografski (2,34 : 1). Prej je imel vpečene črne
        pasove in skril jih je `scale-y-[1.24]` — navpični razteg, ki je sliko
        popačil in jo po nepotrebnem še povečal. Pasovi so zdaj odrezani iz
        samih datotek, zato tu ne potrebujemo nobenega raztega ne povečave.

        Telefon ne dobi tega izseka, ampak pokončnega (`heroMedia.mobile`):
        široki kader bi pri `object-cover` čez pokončen zaslon pokazal komaj
        petino svoje širine. Ker je vir zdaj v pravem razmerju, pokriva ves
        zaslon, spodnji preliv pa ga brez šiva spelje v ozadje strani.

        Poster je `<picture>` in ne `next/image`: telefon in namizje potrebujeta
        vsak svoj kader, `next/image` pa medijskih poizvedb ne pozna in bi obe
        sliki naložil na vsaki napravi. Datoteki sta majhni (74 in 96 kB) in se
        prenaša samo tista, ki jo brskalnik izbere.
      */}
      <div className="absolute inset-0" aria-hidden>
        <picture>
          <source
            media="(max-width: 639.98px)"
            srcSet={heroMedia.mobile.poster}
            width={720}
            height={1280}
          />
          <img
            src={heroMedia.poster}
            alt=""
            fetchPriority="high"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover object-center grayscale-[35%]"
          />
        </picture>
        {videoOn && phone !== null && (
          <video
            /* Zamenjan vir potrebuje svoj element, sicer bi brskalnik obdržal
               staro sličico do prve odigrane slike. */
            key={phone ? "phone" : "wide"}
            ref={videoRef}
            className={`absolute inset-0 h-full w-full object-cover object-center grayscale-[35%] transition-opacity duration-700 ${
              videoVisible ? "opacity-100" : "opacity-0"
            }`}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            poster={phone ? heroMedia.mobile.poster : heroMedia.poster}
          >
            {phone ? (
              <source src={heroMedia.mobile.videoMp4} type="video/mp4" />
            ) : (
              <>
                <source src={heroMedia.videoMp4} type="video/mp4" />
                <source src={heroMedia.videoWebm} type="video/webm" />
              </>
            )}
          </video>
        )}
        {/* Temnitev za berljivost */}
        <div className="absolute inset-0 bg-gradient-to-t from-night via-night/45 to-night/10 sm:via-night/55 sm:to-night/30" />
        <div className="absolute inset-0 bg-gradient-to-r from-night/55 to-transparent sm:from-night/60" />
        {/* Preliva, ki na telefonu zaključita celozaslonski posnetek: zgoraj
            pod glavo strani, spodaj pa v črnino, iz katere raste vsebina. */}
        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-night/85 via-night/45 to-transparent sm:hidden" />
        <div className="absolute inset-x-0 bottom-0 h-[38dvh] bg-gradient-to-t from-night via-night/62 to-transparent sm:hidden" />
      </div>

      {/* Na telefonu vsebina sedi pri dnu: nad njo je ves posnetek, pod njo pa
          toliko zraka, da naslov in gumba ne stojijo na robu zaslona. */}
      <div className="relative mx-auto w-full max-w-6xl px-4 pb-16 pt-24 sm:px-6 sm:py-28">
        <p className="mb-3 inline-flex items-center gap-2.5 text-[0.68rem] uppercase tracking-[0.24em] text-atlas sm:mb-4 sm:gap-3 sm:text-sm sm:tracking-[0.3em]">
          <span aria-hidden className="relative flex h-2 w-2">
            <span className="motion-pulse absolute inline-flex h-full w-full rounded-full bg-atlas" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-atlas" />
          </span>
          {event.tagline}
        </p>

        <h1 className="mt-3 font-display uppercase leading-[0.9] sm:mt-4">
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

        {/* Imena zasedb stojijo takoj pod naslovom, vsako v svoji barvi —
            enako kot na vstopnicah. */}
        <p className="mt-5 flex flex-wrap items-baseline gap-x-2 font-display text-[5vw] uppercase leading-none tracking-wide sm:mt-6 sm:gap-x-3 sm:text-[2.2vw] lg:text-[1.9rem]">
          {lineup.map((performer, index) => (
            <span key={performer.name} className={accentText[performer.accent]}>
              {performer.name}
              {index < lineup.length - 1 && (
                <span aria-hidden className="ml-2 text-fog sm:ml-3">
                  ·
                </span>
              )}
            </span>
          ))}
        </p>

        <p className="mt-2.5 max-w-xl text-[0.95rem] text-fog sm:mt-3 sm:text-lg">
          {event.dateLong} · {event.city}
        </p>

        <div className="mt-6 grid w-full max-w-[21rem] gap-3 sm:mt-8 sm:flex sm:max-w-none sm:flex-wrap sm:items-center sm:gap-4">
          <a
            href={tickets.url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl bg-atlas px-6 py-3 text-center font-display text-base uppercase tracking-wide text-night transition-transform hover:-translate-y-0.5 sm:px-8 sm:py-4 sm:text-lg"
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
            className="rounded-xl border border-white/40 px-6 py-3 text-center font-display text-base uppercase tracking-wide text-white transition-colors hover:border-atlas hover:text-atlas sm:px-8 sm:py-4 sm:text-lg"
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
