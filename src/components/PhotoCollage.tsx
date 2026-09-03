import Image from "next/image";
import type { CSSProperties } from "react";
import { collage } from "@/data/event";
import styles from "./PhotoCollage.module.css";

/**
 * Postavitev razmetanih fotografij v odstotkih okvirja (razmerje 3 : 2):
 * `x`/`y` je zgornji levi kot, `w` širina, `r` zasuk, `z` plast prekrivanja.
 * Vrstni red ustreza vrstnemu redu v `collage`; če se seznam podaljša, se
 * postavitve ponovijo od začetka.
 */
const LAYOUT = [
  { x: 0, y: 8, w: 28, r: -4, z: 2 },
  { x: 25, y: 0, w: 36, r: 2, z: 5 },
  { x: 63, y: 2, w: 15, r: -5, z: 7 },
  { x: 75, y: 8, w: 24, r: 3, z: 4 },
  { x: 2, y: 34, w: 26, r: 4, z: 6 },
  { x: 27, y: 38, w: 15, r: -3, z: 8 },
  { x: 41, y: 36, w: 29, r: -2, z: 6 },
  { x: 70, y: 34, w: 26, r: 4, z: 5 },
  { x: 8, y: 64, w: 32, r: -3, z: 9 },
  { x: 54, y: 62, w: 34, r: 3, z: 9 },
];

/**
 * Kolaž utrinkov 2024 — brez mreže in brez pripisov: fotografije se
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
