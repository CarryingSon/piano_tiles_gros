import Image from "next/image";
import { type Partner, partners } from "@/data/event";

/**
 * Partnerji dogodka: vsi logotipi se enakovredno pomikajo v neskončni zanki,
 * vsak vodi na uradno stran partnerja.
 *
 * Trak je čisti CSS (`globals.css`, razred `marquee-track`) — brez
 * JavaScripta, zato deluje takoj ob prvem izrisu in nima stroška hidracije.
 *
 * Kdor ima izklopljene animacije, dobi mirno prelomljeno vrsto vseh logotipov
 * (`partners-static`); trak se v tem primeru sploh ne izriše.
 */

function PartnerLink({
  partner,
  className,
  imageClassName,
  decorative = false,
}: {
  partner: Partner;
  className?: string;
  imageClassName: string;
  /** Ponovitev v drugi polovici traku — skrita bralnikom in izpuščena iz tabulatorja. */
  decorative?: boolean;
}) {
  return (
    <a
      href={partner.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-hidden={decorative || undefined}
      tabIndex={decorative ? -1 : undefined}
      className={className}
    >
      <Image
        src={partner.src}
        alt={decorative ? "" : `Logotip ${partner.name}.`}
        width={partner.width}
        height={partner.height}
        sizes="224px"
        className={imageClassName}
      />
    </a>
  );
}

function TrackItem({
  partner,
  decorative = false,
}: {
  partner: Partner;
  decorative?: boolean;
}) {
  return (
    <li
      aria-hidden={decorative || undefined}
      className="flex w-40 shrink-0 items-center justify-center px-6 sm:w-56 sm:px-8"
    >
      <PartnerLink
        partner={partner}
        decorative={decorative}
        className="flex items-center justify-center"
        imageClassName="h-8 w-auto max-w-full object-contain opacity-70 transition-opacity duration-300 hover:opacity-100 sm:h-10"
      />
    </li>
  );
}

export default function Partners() {
  return (
    <section
      id="partnerji"
      aria-labelledby="partnerji-naslov"
      className="relative overflow-hidden border-y border-line bg-night py-16 sm:py-20"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <p className="reveal mb-3 text-center text-xs uppercase tracking-[0.3em] text-atlas">
          Partnerji
        </p>
        <h2
          id="partnerji-naslov"
          className="reveal text-center font-display text-3xl uppercase leading-tight text-white sm:text-4xl"
        >
          Brez njih ni odra.
        </h2>
      </div>

      <div className="partners-motion marquee relative mt-10 sm:mt-14">
        <ul className="marquee-track items-center py-2">
          {partners.map((partner) => (
            <TrackItem key={partner.name} partner={partner} />
          ))}
          {partners.map((partner) => (
            <TrackItem
              key={`${partner.name}-ponovitev`}
              partner={partner}
              decorative
            />
          ))}
        </ul>

        {/* Robna zabrisa, da logotipi na straneh zdrsnejo v ozadje */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-night to-transparent sm:w-32"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-night to-transparent sm:w-32"
        />

      </div>

      {/* Različica brez gibanja */}
      <ul className="partners-static mx-auto mt-10 max-w-4xl flex-wrap items-center justify-center gap-x-10 gap-y-8 px-4 sm:px-6">
        {partners.map((partner) => (
          <li key={partner.name} className="flex items-center justify-center">
            <PartnerLink
              partner={partner}
              className="flex items-center justify-center"
              imageClassName="h-10 w-auto object-contain opacity-80 transition-opacity hover:opacity-100 sm:h-12"
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
