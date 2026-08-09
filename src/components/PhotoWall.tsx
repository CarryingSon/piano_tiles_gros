import Image from "next/image";

type PhotoWallVariant = "experience" | "timeline" | "story";

const frameClasses: Record<PhotoWallVariant, string> = {
  experience: "object-[14%_center] sm:scale-[1.08] sm:object-[18%_center]",
  timeline: "object-[50%_24%] sm:scale-[1.16] sm:object-[center_18%]",
  story: "object-[86%_76%] sm:scale-[1.12] sm:object-[82%_82%]",
};

/**
 * Ozadje v slogu kampanjskih plakatov 2026: pravi fotografski kolaž s
 * pravimi razmiki in poševnimi paspartuji, kot ga je sestavil naš editor —
 * ne generiran iz kode. Rahlo prosojen, saj gre za kampanjsko grafiko, ne
 * surovo fotografijo, nato potemnjen za berljivost besedila.
 */
export default function PhotoWall({
  variant = "experience",
}: {
  variant?: PhotoWallVariant;
}) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-clip">
      <div className="sticky top-0 h-svh overflow-hidden sm:absolute sm:inset-0 sm:h-auto">
        <Image
          src="/media/wall/kolaz-2026.jpg"
          alt=""
          fill
          sizes="100vw"
          className={`object-cover opacity-70 ${frameClasses[variant]}`}
        />
        <div className="absolute inset-0 bg-night/20" />
        <div className="absolute inset-0 bg-gradient-to-b from-night/80 via-night/68 to-night/86" />
        <div className="grain absolute inset-0" />
      </div>
    </div>
  );
}
