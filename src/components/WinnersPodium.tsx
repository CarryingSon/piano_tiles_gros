"use client";

import { useId, useState, type ReactNode } from "react";
import { CloseIcon } from "@/components/Icons";
import { winners, type Winner } from "@/data/winners";
import styles from "./WinnersPodium.module.css";

/**
 * Razglasitev zmagovalcev: okno s stopničkami, ki leži čez lestvico, dokler ga
 * obiskovalec ne zapre. Pod njim lestvica živi naprej in igra se igra naprej —
 * okno samo pove, komu so karte že podeljene.
 *
 * Okno in lestvica stojita v isti celici mreže, zato je ovoj visok toliko kot
 * višji od obeh: kratka lestvica (ali „Nalagam …") okna ne odreže, dolga pa
 * ga ne raztegne — kartica s stopničkami je lepljiva in ostane na vrhu.
 */

/**
 * Zaprto okno ostane zaprto, dokler stran ni na novo naložena. Lestvica v igri
 * se po vsakem krogu izriše na novo; brez tega bi razglasitev skočila nazaj čez
 * vsak rezultat.
 */
let dismissed = false;

const placeClass: Record<Winner["place"], string> = {
  1: styles.first,
  2: styles.second,
  3: styles.third,
};

function share(rating: number) {
  return `${(rating / 100).toLocaleString("sl-SI", { minimumFractionDigits: 2 })} %`;
}

export default function WinnersPodium({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(() => !dismissed);
  const titleId = useId();

  const close = () => {
    dismissed = true;
    setOpen(false);
  };

  return (
    <div className={styles.host}>
      <div className={styles.content}>{children}</div>

      {open && (
        <section className={styles.overlay} aria-labelledby={titleId}>
          <div className={styles.card}>
            <button
              type="button"
              className={styles.close}
              onClick={close}
              aria-label="Zapri razglasitev in pokaži lestvico"
            >
              <CloseIcon />
            </button>

            <p className={styles.eyebrow}>Glatlas Game · razglasitev</p>
            <h3 id={titleId} className={styles.title}>
              Zmagovalci so znani
            </h3>
            <p className={styles.lead}>
              Zastonj karto za Glasbeni Atlas 2026 dobijo prvi trije po
              seštevku vseh treh komadov. Čestitke!
            </p>

            {/* V kodi gredo po vrsti 1, 2, 3 — tako jih prebere bralnik
                zaslona; na zaslonu jih CSS postavi v stopničke 2, 1, 3. */}
            <ol className={styles.podium}>
              {winners.map((winner) => (
                <li key={winner.place} className={placeClass[winner.place]}>
                  <span className={styles.player}>
                    <strong>{winner.name}</strong>
                    <small>{winner.score.toLocaleString("sl-SI")} točk</small>
                    <small>{share(winner.rating)}</small>
                  </span>
                  <span className={styles.step}>
                    <span className={styles.place}>
                      {winner.place}
                      <span className="sr-only">. mesto</span>
                    </span>
                    <small>Zastonj karta</small>
                  </span>
                </li>
              ))}
            </ol>

            <button type="button" className={styles.dismiss} onClick={close}>
              Poglej lestvico
            </button>
            <p className={styles.foot}>
              Igra in lestvica ostajata odprti — zaigraš lahko še naprej.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
