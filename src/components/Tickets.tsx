import {
  tickets,
  ticketTiers,
  ticketTiersNote,
  type TicketTier,
  type TicketTierAccent,
} from "@/data/event";

/**
 * Serije vstopnic kot kartice: ena vrstica na serijo, z barvo in vrstnim redom
 * z organizatorjevega plakata. Razprodane in še nedostopne serije namenoma
 * ostanejo vidne — obiskovalcu povedo, da cena z vsako serijo naraste.
 *
 * Vsebina se ureja v `data/event.ts` (`ticketTiers`); Eventim nima javnega
 * API-ja in zavrača strežniške zahtevke, zato samodejnega branja stanja ni.
 */

/* Razredi so izpisani v celoti, ker Tailwind bere izvorno kodo in sestavljenih
   imen razredov (`text-${accent}`) ne bi našel. */
const accentText: Record<TicketTierAccent, string> = {
  white: "text-white",
  kokosy: "text-kokosy",
  atlas: "text-atlas",
  mrfy: "text-mrfy",
};

const accentBorder: Record<TicketTierAccent, string> = {
  white: "border-white/50",
  kokosy: "border-kokosy/60",
  atlas: "border-atlas/60",
  mrfy: "border-mrfy/60",
};

/* Barvna podlaga v barvi serije. Aktivna je izrazitejša, da izstopa iz
   seznama; zaklenjene in razprodane so komaj nakazane. */
const accentWashActive: Record<TicketTierAccent, string> = {
  white: "from-white/20",
  kokosy: "from-kokosy/25",
  atlas: "from-atlas/25",
  mrfy: "from-mrfy/25",
};

const accentWashMuted: Record<TicketTierAccent, string> = {
  white: "from-white/8",
  kokosy: "from-kokosy/10",
  atlas: "from-atlas/10",
  mrfy: "from-mrfy/10",
};

function TicketIcon({ className }: { className?: string }) {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden className={className}>
      <path
        d="M3 8.5A1.5 1.5 0 0 1 4.5 7h19A1.5 1.5 0 0 1 25 8.5v2.2a3.3 3.3 0 0 0 0 6.6v2.2a1.5 1.5 0 0 1-1.5 1.5h-19A1.5 1.5 0 0 1 3 19.5v-2.2a3.3 3.3 0 0 0 0-6.6V8.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path d="M17 8.5v11" stroke="currentColor" strokeWidth="1.6" strokeDasharray="2 3" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden className="shrink-0">
      <rect x="2.5" y="6" width="9" height="6.5" rx="1.2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M4.75 6V4.25a2.25 2.25 0 0 1 4.5 0V6" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

/** Poševen žig čez razprodano serijo — kot odtisnjen na natisnjen cenik. */
function SoldOutStamp() {
  return (
    /* Na telefonu žig sedi v spodnji desni kot — tam, kjer bi bil pri
       dostopni seriji gumb — sicer bi prekril opis serije. Na širši kartici
       je sredina prazna in žig lahko stoji čeznjo. */
    <span className="pointer-events-none absolute inset-0 flex items-end justify-end p-4 sm:items-center sm:justify-center sm:p-0">
      <span className="-rotate-[7deg] border-[3px] border-[#e2483d]/70 px-4 py-1 font-display text-lg uppercase tracking-[0.12em] text-[#e2483d]/85 sm:px-6 sm:py-1.5 sm:text-3xl">
        Razprodano
      </span>
    </span>
  );
}

function TierCard({ tier }: { tier: TicketTier }) {
  const available = tier.status === "onSale";
  const soldOut = tier.status === "soldOut";

  return (
    <li
      className={`relative flex flex-col gap-4 overflow-hidden border bg-gradient-to-r to-transparent p-4 sm:flex-row sm:items-center sm:gap-6 sm:p-5 ${
        available
          ? `${accentBorder[tier.accent]} ${accentWashActive[tier.accent]}`
          : `border-line ${accentWashMuted[tier.accent]}`
      }`}
    >
      {/* Na telefonu ime in cena ne moreta v isto vrstico: ime serije bi se
          lomilo v tri vrstice, pojasnilo pa v pet. Zato se spodnja vrstica s
          ceno in dejanjem od `sm:` navzgor prestavi v desno. */}
      <div className="flex items-start gap-4 sm:flex-1">
        <span
          className={`mt-0.5 shrink-0 ${accentText[tier.accent]} ${available ? "" : "opacity-40"}`}
        >
          <TicketIcon />
        </span>
        <div className={`min-w-0 ${available ? "" : "opacity-50"}`}>
          <p
            className={`font-display text-xl uppercase leading-tight sm:text-2xl ${accentText[tier.accent]}`}
          >
            {tier.name}
          </p>
          {tier.note && (
            <p className="mt-1 text-sm leading-snug text-fog">{tier.note}</p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 border-t border-line pt-4 sm:shrink-0 sm:justify-end sm:gap-6 sm:border-0 sm:pt-0">
        <span
          className={`font-display text-2xl uppercase sm:text-3xl ${
            soldOut
              ? "text-fog line-through"
              : available
                ? "text-white"
                : "text-fog"
          }`}
        >
          {tier.priceHuman}
        </span>

        {soldOut ? null : available ? (
          <a
            href={tickets.eventUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-atlas px-5 py-2.5 font-display text-sm uppercase tracking-wide text-night transition-transform hover:-translate-y-0.5 sm:px-6 sm:py-3 sm:text-base"
          >
            Kupi karto
          </a>
        ) : (
          <span className="inline-flex items-center gap-2 border border-line px-4 py-2.5 text-[0.65rem] uppercase tracking-[0.2em] text-fog sm:py-3">
            <LockIcon />
            Zaklenjeno
          </span>
        )}
      </div>

      {soldOut && <SoldOutStamp />}
    </li>
  );
}

export default function Tickets() {
  return (
    <section
      id="vstopnice"
      aria-labelledby="vstopnice-naslov"
      className="relative border-y border-line bg-night py-16 sm:py-20"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Brez rumene nadpisne vrstice: naslov je zdaj ista beseda in bi se
            ponovila drugo pod drugo. */}
        <h2
          id="vstopnice-naslov"
          className="reveal font-display text-3xl uppercase leading-tight text-white sm:text-4xl"
        >
          Vstopnice
        </h2>

        <ul className="reveal mt-8 grid gap-3">
          {ticketTiers.map((tier) => (
            <TierCard key={tier.name} tier={tier} />
          ))}
        </ul>

        {ticketTiersNote && (
          <p className="reveal mt-4 text-sm text-fog">{ticketTiersNote}</p>
        )}
      </div>
    </section>
  );
}
