import Image from "next/image";
import { event, lineup } from "@/data/event";
import styles from "./LineupTicket.module.css";

/* Razredi so izpisani v celoti, ker Tailwind bere izvorno kodo in sestavljenih
   imen razredov (`text-${accent}`) ne bi našel. */
const performerTitleColors: Record<string, string> = {
  Kokosy: "text-kokosy",
  MRFY: "text-mrfy",
  Tabu: "text-atlas",
};

/* Barvna podlaga v barvi zasedbe — enak prijem kot pri serijah vstopnic. */
const performerWash: Record<string, string> = {
  Kokosy: "from-kokosy/20",
  MRFY: "from-mrfy/20",
  Tabu: "from-atlas/20",
};

const performerHoverBorder: Record<string, string> = {
  Kokosy: "hover:border-kokosy/50",
  MRFY: "hover:border-mrfy/50",
  Tabu: "hover:border-atlas/50",
};

/**
 * Zasedba 2026 kot tri vstopnice: zgoraj "plakatni" del s fotografijo in
 * imenom, pod perforacijo pa odtrgljiv kupon z datumom, krajem in črtno kodo.
 * Fotografije skupin so pripravljene iz uradnih kampanjskih materialov 2026;
 * če posamezna slika manjka, kartica še vedno prikaže jasen nadomestni okvir.
 */
export default function Lineup() {
  return (
    <section
      id="izvajalci"
      aria-labelledby="izvajalci-naslov"
      className="relative bg-coal py-24 sm:py-32"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <p className="reveal mb-3 text-xs uppercase tracking-[0.3em] text-atlas">
          Izvajalci · 2026
        </p>
        <h2
          id="izvajalci-naslov"
          className="reveal font-display text-4xl uppercase leading-tight text-white sm:text-6xl"
        >
          Trije razlogi, da si tam.
        </h2>

        <ol className="mt-12 grid gap-5 sm:mt-14 sm:grid-cols-2 lg:grid-cols-3">
          {lineup.map((performer, index) => (
            <li
              key={performer.name}
              className={`reveal group flex flex-col border border-line bg-night transition-transform duration-300 hover:-translate-y-1 ${
                performerHoverBorder[performer.name] ?? "hover:border-white/40"
              } ${styles.ticket}`}
            >
              {/* Glava vstopnice: dogodek levo, zaporedna številka desno. */}
              <div
                className={`bg-gradient-to-b to-transparent px-4 pt-4 ${performerWash[performer.name] ?? "from-white/10"}`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-[10px] uppercase tracking-[0.28em] text-fog">
                    {event.name}
                  </p>
                  <p className="font-display text-[11px] tracking-widest text-fog">
                    {String(index + 1).padStart(2, "0")}/
                    {String(lineup.length).padStart(2, "0")}
                  </p>
                </div>

                <div className="mt-4">
                  {performer.image ? (
                    /* Uradne fotografije imajo okvir in zasuk vpečena v datoteko,
                       zato `object-contain` — `cover` bi jim odrezal rob. */
                    <div className="relative aspect-[4/3] overflow-hidden">
                      <Image
                        src={performer.image}
                        alt={`Uradna fotografija skupine ${performer.name}.`}
                        fill
                        sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 100vw"
                        className="object-contain transition-transform duration-500 group-hover:scale-[1.03]"
                      />
                    </div>
                  ) : (
                    /* Nadomestni okvir — zamenjajte z uradno fotografijo (data/event.ts) */
                    <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden border border-dashed border-atlas/30">
                      <span
                        aria-hidden
                        className="font-display text-[6rem] leading-none text-white/5"
                      >
                        {performer.name.charAt(0)}
                      </span>
                      <span className="absolute bottom-3 left-3 right-3 text-center text-[11px] uppercase tracking-widest text-fog">
                        Uradna fotografija — kmalu
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex-1 px-4 pb-5 pt-4">
                <h3 className="font-display uppercase leading-none">
                  <span
                    className={`text-4xl transition-[filter] group-hover:brightness-125 sm:text-5xl ${performerTitleColors[performer.name] ?? "text-white"}`}
                  >
                    {performer.name}
                  </span>
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-fog">
                  {performer.description}
                </p>
              </div>

              {/* Perforacija — od tu naprej je kupon. */}
              <div className={styles.perf} aria-hidden />

              <div className="flex items-center justify-between gap-3 px-4 pb-4 pt-4">
                <div>
                  <p className="font-display text-sm uppercase tracking-[0.18em] text-white">
                    {event.dateHuman}
                  </p>
                  <p className="mt-1 text-[10px] uppercase tracking-[0.28em] text-fog">
                    {event.city} · {event.startTimeHuman}
                  </p>
                </div>
                <div className={styles.barcode} aria-hidden />
              </div>
            </li>
          ))}
        </ol>

        <p className="reveal mt-8 text-sm text-fog">
          En oder, en večer — vse tri zasedbe.{" "}
          <span className="text-white">10. oktobra v Ivančni Gorici.</span>
        </p>
      </div>
    </section>
  );
}
