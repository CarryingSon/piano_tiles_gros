type PhotoWallVariant = "experience" | "timeline" | "story";

const variantClasses: Record<PhotoWallVariant, string> = {
  experience: "photo-wall-experience",
  timeline: "photo-wall-timeline",
  story: "photo-wall-story",
};

/**
 * Ozadje v slogu kampanjskih plakatov 2026: pravi fotografski kolaž s
 * pravimi razmiki in poševnimi paspartuji, kot ga je sestavil naš editor —
 * ne generiran iz kode. Rahlo prosojen, saj gre za kampanjsko grafiko, ne
 * surovo fotografijo, nato potemnjen za berljivost besedila.
 *
 * Postavitev kolaža je v `globals.css` (`photo-wall`): na telefonu se pas
 * ponavlja navpično, na širših zaslonih velja `cover`.
 */
export default function PhotoWall({
  variant = "experience",
}: {
  variant?: PhotoWallVariant;
}) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 isolate overflow-hidden"
    >
      {/* Mobilni `sticky` sloj lahko v iOS Safariju uide iz pričakovanega
          vrstnega reda. Absolutno ozadje zato ostane v svojem izoliranem
          kontekstu in se ne more narisati nad vsebino. */}
      <div className="absolute inset-0 overflow-hidden">
        <div
          className={`photo-wall absolute inset-0 opacity-70 ${variantClasses[variant]}`}
        />
        <div className="absolute inset-0 bg-night/20" />
        <div className="absolute inset-0 bg-gradient-to-b from-night/80 via-night/68 to-night/86" />
        <div className="grain absolute inset-0" />
      </div>
    </div>
  );
}
