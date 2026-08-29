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

            {/* Navpično, ne v vrsti: stolpec je na namizju širok le pol mreže in
                pri dveh povezavah drug ob drugem se dolgi napis prelomi. */}
            <div className="mt-8 flex flex-col gap-6">
              <a
                href={event.mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-fit items-center gap-2 text-sm uppercase tracking-widest text-atlas underline underline-offset-4 transition-opacity hover:opacity-80"
              >
                Odpri v Google Zemljevidih
                <span aria-hidden>↗</span>
              </a>
              <AddToCalendar variant="quiet" />
            </div>
          </div>

          {/* Uradni načrt prizorišča. Naslov »Načrt prizorišča« je odrezan iz
              same slike, ker ga nosi že okvir okoli nje. */}
          <div className="reveal flex flex-col border border-line bg-night">
            <div className="flex items-start justify-between gap-4 border-b border-line p-6 sm:p-8">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-atlas">
                  Načrt prizorišča
                </p>
                {/* Samo prizorišče: `event.venue` že vsebuje ime kraja, zato bi
                    ga vrstica s `city` le podvojila. */}
                <p className="mt-2 font-display text-3xl uppercase leading-[1.05] text-white sm:text-4xl">
                  {event.venue}
                </p>
              </div>
              <p className="shrink-0 text-right text-[11px] uppercase leading-relaxed tracking-[0.2em] text-fog">
                {event.coords.lat}
                <br />
                {event.coords.lng}
              </p>
            </div>

            <Image
              src="/media/nacrt-prizorisca.jpg"
              alt="Načrt prizorišča: oder je na severnem koncu parkirišča, pred njim stojišče, ob levem robu VIP-cona s sedišči in dva šanka, sanitarije ob parkirišču, vhod za obiskovalce pa na jugovzhodni strani ob cesti."
              width={941}
              height={1430}
              sizes="(min-width: 768px) 45vw, 100vw"
              className="h-auto w-full"
            />

            <div className="p-6 sm:p-8">
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
      </div>
    </section>
  );
}
