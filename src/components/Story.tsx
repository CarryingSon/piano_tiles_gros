import Image from "next/image";
import { stats, story } from "@/data/event";
import PhotoWall from "@/components/PhotoWall";

/**
 * Zgodba projekta — skrajšano uradno besedilo z izvlečenim citatom.
 * Sekcija "v številkah" se prikaže šele, ko organizatorji v data/event.ts
 * vpišejo preverjene vrednosti in vklopijo `stats.enabled` (na izvorni
 * strani so števci ob zajemu kazali 0, zato tu ni izmišljenih številk).
 */
export default function Story() {
  return (
    <section
      aria-labelledby="projekt-naslov"
      className="relative overflow-hidden py-24 sm:py-32"
    >
      <PhotoWall variant="story" />
      <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid gap-12 md:grid-cols-2 md:gap-16">
          <div>
            <p className="reveal mb-3 text-xs uppercase tracking-[0.3em] text-atlas">
              Zakaj Atlas obstaja
            </p>
            <h2 id="projekt-naslov" className="reveal sr-only">
              Zgodba projekta Glasbeni Atlas
            </h2>
            <blockquote className="reveal border-l-4 border-atlas pl-6">
              <p className="font-display text-3xl uppercase leading-tight text-white sm:text-5xl">
                „{story.quote}“
              </p>
            </blockquote>
            <div className="mt-8 max-w-prose space-y-5 text-base leading-relaxed text-fog">
              {story.paragraphs.map((paragraph) => (
                <p key={paragraph.slice(0, 24)} className="reveal">
                  {paragraph}
                </p>
              ))}
            </div>
          </div>

          <div className="flex flex-col justify-center gap-6">
            <figure className="reveal">
              <div className="relative aspect-[3/2] overflow-hidden">
                <Image
                  src="/media/2024/glasbeni-atlas-ekipa-2024.jpg"
                  alt="Ekipa Glasbenega Atlasa 2024 pred odrom dogodka."
                  fill
                  sizes="(min-width: 768px) 45vw, 100vw"
                  className="object-cover"
                />
              </div>
              <figcaption className="mt-2 text-xs uppercase tracking-widest text-fog">
                Ekipa, ki postavi Atlas · 2024
              </figcaption>
            </figure>
            <p className="reveal border border-line bg-coal p-5 text-sm leading-relaxed text-fog">
              <span className="font-semibold uppercase tracking-wide text-atlas">
                Od študentov za vse generacije.
              </span>{" "}
              Projekt v celoti pripravijo študentje in dijaki Študentskega
              kluba GROŠ — od ideje in produkcije do izvedbe.
            </p>
          </div>
        </div>

        {/* Glasbeni Atlas v številkah — izklopljeno, dokler ni preverjenih vrednosti */}
        {stats.enabled && (
          <dl className="mt-20 grid grid-cols-2 gap-px border border-line bg-line sm:grid-cols-4">
            {stats.items.map(
              (item) =>
                item.value !== null && (
                  <div key={item.label} className="bg-night p-8 text-center">
                    <dd className="font-display text-5xl text-atlas">
                      {item.value}
                    </dd>
                    <dt className="mt-2 text-xs uppercase tracking-widest text-fog">
                      {item.label}
                    </dt>
                  </div>
                ),
            )}
          </dl>
        )}
      </div>
    </section>
  );
}
