"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "./GameTeaser.module.css";

type LeaderboardEntry = {
  id: string;
  name: string;
  rating: number;
};

export default function GameTeaser() {
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/leaderboard", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error("leaderboard");
        return response.json() as Promise<{ entries: LeaderboardEntry[] }>;
      })
      .then((data) => setEntries(data.entries.slice(0, 5)))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setUnavailable(true);
        setEntries([]);
      });

    return () => controller.abort();
  }, []);

  return (
    <section className={styles.section} aria-labelledby="igra-naslov">
      <div className={styles.inner}>
        <div className={styles.intro}>
          <p className={styles.kicker}>Skupni leaderboard · v živo</p>
          <h2 id="igra-naslov" className={styles.title}>
            Kdo vodi ritem?
          </h2>
          <p className={styles.copy}>
            Ena skupna lestvica za vse tri komade. Vsak rezultat je preračunan
            na največ 10.000 skupnih točk.
          </p>
        </div>

        <div className={styles.board} aria-busy={entries === null}>
          <div className={styles.boardHeader}>
            <div>
              <span>Glasbeni Atlas 2026</span>
              <h3>Skupna lestvica</h3>
            </div>
            <span className={styles.live}>
              <i aria-hidden /> V živo
            </span>
          </div>

          {entries === null ? (
            <p className={styles.empty} role="status">
              Nalagam lestvico …
            </p>
          ) : entries.length === 0 ? (
            <p className={styles.empty} role="status">
              {unavailable
                ? "Lestvica trenutno ni dosegljiva."
                : "Prvo mesto še čaka na svojega igralca."}
            </p>
          ) : (
            <ol className={styles.list}>
              {entries.map((entry, index) => (
                <li
                  key={entry.id}
                  className={index === 0 ? styles.leader : undefined}
                >
                  <span className={styles.rank}>
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className={styles.player}>
                    <strong>{entry.name}</strong>
                    <small>{index === 0 ? "Trenutno vodi" : "Skupni rezultat"}</small>
                  </span>
                  <span className={styles.score}>
                    <strong>{entry.rating.toLocaleString("sl-SI")}</strong>
                    <small>točk</small>
                  </span>
                </li>
              ))}
            </ol>
          )}

          <Link href="/igra" className={styles.cta}>
            Zaigraj in se uvrsti <span aria-hidden>↗</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
