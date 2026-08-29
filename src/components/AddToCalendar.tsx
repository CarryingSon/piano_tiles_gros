import { googleCalendarUrl, icsPath } from "@/lib/calendar";
import { event } from "@/data/event";

/**
 * "Dodaj v koledar" — brez JavaScripta in brez zunanjih skriptov.
 *
 * Glavna povezava streže `.ics` datoteko iz `/koledar.ics`: iOS, Android,
 * Apple Koledar in Outlook jo odprejo neposredno v koledarski aplikaciji.
 * Ker uporabniki Google Koledarja v brskalniku raje vidijo že izpolnjen
 * obrazec, je zraven še tiha povezava nanj.
 */

const label = "Dodaj v koledar";
const ariaLabel = `${label} — ${event.name}, ${event.dateHuman}`;

function CalendarIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden
      className="shrink-0"
    >
      <rect
        x="2"
        y="3.5"
        width="14"
        height="12"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M2 7.5h14M6 1.5v3M12 1.5v3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

type Props = {
  /**
   * `button` — obrobljen gumb ob glavnem CTA-ju;
   * `quiet` — podčrtana povezava med praktičnimi informacijami.
   */
  variant?: "button" | "quiet";
  className?: string;
};

export default function AddToCalendar({
  variant = "button",
  className = "",
}: Props) {
  if (variant === "quiet") {
    return (
      <div className={className}>
        <a
          href={icsPath}
          aria-label={ariaLabel}
          className="inline-flex items-center gap-2 text-sm uppercase tracking-widest text-atlas underline underline-offset-4 transition-opacity hover:opacity-80"
        >
          <CalendarIcon />
          {label}
        </a>
        <p className="mt-2 text-xs text-fog">
          Datoteka za Apple Koledar, Outlook in Android ·{" "}
          <a
            href={googleCalendarUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-4 hover:text-atlas"
          >
            Google Koledar
          </a>
        </p>
      </div>
    );
  }

  return (
    <div className={className}>
      <a
        href={icsPath}
        aria-label={ariaLabel}
        className="inline-flex items-center gap-2.5 border border-white/40 px-8 py-4 font-display text-lg uppercase tracking-wide text-white transition-colors hover:border-atlas hover:text-atlas"
      >
        <CalendarIcon />
        {label}
      </a>
      <p className="mt-2 text-xs text-fog">
        Apple, Outlook, Android ·{" "}
        <a
          href={googleCalendarUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-4 hover:text-atlas"
        >
          Google Koledar
        </a>
      </p>
    </div>
  );
}
