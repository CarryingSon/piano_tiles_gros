import Image from "next/image";
import PhotoCollage from "@/components/PhotoCollage";
import PhotoWall from "@/components/PhotoWall";

/**
 * Doživetje: prodaja vzdušje, ne logistike. Kolaž pravih fotografij
 * z Glasbenega Atlasa 2022 in 2024 v slogu koncertnega plakata.
 */
export default function Experience() {
  return (
    <section
      id="dozivetje"
      aria-labelledby="dozivetje-naslov"
      className="relative isolate overflow-hidden py-16 sm:py-32"
    >
      <PhotoWall variant="experience" />
      <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6">
        <p className="reveal mb-3 text-xs uppercase tracking-[0.3em] text-atlas">
          Doživetje
        </p>
        <h2
          id="dozivetje-naslov"
          className="reveal max-w-3xl font-display text-4xl uppercase leading-[1.25] text-white sm:text-6xl"
        >
          To ni samo koncert.{" "}
          <span className="text-atlas">To je večer, ki ga doživiš skupaj.</span>
        </h2>

        <div className="mt-10 grid gap-8 sm:mt-14 md:grid-cols-12 md:gap-6">
          {/* Velika slika — publika */}
          <figure className="reveal md:col-span-7">
            <div className="relative aspect-[3/2] overflow-hidden">
              <Image
                src="/media/2022/publika-pod-satorom-2022.jpg"
                alt="Nasmejana publika pod šotorom Glasbenega Atlasa 2022 pozdravlja v objektiv."
                fill
                sizes="(min-width: 768px) 58vw, 100vw"
                className="object-cover transition-transform duration-700 hover:scale-[1.03]"
              />
            </div>
            <figcaption className="mt-2 text-xs uppercase tracking-widest text-fog">
              Publika · Glasbeni Atlas 2022
            </figcaption>
          </figure>

          {/* Stolpec dveh manjših */}
          <div className="grid gap-8 md:col-span-5 md:gap-6">
            <figure className="reveal">
              <div className="relative aspect-[4/3] overflow-hidden">
                <Image
                  src="/media/2022/kitarist-v-zarkih-2022.jpg"
                  alt="Kitarist v snopih odrske svetlobe na Glasbenem Atlasu 2022."
                  fill
                  sizes="(min-width: 768px) 40vw, 100vw"
                  className="object-cover transition-transform duration-700 hover:scale-[1.03]"
                />
              </div>
              <figcaption className="mt-2 text-xs uppercase tracking-widest text-fog">
                Oder · 2022
              </figcaption>
            </figure>
            <figure className="reveal">
              <div className="relative aspect-[4/3] overflow-hidden">
                <Image
                  src="/media/2024/dekleta-ob-ograji-2024.jpg"
                  alt="Prijateljice v prvi vrsti ob odrski ograji na Glasbenem Atlasu 2024."
                  fill
                  sizes="(min-width: 768px) 40vw, 100vw"
                  className="object-cover transition-transform duration-700 hover:scale-[1.03]"
                />
              </div>
              <figcaption className="mt-2 text-xs uppercase tracking-widest text-fog">
                Prva vrsta · 2024
              </figcaption>
            </figure>
          </div>
        </div>

        <div className="mt-10 grid gap-8 sm:mt-14 md:grid-cols-2 md:items-center">
          <p className="reveal max-w-prose text-lg leading-relaxed text-fog">
            En večer, en oder in publika, ki pride od blizu in daleč. Mlade
            zasedbe, ki jih slišiš prvič, in imena, ki jih poznaš na pamet —
            vmes pa prijatelji, sošolci in sosedje.{" "}
            <span className="text-white">
              Glasbeni Atlas je večer, po katerem se domov vračaš hripav.
            </span>
          </p>
          <figure className="reveal">
            <div className="relative aspect-[16/9] overflow-hidden">
              <Image
                src="/media/2024/pevec-crno-belo-2024.jpg"
                alt="Pevec sredi nastopa na Glasbenem Atlasu 2024, črno-bel posnetek."
                fill
                sizes="(min-width: 768px) 45vw, 100vw"
                className="object-cover grayscale transition-transform duration-700 hover:scale-[1.03]"
              />
            </div>
            <figcaption className="mt-2 text-xs uppercase tracking-widest text-fog">
              Nastopajoči · 2024
            </figcaption>
          </figure>
        </div>

        {/* Razmetan kolaž utrinkov — zaključi sekcijo z vzdušjem, ne s podatki. */}
        <div className="mt-16 sm:mt-24">
          <p className="reveal mb-6 text-xs uppercase tracking-[0.3em] text-atlas">
            Utrinki · Glasbeni Atlas 2024
          </p>
          <div className="reveal">
            <PhotoCollage />
          </div>
        </div>
      </div>
    </section>
  );
}
