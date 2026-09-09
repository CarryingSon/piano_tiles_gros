import Image from "next/image";
import AddToCalendar from "@/components/AddToCalendar";
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
    /* Kraj je izpuščen: "Parkirišče Ivančna Gorica" pove oboje. */
    { label: "Prizorišče", value: event.venue },
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

            {/* Vstopnice levo, pot desno: prvo je nakup, drugo je "kako pridem
                tja". Na telefonu se postavita drug pod drugega. */}
            <div className="mt-8 flex flex-col gap-6">
              <div className="flex flex-wrap gap-3">
                <a
                  href={tickets.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-xl bg-atlas px-5 py-2.5 font-display text-sm uppercase text-night transition-transform hover:-translate-y-0.5"
                >
                  Vstopnice na Eventimu
                </a>
                <a
                  href={event.mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-xl border border-atlas/60 px-5 py-2.5 font-display text-sm uppercase text-atlas transition-colors hover:border-atlas hover:bg-atlas hover:text-night"
                >
                  Navodila do prizorišča
                </a>
              </div>
              <AddToCalendar variant="quiet" />
            </div>
          </div>

          {/* Uradni načrt prizorišča. Naslov »Načrt prizorišča« je odrezan iz
              same slike, ker ga nosi že okvir okoli nje. */}
          <div className="reveal flex flex-col border border-line bg-night">
            {/* Brez imena prizorišča: stoji že v tabeli levo, tik ob tem okvirju. */}
            <div className="flex items-center justify-between gap-4 border-b border-line px-6 py-4 sm:px-8">
              <p className="text-xs uppercase tracking-[0.3em] text-atlas">
                Načrt prizorišča
              </p>
              <p className="shrink-0 text-right text-[11px] uppercase tracking-[0.2em] text-fog">
                {event.coords.lat} · {event.coords.lng}
              </p>
            </div>

            {/* Načrt gre od roba do roba okvirja, brez črnega pasu okoli sebe:
                omejena in na sredino poravnana slika je puščala prazen rob, ki
                je bral kot napaka v postavitvi. Načrt je zdaj tako velik, kot
                je okvir — tudi tisti, ki ga bere na telefonu, dobi vse napise. */}
            <Image
              src="/media/nacrt-prizorisca-2.webp"
              alt="Načrt prizorišča: oder stoji na severnem koncu parkirišča, pred njim je osvetljeno stojišče z mestom za tehniko na sredini. Ob levem robu so VIP-cona s sedišči, šank in stojnica Smash Burger z drugim šankom, sanitarije so južno od stojišča, vhod za obiskovalce pa na jugovzhodni strani ob cesti."
              width={1086}
              height={1448}
              sizes="(min-width: 768px) 45vw, 100vw"
              className="h-auto w-full"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
