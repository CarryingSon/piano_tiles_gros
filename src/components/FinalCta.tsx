import Image from "next/image";
import { event, lineup, tickets } from "@/data/event";

/**
 * Zaključna konverzijska sekcija: čustvena fotografija + jasen CTA.
 * Ponovi ključna dejstva tik pred odhodom na Eventim.
 */
export default function FinalCta() {
  return (
    <section
      aria-labelledby="final-naslov"
      className="relative flex min-h-[70svh] items-end overflow-hidden"
    >
      <div className="absolute inset-0" aria-hidden>
        <Image
          src="/media/2022/publika-na-ramenih-2022.jpg"
          alt=""
          fill
          loading="lazy"
          sizes="100vw"
          className="object-cover object-top"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-night via-night/70 to-night/20" />
      </div>

      <div className="relative mx-auto w-full max-w-6xl px-4 py-24 sm:px-6 sm:py-28">
        <p className="reveal mb-3 text-xs uppercase tracking-[0.3em] text-atlas">
          Naslednja postaja
        </p>
        <h2
          id="final-naslov"
          className="reveal font-display text-5xl uppercase leading-[0.95] text-white sm:text-7xl lg:text-8xl"
        >
          Glasbeni Atlas
          <br />
          <span className="text-atlas">2026.</span>
        </h2>

        <p className="reveal mt-6 max-w-md text-lg text-fog">
          {event.dateHuman} · {event.venue}, {event.city}
          <br />
          {lineup.map((p) => p.name).join(" · ")}
        </p>

        <div className="reveal mt-8 flex flex-wrap items-center gap-4">
          <a
            href={tickets.url}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-atlas px-8 py-4 font-display text-lg uppercase tracking-wide text-night transition-transform hover:-translate-y-0.5"
          >
            {tickets.ctaLabelLong}
          </a>
          <span className="text-sm text-fog">
            {tickets.priceFromHuman} · {tickets.provider}
          </span>
        </div>
      </div>
    </section>
  );
}
