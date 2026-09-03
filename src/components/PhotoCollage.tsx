import Image from "next/image";
import type { CSSProperties } from "react";
import { collage } from "@/data/event";
import styles from "./PhotoCollage.module.css";

/**
 * Postavitev razmetanih fotografij v odstotkih okvirja (razmerje 6 : 5):
 * `x`/`y` je zgornji levi kot, `w` širina, `r` zasuk, `z` plast prekrivanja.
 * Vrstni red ustreza vrstnemu redu v `collage`; če se seznam podaljša, se
 * postavitve ponovijo od začetka.
 */
const LAYOUT = [
  { x: 0, y: 6, w: 27, r: -4, z: 2 },
  { x: 24, y: 0, w: 34, r: 2, z: 5 },
  { x: 60, y: 2, w: 15, r: -5, z: 7 },
  { x: 73, y: 7, w: 26, r: 3, z: 4 },
  { x: 2, y: 26, w: 26, r: 4, z: 6 },
  { x: 26, y: 30, w: 15, r: -3, z: 8 },
  { x: 40, y: 28, w: 29, r: -2, z: 6 },
  { x: 69, y: 26, w: 27, r: 4, z: 5 },
  { x: 6, y: 50, w: 31, r: -3, z: 9 },
  { x: 50, y: 49, w: 32, r: 3, z: 9 },
  { x: 74, y: 50, w: 25, r: -4, z: 7 },
  { x: 16, y: 72, w: 30, r: 3, z: 10 },
  { x: 52, y: 70, w: 33, r: -2, z: 10 },
];

/**
 * Kolaž utrinkov 2022 in 2024 — brez mreže in brez pripisov: fotografije se
 * prekrivajo, vse pa so pod sivim filtrom, da kolaž ostane en sam kader.
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
              } as CSSProperties
            }
          >
            <Image
              src={photo.src}
              alt={photo.alt}
              width={photo.width}
              height={photo.height}
              sizes="(min-width: 768px) 30vw, 45vw"
              className={styles.photo}
            />
          </figure>
        );
      })}
    </div>
  );
}
