import Image from "next/image";

type WallVariant = "a5" | "atlas";

const VARIANTS: Record<WallVariant, string> = {
  a5: "/media/wall/kolaz-a5.jpg",
  atlas: "/media/wall/kolaz-atlas.jpg",
};

/**
 * Ozadje v slogu kampanjskih plakatov 2026: pravi kolaž s pravimi razmiki in
 * poševnimi paspartuji, kot sta ga sestavila naša editorja (A5 tisk in IG
 * objava) — ne generiran iz kode. Rahlo prosojen, saj gre za dokončano
 * kampanjsko grafiko, ne surovo fotografijo, nato potemnjen za berljivost.
 */
export default function PhotoWall({ variant = "a5" }: { variant?: WallVariant }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <Image
        src={VARIANTS[variant]}
        alt=""
        fill
        sizes="100vw"
        className="object-cover opacity-70"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-night/80 via-night/68 to-night/86" />
      <div className="grain absolute inset-0" />
    </div>
  );
}
