import {
  tickets,
  ticketTiers,
  ticketTiersNote,
  type TicketTierStatus,
} from "@/data/event";

/**
 * Stanje prodaje vstopnic po kategorijah. Razprodane serije namenoma ostanejo
 * na seznamu: obiskovalcu povedo, da cene rastejo in da se splača pohiteti.
 *
 * Vsebina se ureja v `data/event.ts` (`ticketTiers`) — Eventim nima javnega
 * API-ja in zavrača strežniške zahtevke, zato samodejnega branja stanja ni.
 */

const statusLabels: Record<TicketTierStatus, string> = {
  soldOut: "Razprodano",
  onSale: "V prodaji",
  upcoming: "Kmalu",
};

const statusStyles: Record<TicketTierStatus, string> = {
  soldOut: "border-line text-fog",
  onSale: "border-atlas bg-atlas text-night",
  upcoming: "border-line text-fog",
};

export default function Tickets() {
  return (
    <section
      id="vstopnice"
      aria-labelledby="vstopnice-naslov"
      className="relative border-y border-line bg-night py-16 sm:py-20"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <p className="reveal mb-3 text-xs uppercase tracking-[0.3em] text-atlas">
          Vstopnice
        </p>
        <h2
          id="vstopnice-naslov"
          className="reveal font-display text-3xl uppercase leading-tight text-white sm:text-4xl"
        >
          Kje smo s prodajo.
        </h2>

        <ul className="reveal mt-8 divide-y divide-line border-y border-line">
          {ticketTiers.map((tier) => {
            const soldOut = tier.status === "soldOut";
            return (
              <li
                key={tier.name}
                className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-5"
              >
                <div className={soldOut ? "opacity-50" : undefined}>
                  <p className="font-display text-xl uppercase text-white sm:text-2xl">
                    {tier.name}
                  </p>
                  {tier.note && (
                    <p className="mt-1 text-sm text-fog">{tier.note}</p>
                  )}
                </div>

                <div className="flex items-center gap-4">
                  {tier.priceHuman && (
                    <span
                      className={`font-display text-xl uppercase sm:text-2xl ${
                        soldOut ? "text-fog line-through" : "text-white"
                      }`}
                    >
                      {tier.priceHuman}
                    </span>
                  )}
                  <span
                    className={`border px-3 py-1 text-[0.65rem] uppercase tracking-[0.2em] ${statusStyles[tier.status]}`}
                  >
                    {statusLabels[tier.status]}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>

        {ticketTiersNote && (
          <p className="reveal mt-4 text-sm text-fog">{ticketTiersNote}</p>
        )}

        <div className="reveal mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
          <a
            href={tickets.eventUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-atlas px-8 py-4 font-display text-lg uppercase tracking-wide text-night transition-transform hover:-translate-y-0.5"
          >
            Kupi karto
          </a>
          <p className="text-sm text-fog">
            {tickets.priceFromHuman} · prodajo vodi {tickets.provider}
          </p>
        </div>
      </div>
    </section>
  );
}
