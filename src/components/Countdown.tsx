"use client";

import { useEffect, useState } from "react";
import { event } from "@/data/event";

/**
 * Odštevanje do začetka Glasbenega Atlasa.
 *
 * Strežnik ne more poznati ure obiskovalca, zato se ob prvem izrisu prikažejo
 * pomišljaji in šele po priklopu (mount) prave številke — brez neskladja pri
 * hidraciji in brez skoka postavitve, ker so mesta števk enako široka.
 */

const target = new Date(event.startIso).getTime();

type Remaining = { days: number; hours: number; minutes: number; seconds: number };

function remainingFrom(now: number): Remaining | null {
  const diff = target - now;
  if (diff <= 0) return null;

  const totalSeconds = Math.floor(diff / 1000);
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

type Forms = readonly [string, string, string, string];

/** Slovenska dvojina in množina: 1 dan, 2 dneva, 3 dnevi, 5 dni. */
function plural(value: number, forms: Forms) {
  const mod100 = value % 100;
  if (mod100 === 1) return forms[0];
  if (mod100 === 2) return forms[1];
  if (mod100 === 3 || mod100 === 4) return forms[2];
  return forms[3];
}

const units = [
  { key: "days", forms: ["dan", "dneva", "dnevi", "dni"] },
  { key: "hours", forms: ["ura", "uri", "ure", "ur"] },
  { key: "minutes", forms: ["minuta", "minuti", "minute", "minut"] },
  { key: "seconds", forms: ["sekunda", "sekundi", "sekunde", "sekund"] },
] as const;

export default function Countdown() {
  const [remaining, setRemaining] = useState<Remaining | null>(null);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const tick = () => {
      const next = remainingFrom(Date.now());
      setRemaining(next);
      setStarted(next === null);
    };

    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  const screenReaderText = remaining
    ? `Do začetka je še ${remaining.days} ${plural(remaining.days, ["dan", "dneva", "dnevi", "dni"])} in ${remaining.hours} ${plural(remaining.hours, ["ura", "uri", "ure", "ur"])}.`
    : started
      ? "Glasbeni Atlas 2026 se je začel."
      : "Odštevanje se nalaga.";

  return (
    <section
      id="odstevanje"
      aria-labelledby="odstevanje-naslov"
      className="contours relative border-y border-line bg-night py-20 sm:py-28"
    >
      <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6">
        <p className="reveal mb-3 text-xs uppercase tracking-[0.3em] text-atlas">
          Odštevanje
        </p>
        <h2
          id="odstevanje-naslov"
          className="reveal max-w-3xl font-display text-4xl uppercase leading-[1.1] text-white sm:text-6xl"
        >
          {started ? (
            <>
              Atlas je <span className="text-atlas">tukaj.</span>
            </>
          ) : (
            <>
              Do Glasbenega Atlasa{" "}
              <span className="text-atlas">je še tole.</span>
            </>
          )}
        </h2>

        {/* Povzetek za bralnike zaslona. Namenoma NI živo področje (aria-live):
            vsebina se osvežuje vsako sekundo in bi jo bralnik brez konca bral. */}
        <p className="sr-only">{screenReaderText}</p>

        {started ? (
          <p className="reveal mt-10 max-w-xl text-lg leading-relaxed text-fog">
            Odštevanja je konec —{" "}
            <span className="text-white">se vidimo pod odrom.</span>
          </p>
        ) : (
          <ol
            aria-hidden
            className="reveal mt-10 grid grid-cols-2 gap-px border border-line bg-line sm:mt-14 sm:grid-cols-4"
          >
            {units.map((unit) => {
              const value = remaining?.[unit.key];
              return (
                <li
                  key={unit.key}
                  className="flex flex-col items-center gap-1 bg-coal px-4 py-8 sm:py-12"
                >
                  <span className="font-display text-6xl leading-none text-white tabular-nums sm:text-7xl lg:text-8xl">
                    {value === undefined
                      ? "––"
                      : String(value).padStart(2, "0")}
                  </span>
                  <span className="text-xs uppercase tracking-[0.25em] text-fog">
                    {value === undefined
                      ? unit.forms[3]
                      : plural(value, unit.forms)}
                  </span>
                </li>
              );
            })}
          </ol>
        )}

        <p className="reveal mt-8 text-sm text-fog">
          {event.dateLong} · {event.startTimeHuman} ·{" "}
          <span className="text-white">
            {event.venue}, {event.city}
          </span>
        </p>
      </div>
    </section>
  );
}
