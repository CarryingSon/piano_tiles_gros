import Image from "next/image";
import { editions, tickets } from "@/data/event";
import PhotoWall from "@/components/PhotoWall";

/**
 * Zgodba skozi leta kot pot na zemljevidu: prekinjena rumena črta povezuje
 * postaje (2022 → 2024 → 2026). Semantično je to preprost <ol> — v celoti
 * uporaben brez animacij in miške.
 */
export default function Timeline() {
  return (
    <section
      id="zgodba"
      aria-labelledby="zgodba-naslov"
      className="relative overflow-hidden py-24 sm:py-32"
    >
      <PhotoWall variant="atlas" />
      <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6">
        <p className="reveal mb-3 text-xs uppercase tracking-[0.3em] text-atlas">
          Zgodba · Postaje
        </p>
        <h2
          id="zgodba-naslov"
          className="reveal max-w-3xl font-display text-4xl uppercase leading-[1.25] text-white sm:text-6xl"
        >
          Vsaka izdaja je <span className="text-atlas">nova postaja</span> na
          zemljevidu.
        </h2>

        <ol className="relative mt-16 space-y-16 border-l-2 border-dashed border-atlas/40 pl-8 sm:space-y-20 sm:pl-12">
          {editions.map((edition) => {
            const is2026 = edition.year === "2026";
            return (
              <li key={edition.year} className="reveal relative">
                {/* Pika postaje na črti */}
                <span
                  aria-hidden
                  className={`absolute -left-[41px] top-2 flex h-5 w-5 items-center justify-center rounded-full border-2 sm:-left-[57px] ${
                    is2026
                      ? "border-atlas bg-atlas"
                      : "border-atlas/60 bg-night"
                  }`}
                >
                  {is2026 && (
                    <span className="motion-pulse absolute inline-flex h-full w-full rounded-full bg-atlas/60" />
                  )}
                </span>

                <div className="grid gap-8 md:grid-cols-2 md:items-center">
                  <div className={is2026 ? "" : "md:order-none"}>
                    <p className="text-xs uppercase tracking-[0.3em] text-fog">
                      {edition.stopLabel} · {edition.city}
                    </p>
                    <p className="mt-2 flex flex-wrap items-baseline gap-x-4">
                      <span
                        className={`font-display text-6xl uppercase leading-none sm:text-8xl ${
                          is2026 ? "text-atlas" : "text-white"
                        }`}
                      >
                        {edition.year}
                      </span>
                      <span className="text-sm text-fog">
                        {edition.dateHuman}
                      </span>
                    </p>
                    <p className="mt-4 font-display text-xl uppercase leading-snug text-white sm:text-2xl">
                      {edition.performers.join(" · ")}
                    </p>
                    {edition.note && (
                      <p className="mt-3 max-w-md text-sm leading-relaxed text-fog">
                        {edition.note}
                      </p>
                    )}
                    {is2026 && (
                      <a
                        href={tickets.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-6 inline-block bg-atlas px-6 py-3 font-display uppercase tracking-wide text-night transition-transform hover:-translate-y-0.5"
                      >
                        {tickets.ctaLabelLong}
                      </a>
                    )}
                  </div>

                  {edition.image ? (
                    <figure>
                      <div className="relative aspect-[3/2] overflow-hidden">
                        <Image
                          src={edition.image.src}
                          alt={edition.image.alt}
                          fill
                          sizes="(min-width: 768px) 45vw, 100vw"
                          className="object-cover"
                        />
                      </div>
                      <figcaption className="mt-2 text-xs uppercase tracking-widest text-fog">
                        Arhiv · Glasbeni Atlas {edition.year}
                      </figcaption>
                    </figure>
                  ) : (
                    /* 2026 — postaja brez arhiva: koordinatna kartica */
                    <div
                      aria-hidden
                      className="relative flex aspect-[3/2] flex-col items-start justify-between border border-dashed border-atlas/40 bg-coal p-6"
                    >
                      <p className="text-xs uppercase tracking-[0.3em] text-fog">
                        45.9386° N · 14.8047° E
                      </p>
                      <p className="font-display text-3xl uppercase leading-tight text-white sm:text-4xl">
                        Parkirišče
                        <br />
                        Ivančna Gorica
                      </p>
                      <p className="text-xs uppercase tracking-[0.3em] text-atlas">
                        Fotografije nastanejo 10. 10. 2026 — s tabo.
                      </p>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
