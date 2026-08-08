"use client";

import { useCallback, useEffect, useState } from "react";
import { gameConfig, type GameSong } from "@/data/game";
import styles from "./RhythmGame.module.css";

type Entry = {
  id: string;
  name: string;
  songId: string;
  score: number;
  rating: number;
};

type Props = {
  song: GameSong;
  score: number;
  sessionId: string | null;
  breakdown: { perfect: number; good: number; misses: number };
};

export default function Leaderboard({ song, score, sessionId, breakdown }: Props) {
  const [scope, setScope] = useState<"overall" | "song">("overall");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [status, setStatus] = useState("");

  const loadEntries = useCallback(async () => {
    const suffix = scope === "song" ? `?song=${song.id}` : "";
    const response = await fetch(`/api/leaderboard${suffix}`, { cache: "no-store" });
    if (!response.ok) throw new Error("leaderboard");
    const data = (await response.json()) as { entries: Entry[] };
    return data.entries;
  }, [scope, song.id]);

  useEffect(() => {
    let active = true;
    loadEntries()
      .then((nextEntries) => {
        if (active) setEntries(nextEntries);
      })
      .catch(() => {
        if (active) setStatus("Lestvica trenutno ni dosegljiva.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [loadEntries]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!sessionId || submitting || submitted) return;
    setSubmitting(true);
    setStatus("");
    try {
      const response = await fetch("/api/leaderboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          name,
          songId: song.id,
          score,
          ...breakdown,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Rezultata ni mogoče shraniti.");
      setSubmitted(true);
      setStatus("Tvoj rekord je na lestvici.");
      setEntries(await loadEntries());
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Rezultata ni mogoče shraniti.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className={styles.leaderboard} aria-labelledby="leaderboard-title">
      <p className={styles.eyebrow}>Skupni rezultati</p>
      <h2 id="leaderboard-title">Lestvica ritma</h2>
      <div className={styles.boardPrize}>
        <strong>{gameConfig.competition.headline}</strong>
        <span>{gameConfig.competition.note}</span>
      </div>

      {!submitted && (
        <form className={styles.nameForm} onSubmit={submit}>
          <label htmlFor="player-name">Označi svoj rekord z imenom</label>
          <div>
            <input
              id="player-name"
              name="playerName"
              value={name}
              onChange={(event) => setName(event.target.value)}
              minLength={2}
              maxLength={20}
              pattern="[A-Za-zÀ-ž0-9 ._'’\-]+"
              autoComplete="nickname"
              placeholder="Tvoje ime"
              required
              disabled={!sessionId || submitting}
            />
            <button type="submit" disabled={!sessionId || submitting}>
              {submitting ? "Shranjujem …" : "Objavi"}
            </button>
          </div>
          {!sessionId && <small>Rezultat lahko objaviš, ko je skupna baza povezana.</small>}
        </form>
      )}

      {status && <p className={styles.boardStatus} role="status">{status}</p>}

      <div className={styles.boardTabs} role="group" aria-label="Vrsta lestvice">
        <button type="button" aria-pressed={scope === "overall"} onClick={() => { if (scope !== "overall") { setLoading(true); setScope("overall"); } }}>Skupno</button>
        <button type="button" aria-pressed={scope === "song"} onClick={() => { if (scope !== "song") { setLoading(true); setScope("song"); } }}>{song.artist}</button>
      </div>

      {loading ? (
        <p className={styles.boardEmpty}>Nalagam lestvico …</p>
      ) : entries.length === 0 ? (
        <p className={styles.boardEmpty}>Še ni rezultatov. Prvi zapis je lahko tvoj.</p>
      ) : (
        <ol className={styles.boardList}>
          {entries.map((entry, index) => {
            const entrySong = gameConfig.songs.find((item) => item.id === entry.songId);
            return (
              <li key={entry.id} className={scope === "overall" && index < gameConfig.competition.winnerCount ? styles.podium : undefined}>
                <span className={styles.rank}>{String(index + 1).padStart(2, "0")}</span>
                <span className={styles.player}><strong>{entry.name}</strong><small>{entrySong?.artist ?? entry.songId}</small></span>
                <span className={styles.boardScore}><strong>{entry.score}</strong>{scope === "overall" && <small>{index < 3 ? "50 % popust" : `${Math.round(entry.rating / 100)} %`}</small>}</span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
