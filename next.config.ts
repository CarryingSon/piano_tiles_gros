import type { NextConfig } from "next";

/**
 * Vse v `public/media/` je statična, ročno vzdrževana datoteka brez zgoščene
 * vrednosti v imenu, zato Next.js zanjo privzeto pošlje `max-age=0,
 * must-revalidate` — vsak obisk znova preverja 11 MB aftermovie in 1,8 MB
 * zvočni zapis igre. Spodnje glave to popravijo. Ker `next/image` vzame daljšo
 * vrednost med `minimumCacheTTL` in glavo izvorne slike, s tem podaljšamo tudi
 * predpomnjenje optimiziranih različic.
 *
 * Bolj specifičen vzorec mora priti za splošnim: pri enakem ključu obvelja
 * zadnje ujemanje.
 */
const mediaCacheHeaders: NonNullable<NextConfig["headers"]> = async () => [
  {
    // Fotografije: strežejo se prek /_next/image, teden dni je varno.
    source: "/media/:path*",
    headers: [
      {
        key: "Cache-Control",
        value: "public, max-age=604800, stale-while-revalidate=2592000",
      },
    ],
  },
  {
    // Zvok igre se mora ujemati z beatmapom iz JS svežnja, ki se ob objavi
    // zamenja takoj — zato krajše okno svežine kot pri ostalem.
    source: "/media/game/:path*",
    headers: [
      {
        key: "Cache-Control",
        value: "public, max-age=86400, stale-while-revalidate=604800",
      },
    ],
  },
  {
    // Video se zamenja samo z novim imenom datoteke.
    source: "/media/video/:path*",
    headers: [
      { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
    ],
  },
];

const nextConfig: NextConfig = {
  /**
   * `next dev` privzeto zavrne zahteve za razvojna sredstva (`/_next/*`) z
   * drugega izvora, kot je `localhost`. Stran, odprta prek naslova LAN, je zato
   * na telefonu prišla samo kot HTML: svežnji JS so vrnili 403, hidracija se ni
   * zgodila in noben gumb se ni odzival. Spodaj je podomrežje, s katerega
   * odpiramo urejevalnik na telefonu, in imena `*.local` za mDNS. Velja samo v
   * razvoju — produkcijskega builda se ne dotakne.
   *
   * Vzorec pokriva cel 192.168.0.0/16, ne samo enega podomrežja: ruter zna
   * razdeliti drug obseg (192.168.8.* namesto 192.168.1.*) in takrat je videti,
   * kot da je urejevalnik pokvarjen — HTML pride, svežnji vrnejo 403 in noben
   * gumb se ne odzove. Ves obseg je zaseben po RFC 1918 in velja samo lokalno.
   */
  allowedDevOrigins: ["192.168.*.*", "*.local"],
  images: {
    formats: ["image/avif", "image/webp"],
    /** Dovoljuje next/image za lokalni (zaupanja vreden) SVG logotip. */
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
  headers: mediaCacheHeaders,
};

export default nextConfig;
