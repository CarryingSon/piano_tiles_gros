"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { aftermovies } from "@/data/event";

/**
 * Ena video kartica. Lokalno gostovan <video> (brez YouTube vdelave in
 * njenega vmesnika) se zamenja za poster, ko kartica pripotuje vsaj do
 * polovice v viewport — takrat se predvajanje sproži samodejno, vedno utišano
 * (ker ga brskalniki drugače blokirajo).
 *
 * Zvoka tu ni: klik odpre posnetek čez zaslon in ta ima zvok. Tako igra z
 * glasbo vedno samo en posnetek — prej sta lahko oba, vsak s svojim gumbom.
 */
function AftermovieCard({
  video,
  paused,
  onOpen,
}: {
  video: (typeof aftermovies)[number];
  /** Velik predvajalnik je odprt — predogled naj utihne in počaka. */
  paused: boolean;
  onOpen: () => void;
}) {
  const [playing, setPlaying] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setPlaying(true);
          observer.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (paused) el.pause();
    else void el.play().catch(() => {});
  }, [paused, playing]);

  return (
    <figure className="reveal m-0">
      <div
        ref={containerRef}
        className="relative aspect-video w-full overflow-hidden border border-line"
      >
        {playing && (
          <video
            ref={videoRef}
            src={video.src}
            poster={video.poster}
            className="absolute inset-0 h-full w-full object-cover"
            autoPlay
            muted
            loop
            playsInline
            controls={false}
          />
        )}
        {!playing && (
          <>
            <Image
              src={video.poster}
              alt=""
              fill
              sizes="(min-width: 768px) 50vw, 100vw"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-night/30" aria-hidden />
          </>
        )}

        {/* Cela ploskev je gumb: klik odpre posnetek čez zaslon, z zvokom. */}
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Predvajaj aftermovie Glasbeni Atlas ${video.year} čez zaslon`}
          className="group absolute inset-0 flex items-center justify-center"
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-atlas transition-transform group-hover:scale-110 sm:h-20 sm:w-20">
            <svg width="22" height="26" viewBox="0 0 28 32" aria-hidden className="ml-1">
              <path d="M0 0l28 16L0 32z" fill="#050708" />
            </svg>
          </span>
        </button>
      </div>

      {/* Pripis stoji pod posnetkom in ne več čez sliko. */}
      <figcaption className="mt-3 flex items-baseline justify-between gap-3 text-xs uppercase tracking-widest text-fog">
        <span className="text-white">Glasbeni Atlas {video.year}</span>
        <span>{video.duration}</span>
      </figcaption>
    </figure>
  );
}

export default function Aftermovie() {
  /** Kateri posnetek teče čez zaslon; `null`, dokler ni odprt nobeden. */
  const [open, setOpen] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(null), []);

  useEffect(() => {
    if (open === null) return;
    const onKey = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key === "Escape") close();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    dialogRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [close, open]);

  const openVideo = open === null ? null : aftermovies[open];

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
              Aftermovie
            </p>
            <h2
              id="aftermovie-naslov"
              className="reveal font-display text-4xl uppercase leading-tight text-white sm:text-6xl"
            >
              Takole je bilo <span className="text-atlas">zadnjič</span>.
            </h2>
          </div>
          <p className="reveal max-w-sm text-sm leading-relaxed text-fog">
            Posnetki niso obljuba — so dokaz. Uradna aftermovieja obeh
            dosedanjih izdaj: 2024 pred polnim šotorom in 2022, ko se je vse
            skupaj šele začelo.
          </p>
        </div>

        <div className="mt-10 grid gap-8 md:grid-cols-2">
          {aftermovies.map((video, index) => (
            <AftermovieCard
              key={video.src}
              video={video}
              paused={open !== null}
              onOpen={() => setOpen(index)}
            />
          ))}
        </div>
      </div>

      {/* Velik predvajalnik z zvokom. Odpre ga samo klik, zato ga na strežniku
          nikoli ni; visi na `body`, da ga ne omeji noben sloj sekcije. */}
      {openVideo !== null
        && createPortal(
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={`Aftermovie Glasbeni Atlas ${openVideo.year}`}
            tabIndex={-1}
            onClick={close}
            className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-night/98 p-4 pt-16"
          >
            <button
              type="button"
              onClick={close}
              aria-label="Zapri predvajalnik"
              className="absolute right-4 top-4 flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-coal/85 text-lg text-white transition-colors hover:border-atlas hover:text-atlas"
            >
              ✕
            </button>
            <video
              key={openVideo.src}
              src={openVideo.src}
              poster={openVideo.poster}
              className="max-h-[calc(100vh-9rem)] w-full max-w-5xl"
              autoPlay
              controls
              playsInline
              onClick={(clickEvent) => clickEvent.stopPropagation()}
            />
            <p className="text-xs uppercase tracking-widest text-fog">
              <span className="text-white">
                Glasbeni Atlas {openVideo.year}
              </span>{" "}
              · {openVideo.duration}
            </p>
          </div>,
          document.body,
        )}
    </section>
  );
}
