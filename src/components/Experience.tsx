import PhotoCollage from "@/components/PhotoCollage";
import PhotoWall from "@/components/PhotoWall";

/**
 * Doživetje: prodaja vzdušje, ne logistike. Namesto mreže s pripisi stoji pod
 * naslovom razmetan kolaž pravih fotografij z Glasbenega Atlasa 2022 in 2024 —
 * vse v isti sivini, kot bi kdo vrgel kup slik na mizo.
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
        <p className="reveal mt-6 max-w-prose text-lg leading-relaxed text-fog">
          En večer, en oder in publika, ki pride od blizu in daleč. Mlade
          zasedbe, ki jih slišiš prvič, in imena, ki jih poznaš na pamet — vmes
          pa prijatelji, sošolci in sosedje.{" "}
          <span className="text-white">
            Glasbeni Atlas je večer, po katerem se domov vračaš hripav.
          </span>
        </p>

        <div className="mt-12 sm:mt-16">
          <p className="reveal mb-6 text-xs uppercase tracking-[0.3em] text-atlas">
            Utrinki · 2022 in 2024
          </p>
          <div className="reveal">
            <PhotoCollage />
          </div>
        </div>
      </div>
    </section>
  );
}
