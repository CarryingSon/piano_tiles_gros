"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "./GameTeaser.module.css";

type LeaderEntry = {
  id: string;
  name: string;
  rating: number;
  score: number;
};

type SongLeader = {
  songId: string;
  band: string;
  title: string;
  /** Barva izvajalca iz `data/game.ts` — pride s strežnika, da domači strani
      ni treba naložiti celotnega modula z notami. */
  color: string;
  entry: LeaderEntry | null;
};

type Summary = {
  overall: LeaderEntry[];
  songs: SongLeader[];
};

/** Prvi trije po skupnem seštevku dobijo brezplačno vstopnico. */
const medals = [
  { label: "Zlato", className: "gold" },
  { label: "Srebro", className: "silver" },
  { label: "Bron", className: "bronze" },
] as const;

export default function GameTeaser() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/leaderboard/leaders", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error("leaderboard");
        return response.json() as Promise<Summary>;
      })
      .then(setSummary)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setUnavailable(true);
      });

    return () => controller.abort();
  }, []);

  const overall = summary?.overall ?? [];
  const songs = summary?.songs ?? [];

  return (
    <section className={styles.section} aria-labelledby="igra-naslov">
      <div className={styles.inner}>
        <div className={styles.intro}>
          <p className={styles.kicker}>Skupni leaderboard · v živo</p>
          <h2 id="igra-naslov" className={styles.title}>
            Kdo vodi ritem?
          </h2>
          <p className={styles.copy}>
            <strong>Zastonj karte za najboljše tri igralce.</strong> Ena
            skupna lestvica za vse tri komade — vsak rezultat je preračunan na
            največ 10.000 skupnih točk.
          </p>
        </div>

        <div className={styles.board} aria-busy={summary === null}>
          <div className={styles.boardHeader}>
            <div>
              <span>Glasbeni Atlas 2026</span>
              <h3>Skupna lestvica</h3>
            </div>
            <span className={styles.live}>
              <i aria-hidden /> V živo
            </span>
          </div>

          {!summary ? (
            <p className={styles.empty} role="status">
              {unavailable
                ? "Lestvica trenutno ni dosegljiva."
                : "Nalagam lestvico …"}
            </p>
          ) : (
            <>
              <p className={styles.groupLabel}>
                Skupno · <span>zastonj karta</span>
              </p>
              {overall.length === 0 ? (
                <p className={styles.empty} role="status">
                  Prvo mesto še čaka na svojega igralca.
                </p>
              ) : (
                <ol className={styles.list}>
                  {overall.map((entry, index) => (
                    <li
                      key={entry.id}
                      className={`${styles.medalRow} ${styles[medals[index].className]}`}
                    >
                      <span className={styles.rank} aria-hidden />
                      <span className={styles.player}>
                        <strong>{entry.name}</strong>
                        <small>{medals[index].label} · zastonj karta</small>
                      </span>
                      <span className={styles.score}>
                        <strong>{entry.rating.toLocaleString("sl-SI")}</strong>
                        <small>točk</small>
                      </span>
                    </li>
                  ))}
                </ol>
              )}

              <p className={styles.groupLabel}>Vodilni po skladbah</p>
              <ol className={styles.list}>
                {songs.map((song) => (
                  <li key={song.songId} className={styles.songRow}>
                    <span className={styles.songName} style={{ color: song.color }}>
                      {song.band}
                    </span>
                    <span className={styles.player}>
                      <strong>{song.entry ? song.entry.name : "Še nihče"}</strong>
                      <small>{song.title}</small>
                    </span>
                    <span className={styles.score}>
                      <strong>
                        {song.entry
                          ? song.entry.score.toLocaleString("sl-SI")
                          : "—"}
                      </strong>
                      <small>točk</small>
                    </span>
                  </li>
                ))}
              </ol>
            </>
          )}

          <Link href="/igra" className={styles.cta}>
            Zaigraj in se uvrsti <span aria-hidden>↗</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
