/**
 * Ikone strani, narisane namesto natipkane.
 *
 * Prej so bile znaki v besedilu — „↗", „✕", „‹", „›", „←", „→" — in to se je
 * na telefonu poznalo: iPhone za `↗` (U+2197) privzeto vzame emoji različico,
 * zato je na gumbu „Poslušaj na Spotifyju" zrasla modra škatlica z puščico.
 * Drugi znaki so bili odvisni od tega, ali jih ima sistemska pisava; risba ni
 * odvisna od ničesar.
 *
 * Vse merijo `1em`, torej jih vodi velikost pisave tam, kjer stojijo — okvir
 * gumba in razmiki ostanejo taki, kot so bili z znakom.
 */

type IconProps = {
  /** Doda se obstoječim razredom; velikost prihaja iz pisave, ne od tu. */
  className?: string;
};

const base = "inline-block shrink-0 align-[-0.1em]";

/** Puščica navzven: povezava, ki odpre nov zavihek ali drugo stran. */
export function ExternalIcon({ className = "" }: IconProps) {
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      focusable="false"
      className={`${base} ${className}`}
    >
      <path
        d="M7 17 17 7m0 0h-6m6 0v6"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Križ: zapri galerijo ali predvajalnik. */
export function CloseIcon({ className = "" }: IconProps) {
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      focusable="false"
      className={`${base} ${className}`}
    >
      <path
        d="M6.5 6.5l11 11m0-11l-11 11"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Kljukica: prejšnja ali naslednja fotografija znotraj istega pogleda. */
export function ChevronIcon({
  direction,
  className = "",
}: IconProps & { direction: "left" | "right" }) {
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      focusable="false"
      className={`${base} ${className}`}
    >
      <path
        d={direction === "left" ? "M14.5 5.5 8 12l6.5 6.5" : "M9.5 5.5 16 12l-6.5 6.5"}
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Ravna puščica: pomik po vrsti objav levo ali desno. */
export function ArrowIcon({
  direction,
  className = "",
}: IconProps & { direction: "left" | "right" }) {
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      focusable="false"
      className={`${base} ${className}`}
    >
      <path
        d={direction === "left" ? "M19 12H5m0 0 6-6m-6 6 6 6" : "M5 12h14m0 0-6-6m6 6-6 6"}
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
