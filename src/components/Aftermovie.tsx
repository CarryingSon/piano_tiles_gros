"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { aftermovies } from "@/data/event";

/**
 * Ena video kartica. Lokalno gostovan <video> (brez YouTube vdelave in
 * njenega vmesnika) se zamenja za poster, ko uporabnik klikne gumb ALI ko
 * kartica pripotuje vsaj do polovice v viewport — takrat se predvajanje
 * sproži samodejno, vedno utišano (ker ga brskalniki drugače blokirajo).
 * Zvok vklopi lasten gumb.
 */
function AftermovieCard({ video }: { video: (typeof aftermovies)[number] }) {
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
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

  const toggleSound = () => {
    const next = !muted;
    if (videoRef.current) videoRef.current.muted = next;
    setMuted(next);
  };

  return (
    <div
      ref={containerRef}
      className="reveal relative aspect-video w-full overflow-hidden border border-line"
    >
      {playing ? (
        <>
          <video
            ref={videoRef}
            src={video.src}
            poster={video.poster}
            className="absolute inset-0 h-full w-full object-cover"
            autoPlay
            muted
            playsInline
            controls={false}
          />
          <button
            type="button"
            onClick={toggleSound}
            aria-label={
              muted
                ? `Vklopi zvok — aftermovie Glasbeni Atlas ${video.year}`
                : `Izklopi zvok — aftermovie Glasbeni Atlas ${video.year}`
            }
            aria-pressed={!muted}
            className="absolute bottom-4 right-4 flex h-9 w-9 items-center justify-center rounded-full bg-night/80 text-white transition-colors hover:bg-atlas hover:text-night sm:bottom-6 sm:right-6"
          >
            {muted ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M3 9v6h4l5 5V4L7 9H3z" fill="currentColor" />
                <path
                  d="M16 8l5 8M21 8l-5 8"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M3 9v6h4l5 5V4L7 9H3z" fill="currentColor" />
                <path
                  d="M16.5 8.5a5 5 0 0 1 0 7M19 6a9 9 0 0 1 0 12"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            )}
          </button>
        </>
      ) : (
        <>
          <Image
            src={video.poster}
            alt={`Izsek iz uradnega aftermovia Glasbeni Atlas ${video.year}.`}
            fill
            sizes="(min-width: 768px) 50vw, 100vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-night/30" aria-hidden />
          <button
            type="button"
            onClick={() => setPlaying(true)}
            aria-label={`Predvajaj aftermovie Glasbeni Atlas ${video.year}`}
            className="group absolute inset-0 flex items-center justify-center"
          >
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-atlas transition-transform group-hover:scale-110 sm:h-20 sm:w-20">
              <svg
                width="22"
                height="26"
                viewBox="0 0 28 32"
                aria-hidden
                className="ml-1"
              >
                <path d="M0 0l28 16L0 32z" fill="#050708" />
              </svg>
            </span>
          </button>
        </>
      )}
      <span className="pointer-events-none absolute bottom-4 left-4 bg-night/80 px-3 py-1.5 text-xs uppercase tracking-widest text-white sm:bottom-6 sm:left-6">
        Glasbeni Atlas {video.year} · {video.duration}
      </span>
    </div>
  );
}

export default function Aftermovie() {
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
          {aftermovies.map((video) => (
            <AftermovieCard key={video.src} video={video} />
          ))}
        </div>
      </div>
    </section>
  );
}
