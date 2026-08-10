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
  images: {
    formats: ["image/avif", "image/webp"],
    /** Dovoljuje next/image za lokalni (zaupanja vreden) SVG logotip. */
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
  headers: mediaCacheHeaders,
};

export default nextConfig;
