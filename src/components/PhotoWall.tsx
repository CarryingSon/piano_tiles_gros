import Image from "next/image";

/**
 * Ozadje v slogu kampanjskih plakatov 2026: pravi fotografski kolaž s
 * pravimi razmiki in poševnimi paspartuji, kot ga je sestavil naš editor —
 * ne generiran iz kode. Rahlo prosojen, saj gre za kampanjsko grafiko, ne
 * surovo fotografijo, nato potemnjen za berljivost besedila.
 */
export default function PhotoWall() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <Image
        src="/media/wall/kolaz-2026.jpg"
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
