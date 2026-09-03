import Image from "next/image";
import type { CSSProperties } from "react";
import { collage } from "@/data/event";
import styles from "./PhotoCollage.module.css";

/**
 * Postavitev razmetanih fotografij v odstotkih okvirja (razmerje 6 : 5):
 * `x`/`y` je zgornji levi kot, `w` širina, `r` zasuk, `z` plast prekrivanja,
 * `p`/`pb` pa širina papirnatega roba (spodaj je pri nekaterih širši, kot pri
 * polaroidu) v odstotkih širine slike.
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

/**
 * Kolaž utrinkov 2022 in 2024 — brez mreže in brez pripisov: fotografije se
 * prekrivajo, vse pa so pod istim obledelim, rahlo sepia filtrom, da kup
 * deluje kot star album, ne kot galerija posameznih kadrov.
 */
export default function PhotoCollage() {
  return (
    <div className={styles.scatter}>
      {collage.map((photo, index) => {
        const spot = LAYOUT[index % LAYOUT.length];
        return (
          <figure
            key={photo.src}
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
              } as CSSProperties
            }
          >
            <span className={styles.frame}>
              <Image
                src={photo.src}
                alt={photo.alt}
                width={photo.width}
                height={photo.height}
                sizes="(min-width: 768px) 25vw, 45vw"
                className={styles.photo}
              />
            </span>
          </figure>
        );
      })}
    </div>
  );
}
