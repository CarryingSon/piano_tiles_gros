import { event, organizer, tickets } from "@/data/event";

/**
 * Praktične informacije — samo preverjena dejstva. Javni prevoz/parkiranje
 * in dostopnost namenoma nista navedena, ker nista bila potrjena na virih.
 */
export default function PracticalInfo() {
  const rows: { label: string; value: React.ReactNode }[] = [
    { label: "Datum", value: event.dateLong },
    {
      label: "Ura",
      value: event.doorsTime
        ? `Vrata ${event.doorsTime} · začetek ${event.startTimeHuman}`
        : `Začetek ${event.startTimeHuman}`,
    },
    { label: "Prizorišče", value: event.venue },
    { label: "Kraj", value: event.city },
    { label: "Organizator", value: organizer.name },
    {
      label: "Vstopnice",
      value: `${tickets.priceFromHuman} · ${tickets.provider}`,
    },
  ];

  return (
    <section
      id="informacije"
      aria-labelledby="informacije-naslov"
      className="relative bg-coal py-24 sm:py-32"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid gap-12 md:grid-cols-2 md:gap-16">
          <div>
            <p className="reveal mb-3 text-xs uppercase tracking-[0.3em] text-atlas">
              Informacije
            </p>
            <h2
              id="informacije-naslov"
              className="reveal font-display text-4xl uppercase leading-tight text-white sm:text-6xl"
            >
              Vse, kar rabiš vedeti.
            </h2>

            <dl className="reveal mt-10 divide-y divide-line border-y border-line">
              {rows.map((row) => (
                <div
                  key={row.label}
                  className="flex flex-col gap-1 py-4 sm:flex-row sm:items-baseline sm:gap-6"
                >
                  <dt className="w-40 shrink-0 text-xs uppercase tracking-[0.2em] text-fog">
                    {row.label}
                  </dt>
                  <dd className="font-display text-xl uppercase text-white sm:text-2xl">
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>

            <a
              href={event.mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-8 inline-flex items-center gap-2 text-sm uppercase tracking-widest text-atlas underline underline-offset-4 transition-opacity hover:opacity-80"
            >
              Odpri v Google Zemljevidih
              <span aria-hidden>↗</span>
            </a>
          </div>

          {/* Koordinatna kartica namesto vdelanega zemljevida — brez zunanjih skriptov */}
          <div className="reveal contours relative flex min-h-[320px] flex-col justify-between border border-line bg-night p-8">
            <div className="flex justify-between text-xs uppercase tracking-[0.25em] text-fog">
              <span>{event.coords.lat}</span>
              <span>{event.coords.lng}</span>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-atlas">
                Cilj
              </p>
              <p className="mt-2 font-display text-4xl uppercase leading-[1.05] text-white sm:text-5xl">
                {event.venue}
                <br />
                {event.city}
              </p>
            </div>
            <a
              href={event.mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block w-fit bg-atlas px-5 py-2.5 font-display text-sm uppercase text-night"
            >
              Navodila do prizorišča
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
