import Image from "next/image";
import { lineup } from "@/data/event";

const performerTitleColors: Record<string, string> = {
  Kokosy: "text-kokosy",
  MRFY: "text-mrfy",
  Tabu: "text-atlas",
};

/**
 * Zasedba 2026 kot legenda zemljevida: tri velike tipografske vrstice.
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

        <ol className="mt-14 divide-y divide-line border-y border-line">
          {lineup.map((performer, index) => {
            /* Vrstice se izmenjujejo: pri vsaki drugi zasedbi (MRFY) je
               fotografija levo, ime pa desno — da seznam ne teče v enem samem
               ritmu. Na telefonu vrstni red ostane ime → fotografija. */
            const photoFirst = index % 2 === 1;
            return (
              <li key={performer.name} className="reveal group py-10 sm:py-12">
                <div className="grid items-center gap-8 md:grid-cols-12">
                  <div className="md:col-span-7">
                    <h3 className="font-display uppercase leading-none">
                      <span
                        className={`text-6xl transition-[filter] group-hover:brightness-125 sm:text-7xl lg:text-8xl ${performerTitleColors[performer.name] ?? "text-white"}`}
                      >
                        {performer.name}
                      </span>
                    </h3>
                    <p className="mt-4 max-w-md text-sm leading-relaxed text-fog">
                      {performer.description}
                    </p>
                  </div>

                  <div
                    className={`md:col-span-5 ${photoFirst ? "md:order-first" : ""}`}
                  >
                    {performer.image ? (
                      /* Uradne fotografije so uokvirjene in rahlo zavrtene, z
                         naravnim razmerjem in prosojnimi vogali. Vsiljen izrez
                         (`aspect` + `object-cover`) bi jim odrezal okvir. */
                      <Image
                        src={performer.image}
                        alt={`Uradna fotografija skupine ${performer.name}.`}
                        width={performer.imageWidth}
                        height={performer.imageHeight}
                        sizes="(min-width: 768px) 40vw, 100vw"
                        className="h-auto w-full"
                      />
                    ) : (
                      /* Nadomestni okvir — zamenjajte z uradno fotografijo (data/event.ts) */
                      <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden border border-dashed border-atlas/30 bg-night">
                        <span
                          aria-hidden
                          className="font-display text-[8rem] leading-none text-white/5 sm:text-[10rem]"
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
              </li>
            );
          })}
        </ol>

        <p className="reveal mt-8 text-sm text-fog">
          En oder, en večer — vse tri zasedbe.{" "}
          <span className="text-white">10. oktobra v Ivančni Gorici.</span>
        </p>
      </div>
    </section>
  );
}
