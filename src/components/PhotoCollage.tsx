"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { collage } from "@/data/event";
import styles from "./PhotoCollage.module.css";

/**
 * Postavitev razmetanih fotografij v odstotkih okvirja (razmerje 6 : 5):
 * `x`/`y` je zgornji levi kot, `w` širina, `r` zasuk, `z` plast prekrivanja,
 * `p`/`pb` pa širina papirnatega roba (spodaj je pri nekaterih širši, kot pri
 * polaroidu) v odstotkih širine okvirja. Na telefonu velja le razmerje med
 * `pb` in `p`, ker je rob tam v `rem` — glej `PhotoCollage.module.css`.
 * Vrstni red ustreza vrstnemu redu v `collage`; če se seznam podaljša, se
 * postavitve ponovijo od začetka.
 */
const LAYOUT = [
  { x: 4, y: 6, w: 22, r: -4, z: 2, p: 0.18, pb: 0.18 },
  { x: 26, y: 0, w: 27, r: 2, z: 5, p: 0.15, pb: 0.45 },
  { x: 55, y: 3, w: 13, r: -5, z: 7, p: 0.24, pb: 0.24 },
  { x: 72, y: 6, w: 22, r: 3, z: 4, p: 0.17, pb: 0.52 },
  { x: 6, y: 26, w: 21, r: 4, z: 6, p: 0.22, pb: 0.22 },
  { x: 27, y: 28, w: 13, r: -3, z: 8, p: 0.23, pb: 0.54 },
  { x: 41, y: 26, w: 24, r: -2, z: 6, p: 0.16, pb: 0.16 },
  { x: 67, y: 27, w: 22, r: 4, z: 5, p: 0.2, pb: 0.55 },
  { x: 12, y: 48, w: 25, r: -3, z: 9, p: 0.17, pb: 0.17 },
  { x: 42, y: 47, w: 26, r: 3, z: 9, p: 0.15, pb: 0.46 },
  { x: 70, y: 49, w: 23, r: -4, z: 7, p: 0.23, pb: 0.23 },
  { x: 18, y: 68, w: 23, r: 3, z: 10, p: 0.18, pb: 0.5, },
  { x: 52, y: 67, w: 26, r: -2, z: 10, p: 0.14, pb: 0.14 },
];

/** Dovolj dolg poteg s prstom, da šteje za listanje in ne za nesreden dotik. */
const SWIPE_PX = 45;

/**
 * Kolaž utrinkov 2022 in 2024 — brez mreže in brez pripisov: fotografije se
 * prekrivajo, kot bi kdo stresel star album na mizo.
 *
 * Klik na katerokoli odpre galerijo čez zaslon, po njej pa se lista naprej in
 * nazaj — z gumboma, puščicami na tipkovnici ali potegom prsta.
 */
export default function PhotoCollage() {
  /** Zaporedna številka odprte fotografije; `null`, dokler je galerija zaprta. */
  const [open, setOpen] = useState<number | null>(null);
  /** Gumb, s katerega je galerija odprta — vanj se vrne fokus ob zaprtju. */
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<number | null>(null);

  const close = useCallback(() => {
    setOpen(null);
    openerRef.current?.focus();
  }, []);

  const step = useCallback((delta: number) => {
    // Zavijemo naokoli: za zadnjo pride prva.
    setOpen((current) =>
      current === null ? current : (current + delta + collage.length) % collage.length,
    );
  }, []);

  useEffect(() => {
    if (open === null) return;

    const onKey = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key === "Escape") close();
      if (keyEvent.key === "ArrowRight") step(1);
      if (keyEvent.key === "ArrowLeft") step(-1);
    };

    // Stran pod galerijo naj miruje, dokler je ta odprta.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    dialogRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [close, open, step]);

  const photo = open === null ? null : collage[open];

  return (
    <>
      <div className={styles.scatter}>
        {collage.map((item, index) => {
          const spot = LAYOUT[index % LAYOUT.length];
          return (
            <figure
              key={item.src}
              className={styles.item}
              style={
                {
                  "--x": `${spot.x}%`,
                  "--y": `${spot.y}%`,
                  "--w": `${spot.w}%`,
                  "--r": `${spot.r}deg`,
                  "--z": spot.z,
                  "--p": `${spot.p}%`,
                  "--pb": `${spot.pb}%`,
                  /* Isto razmerje roba za telefon, kjer rob merimo v `rem`. */
                  "--pbr": Math.round((spot.pb / spot.p) * 100) / 100,
                } as CSSProperties
              }
            >
              <button
                type="button"
                className={styles.frame}
                aria-label={`Odpri fotografijo: ${item.alt}`}
                onClick={(clickEvent) => {
                  openerRef.current = clickEvent.currentTarget;
                  setOpen(index);
                }}
              >
                <Image
                  src={item.src}
                  alt={item.alt}
                  width={item.width}
                  height={item.height}
                  sizes="(min-width: 768px) 25vw, 45vw"
                  className={styles.photo}
                />
              </button>
            </figure>
          );
        })}
      </div>

      {/* Galerija visi na `body`: sekcija Doživetja ima svoj sloj in skrito
          prekoračitev, znotraj katere bi jo prerasla glava strani. Odpre jo
          lahko samo klik, zato ob izrisu na strežniku portala nikoli ni. */}
      {photo !== null && open !== null
        && createPortal(
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Utrinki z Glasbenega Atlasa"
            tabIndex={-1}
            className={styles.lightbox}
            onClick={close}
            onTouchStart={(touchEvent) => {
              touchStartRef.current = touchEvent.touches[0].clientX;
            }}
            onTouchEnd={(touchEvent) => {
              const start = touchStartRef.current;
              touchStartRef.current = null;
              if (start === null) return;
              const shift = touchEvent.changedTouches[0].clientX - start;
              if (Math.abs(shift) > SWIPE_PX) step(shift < 0 ? 1 : -1);
            }}
          >
            <button
              type="button"
              className={`${styles.control} ${styles.close}`}
              aria-label="Zapri galerijo"
              onClick={close}
            >
              ✕
            </button>
            <button
              type="button"
              className={`${styles.control} ${styles.prev}`}
              aria-label="Prejšnja fotografija"
              onClick={(clickEvent) => {
                clickEvent.stopPropagation();
                step(-1);
              }}
            >
              ‹
            </button>

            {/* Klik na samo fotografijo galerije ne zapre. */}
            <figure
              className={styles.stage}
              onClick={(clickEvent) => clickEvent.stopPropagation()}
            >
              <Image
                key={photo.src}
                src={photo.src}
                alt={photo.alt}
                width={photo.width}
                height={photo.height}
                sizes="100vw"
                priority
                className={styles.full}
              />
              <figcaption className={styles.caption}>
                <span>{photo.alt}</span>
                <span className={styles.counter}>
                  {open + 1} / {collage.length}
                </span>
              </figcaption>
            </figure>

            <button
              type="button"
              className={`${styles.control} ${styles.next}`}
              aria-label="Naslednja fotografija"
              onClick={(clickEvent) => {
                clickEvent.stopPropagation();
                step(1);
              }}
            >
              ›
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
