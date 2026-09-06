"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { gameConfig, type GameSong, type SongId } from "@/data/game";
import styles from "./RhythmGame.module.css";

type Entry = {
  id: string;
  name: string;
  /** V skupni lestvici `null`: vrstica je seštevek in ne pripada enemu komadu. */
  songId: string | null;
  /** Koliko komadov je v seštevku; v komadovi lestvici vedno 1. */
  songCount: number;
  score: number;
  rating: number;
};

type Props = {
  song: GameSong;
  score: number;
  sessionId: string | null;
  breakdown: { perfect: number; good: number; misses: number };
};

/** Zlato, srebro in bron za prve tri po skupnem seštevku. */
const medalClass = [styles.gold, styles.silver, styles.bronze];

/** "1 komad", "2 komada", "3 komadi" — koliko jih igralec ima v seštevku. */
const SONG_WORDS = ["komadov", "komad", "komada", "komadi"];

function songsPhrase(count: number) {
  return `${count} ${SONG_WORDS[count] ?? "komadov"} v seštevku`;
}

/**
 * Katera lestvica je odprta: skupna (seštevek vseh treh komadov, ta deli
 * vstopnice) ali ena od komadovih. Vedno se odpre skupna — nagrada visi na njej — po
 * zavihkih pa se da stopiti v posamezen komad, tudi v tistega, ki ga igralec
 * ravnokar ni igral.
 */
type Scope = "overall" | SongId;

export default function Leaderboard({ song, score, sessionId, breakdown }: Props) {
  const [scope, setScope] = useState<Scope>("overall");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  /**
   * Okno za oddajo se odpre samo od sebe, takoj ko je konec kroga — takrat je
   * rezultat še svež in igralec ga ima pred očmi. Kdor ga zapre, ga lahko z
   * gumbom pod lestvico odpre nazaj. Pri nič točkah (tap v prazno takoj na
   * začetku) se ne odpre samo: prazen vnos na lestvici ni nikomur v korist.
   */
  const [formOpen, setFormOpen] = useState(sessionId !== null && score > 0);
  /**
   * Vmesno vprašanje pred zapiranjem obrazca. Krog je odigran samo enkrat —
   * kdor okno zapre po nesreči, rezultata ne more več oddati, zato gre vsako
   * zapiranje (gumb, klik mimo, Escape) najprej skozi potrditev.
   */
  const [confirmSkip, setConfirmSkip] = useState(false);
  const nameFieldRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [status, setStatus] = useState("");

  const loadEntries = useCallback(async () => {
    const suffix = scope === "overall" ? "" : `?song=${scope}`;
    const response = await fetch(`/api/leaderboard${suffix}`, { cache: "no-store" });
    if (!response.ok) throw new Error("leaderboard");
    const data = (await response.json()) as { entries: Entry[] };
    return data.entries;
  }, [scope]);

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

  /** Preklop zavihka: seznam se osveži prek `loadEntries`, ki visi na `scope`. */
  const show = (next: Scope) => {
    if (next === scope) return;
    setLoading(true);
    setScope(next);
  };

  /** Zapri brez oddaje — šele ko je igralec to potrdil. */
  const discard = useCallback(() => {
    setConfirmSkip(false);
    setFormOpen(false);
  }, []);

  useEffect(() => {
    if (!formOpen) return;
    const onKey = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key !== "Escape") return;
      // Prvi Escape odpre vprašanje, drugi se vrne k obrazcu; zapre ga samo
      // gumb v vprašanju.
      setConfirmSkip((asking) => !asking);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [formOpen]);

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
          email,
          songId: song.id,
          score,
          ...breakdown,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Rezultata ni mogoče shraniti.");
      setSubmitted(true);
      setConfirmSkip(false);
      setFormOpen(false);
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
        <span>{gameConfig.competition.basis} {gameConfig.competition.note}</span>
      </div>

      {!submitted && (
        formOpen ? (
          /* Pop-up z oddajo: leži čez zaključni zaslon, dokler ga igralec ne
             odda ali zapre. */
          <div
            className={styles.submitBackdrop}
            role="dialog"
            aria-modal="true"
            aria-labelledby="submit-title"
            onClick={() => setConfirmSkip(true)}
          >
            <form
              className={styles.submitCard}
              onSubmit={submit}
              onClick={(clickEvent) => clickEvent.stopPropagation()}
            >
              <p className={styles.submitEyebrow}>Konec kroga</p>
              <h3 id="submit-title">Objavi svoj rezultat</h3>
              <p className={styles.submitLead}>
                … in se poteguj za brezplačno vstopnico.
              </p>
              <p className={styles.submitScore}>
                <strong>{score.toLocaleString("sl-SI")}</strong>
                <span>točk · {song.artist}</span>
              </p>

              <label htmlFor="player-name">Ime na lestvici</label>
              <input
                id="player-name"
                name="playerName"
                ref={nameFieldRef}
                value={name}
                onChange={(event) => setName(event.target.value)}
                minLength={2}
                maxLength={20}
                pattern="[A-Za-zÀ-ž0-9 ._'’\-]+"
                autoComplete="nickname"
                placeholder="Tvoje ime"
                autoFocus
                required
                disabled={!sessionId || submitting}
              />

              <label htmlFor="player-email">E-naslov</label>
              <input
                id="player-email"
                name="playerEmail"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                maxLength={160}
                autoComplete="email"
                placeholder="ti@primer.si"
                required
                disabled={!sessionId || submitting}
              />
              <small className={styles.submitNote}>
                <strong>Igralca prepoznamo po e-naslovu.</strong> Krogi, oddani
                z istim e-naslovom, so en igralec in se seštejejo v skupno
                lestvico — tudi če vsakič vpišeš drugo ime. Pri vsakem komadu
                torej vpiši istega. E-naslova ne objavimo; brez njega rezultata
                ne moremo sešteti niti ti poslati karte.
              </small>

              {status && <p className={styles.submitError} role="status">{status}</p>}

              <div className={styles.submitActions}>
                <button type="submit" disabled={!sessionId || submitting}>
                  {submitting ? "Objavljam …" : "Objavi rezultat"}
                </button>
                <button
                  type="button"
                  className={styles.submitSkip}
                  onClick={() => setConfirmSkip(true)}
                >
                  Ne, hvala
                </button>
              </div>
              {!sessionId && (
                <small>Rezultat lahko objaviš, ko je skupna baza povezana.</small>
              )}
            </form>

            {/* Manjše okno čez obrazec: krog je odigran enkrat, zato zapiranje
                brez oddaje potrdimo. Obrazec spodaj ostane izpolnjen. */}
            {confirmSkip && (
              <div
                className={styles.confirmBackdrop}
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="confirm-title"
                onClick={(clickEvent) => clickEvent.stopPropagation()}
              >
                <div className={styles.confirmCard}>
                  <h4 id="confirm-title">Ste prepričani, da ne želite shraniti rezultata?</h4>
                  <p>
                    Krog se odigra enkrat: neshranjen rezultat ne gre na
                    lestvico in ne šteje v seštevek za brezplačno karto.
                  </p>
                  <div className={styles.confirmActions}>
                    <button type="button" onClick={() => setConfirmSkip(false)}>
                      Vrni se in shrani
                    </button>
                    <button
                      type="button"
                      className={styles.confirmDiscard}
                      onClick={discard}
                    >
                      Ne shrani rezultata
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <button
            type="button"
            className={styles.submitReopen}
            onClick={() => setFormOpen(true)}
            disabled={!sessionId}
          >
            Objavi svoj rezultat na lestvico
          </button>
        )
      )}

      {status && !formOpen && (
        <p className={styles.boardStatus} role="status">{status}</p>
      )}

      <div className={styles.boardTabs} role="group" aria-label="Vrsta lestvice">
        <button
          type="button"
          aria-pressed={scope === "overall"}
          onClick={() => show("overall")}
        >
          Skupno
        </button>
        {gameConfig.songs.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={scope === item.id}
            /* Aktivni zavihek nosi barvo svojega benda, skupni pa atlasovo rumeno. */
            style={{ "--tab-color": item.baseColor } as React.CSSProperties}
            onClick={() => show(item.id)}
          >
            {item.band}
          </button>
        ))}
      </div>

      {loading ? (
        <p className={styles.boardEmpty}>Nalagam lestvico …</p>
      ) : entries.length === 0 ? (
        <p className={styles.boardEmpty}>Še ni rezultatov. Prvi zapis je lahko tvoj.</p>
      ) : (
        <ol className={styles.boardList}>
          {entries.map((entry, index) => {
            // Kolajne in nagrada visijo na skupni lestvici; komadova je le
            // razvrstitev po točkah, zato tam ni ne podija ne pripisa nagrade.
            const overall = scope === "overall";
            const winner = overall && index < gameConfig.competition.winnerCount;
            const classes = [
              winner ? styles.podium : "",
              overall ? medalClass[index] ?? "" : "",
            ].filter(Boolean).join(" ");
            return (
              <li key={entry.id} className={classes || undefined}>
                <span className={styles.rank}>{String(index + 1).padStart(2, "0")}</span>
                <span className={styles.player}>
                  <strong>{entry.name}</strong>
                  {/* V skupni lestvici pove, koliko komadov je v seštevku —
                      trije so poln komplet. V komadovi je bend povsod isti,
                      zato tam stoji natančnost. */}
                  <small>
                    {overall
                      ? songsPhrase(entry.songCount)
                      : `${Math.round(entry.rating / 100)} % možnih točk`}
                  </small>
                </span>
                <span className={styles.boardScore}>
                  <strong>{entry.score.toLocaleString("sl-SI")}</strong>
                  {overall && (
                    <small>
                      {winner
                        ? gameConfig.competition.prizeLabel
                        : `${Math.round(entry.rating / 100)} %`}
                    </small>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
