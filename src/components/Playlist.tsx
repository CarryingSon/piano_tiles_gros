import { lineup, playlist } from "@/data/event";

/**
 * Uradni seznam predvajanja na dnu strani — zadnje, kar obiskovalec dobi, je
 * glasba, ki jo bo slišal v živo.
 *
 * Vgrajeni predvajalnik je Spotifyjev `iframe`: nalaga se šele, ko se približa
 * zaslonu (`loading="lazy"`), zato ne stane ničesar tistemu, ki do dna nikoli
 * ne pride. Kdor vgradnje ne more ali noče naložiti, ima pod njo navadno
 * povezavo do istega seznama.
 */
export default function Playlist() {
  const bands = lineup.map((act) => act.name).join(", ");

  return (
    <section
      id="playlista"
      aria-labelledby="playlista-naslov"
      className="border-t border-line bg-coal py-20 sm:py-28"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <p className="reveal mb-3 text-xs uppercase tracking-[0.3em] text-atlas">
          Playlista
        </p>
        <h2
          id="playlista-naslov"
          className="reveal max-w-3xl font-display text-4xl uppercase leading-tight text-white sm:text-6xl"
        >
          Domača naloga do <span className="text-atlas">oktobra.</span>
        </h2>
        <p className="reveal mt-5 max-w-prose text-lg leading-relaxed text-fog">
          Vsi izvajalci Glasbenega Atlasa 2026 na enem seznamu. Zavrti ga do
          desetega oktobra tolikokrat, da boš pod odrom pel na pamet.
        </p>

        <div className="reveal mt-10 overflow-hidden rounded-xl border border-line bg-night">
          <iframe
            src={`https://open.spotify.com/embed/playlist/${playlist.id}?utm_source=generator`}
            title={`Spotify seznam Glasbenega Atlasa 2026: ${bands}`}
            width="100%"
            height={420}
            loading="lazy"
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            allowFullScreen
            className="block w-full border-0"
          />
        </div>

        <a
          href={playlist.url}
          target="_blank"
          rel="noopener noreferrer"
          className="reveal mt-5 inline-block text-sm uppercase tracking-[0.2em] text-fog underline-offset-4 transition-colors hover:text-atlas hover:underline"
        >
          Odpri na Spotifyju ↗
        </a>
      </div>
    </section>
  );
}
