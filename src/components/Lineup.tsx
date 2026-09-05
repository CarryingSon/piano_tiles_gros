import Image from "next/image";
import { lineup } from "@/data/event";

const performerTitleColors: Record<string, string> = {
  Kokosy: "text-kokosy",
  MRFY: "text-mrfy",
  Tabu: "text-atlas",
};

/**
 * Zasedba 2026 kot legenda zemljevida: tri kartice v eni vrsti.
 * Fotografije skupin so pripravljene iz uradnih kampanjskih materialov 2026;
 * če posamezna slika manjka, komponenta še vedno prikaže jasen nadomestni okvir.
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

        {/* Kartice namesto treh visokih vrstic: cela zasedba se vidi naenkrat
            in sekcija zasede približno tretjino prejšnje višine. Fotografije
            imajo okvir in zasuk vpečena v datoteko, zato jih v okvir vstavimo
            z `object-contain` — `cover` bi jim odrezal rob. */}
        <ol className="mt-12 grid gap-4 sm:mt-14 sm:grid-cols-2 lg:grid-cols-3">
          {lineup.map((performer) => (
            <li
              key={performer.name}
              className="reveal group flex flex-col border border-line bg-night p-4 transition-colors hover:border-atlas/40"
            >
              {performer.image ? (
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

              <h3 className="mt-5 font-display uppercase leading-none">
                <span
                  className={`text-4xl transition-[filter] group-hover:brightness-125 sm:text-5xl ${performerTitleColors[performer.name] ?? "text-white"}`}
                >
                  {performer.name}
                </span>
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-fog">
                {performer.description}
              </p>
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
