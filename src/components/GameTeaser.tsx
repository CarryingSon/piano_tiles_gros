"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
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
  entries: LeaderEntry[];
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

/** Delež možnih točk, po katerem se razvrsti skupna lestvica. */
function share(rating: number) {
  return `${Math.round(rating / 100)} %`;
}

export default function GameTeaser() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  /**
   * Odprta lestvica: skupna ali ena od skladb. Kartica se vedno odpre na
   * skupni — na njej visijo brezplačne vstopnice — po skladbah pa se listajo
   * zavihki. Vse vrstice pridejo z istim zahtevkom, zato je preklop trenuten.
   */
  const [tab, setTab] = useState<"overall" | string>("overall");

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
  const openSong = songs.find((song) => song.songId === tab) ?? null;

  return (
    <section className={styles.section} aria-labelledby="igra-naslov">
      <div className={styles.inner}>
        <div className={styles.intro}>
          <p className={styles.kicker}>Skupni leaderboard · v živo</p>
          <h2 id="igra-naslov" className={styles.title}>
            Glatlas Game
          </h2>
          <p className={styles.subtitle}>
            Zastonj karte za najboljše tri igralce
          </p>
          <p className={styles.copy}>
            Skupna lestvica deli karte, po zavihkih pa vidiš vsak komad zase.
          </p>
        </div>

        <div className={styles.board} aria-busy={summary === null}>
          <div className={styles.boardHeader}>
            <div>
              <span>Glasbeni Atlas 2026</span>
              <h3>{openSong ? openSong.band : "Skupna lestvica"}</h3>
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
              <div className={styles.tabs} role="group" aria-label="Vrsta lestvice">
                <button
                  type="button"
                  aria-pressed={tab === "overall"}
                  onClick={() => setTab("overall")}
                >
                  Skupno
                </button>
                {songs.map((song) => (
                  <button
                    key={song.songId}
                    type="button"
                    aria-pressed={tab === song.songId}
                    /* Odprti zavihek gori v barvi svojega benda. */
                    style={{ "--tab-color": song.color } as CSSProperties}
                    onClick={() => setTab(song.songId)}
                  >
                    {song.band}
                  </button>
                ))}
              </div>

              {openSong ? (
                <>
                  <p className={styles.groupLabel}>{openSong.title}</p>
                  {openSong.entries.length === 0 ? (
                    <p className={styles.empty} role="status">
                      Ta komad še čaka na prvega igralca.
                    </p>
                  ) : (
                    <ol className={styles.list}>
                      {openSong.entries.map((entry, index) => (
                        <li
                          key={entry.id}
                          className={index === 0 ? styles.leader : undefined}
                        >
                          <span className={styles.rank}>
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          <span className={styles.player}>
                            <strong>{entry.name}</strong>
                          </span>
                          <span className={styles.score}>
                            <strong>{entry.score.toLocaleString("sl-SI")}</strong>
                            <small>{share(entry.rating)} možnih</small>
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                </>
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
                          {/* Razvrsti delež možnih točk, ne same točke: komadi
                              nimajo enakega stropa. Zato stoji delež ob njih. */}
                          <span className={styles.score}>
                            <strong>{entry.score.toLocaleString("sl-SI")}</strong>
                            <small>{share(entry.rating)} možnih</small>
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                </>
              )}
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
