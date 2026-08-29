import { event, lineup, site, tickets } from "@/data/event";

/**
 * Koledarski vnos za Glasbeni Atlas — en sam vir resnice za `.ics` datoteko in
 * za povezavo na Google Koledar. Podatki se berejo iz `data/event.ts`, zato se
 * sprememba datuma ali prizorišča samodejno pozna v obeh.
 */

/** Stabilen identifikator vnosa: ponovni prenos posodobi obstoječi dogodek, ne ustvari novega. */
const UID = "glasbeni-atlas-2026@glasbeniatlas.si";

/**
 * DTSTAMP je namenoma konstanta in ne `new Date()`: odgovor ostane enak ob
 * vsakem zahtevku (in s tem predpomnljiv), koledarji pa vnos prepoznajo kot
 * nespremenjen. Ob vsebinski spremembi dogodka povišajte `SEQUENCE`.
 */
const DTSTAMP = "20260829T000000Z";
const SEQUENCE = 0;

/** ISO datum → oblika `20261010T170000Z`, kot jo zahtevata iCalendar in Google. */
function toUtcStamp(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Neveljaven datum za koledar: ${iso}`);
  }
  return `${date.toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`;
}

export const calendarStart = toUtcStamp(event.startIso);
export const calendarEnd = toUtcStamp(event.endIso);

const performers = lineup.map((performer) => performer.name).join(" · ");

export const calendarTitle = event.name;
export const calendarLocation = `${event.venue}, ${event.city}`;
export const calendarDescription = [
  `${performers} — en oder, en večer.`,
  `Vstopnice (${tickets.provider}): ${tickets.url}`,
  `Vse informacije: ${site.url}`,
].join("\n");

/** RFC 5545: v besedilnih vrednostih je treba ubežati \ ; , in prelome vrstic. */
function escapeText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * RFC 5545 omejuje vrstico na 75 oktetov. Presežek se prelomi in nadaljuje z
 * vodilnim presledkom. Šteti je treba bajte, ne znakov — šumniki so v UTF-8
 * dvobajtni in bi ob štetju znakov vrstica lahko presegla mejo.
 */
function foldLine(line: string) {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;

  const parts: string[] = [];
  let current = "";
  let currentBytes = 0;
  // Nadaljevalne vrstice porabijo en oktet za vodilni presledek.
  let limit = 75;

  for (const char of line) {
    const charBytes = encoder.encode(char).length;
    if (currentBytes + charBytes > limit) {
      parts.push(current);
      current = "";
      currentBytes = 0;
      limit = 74;
    }
    current += char;
    currentBytes += charBytes;
  }
  parts.push(current);

  return parts.join("\r\n ");
}

/** Sestavi celotno `.ics` datoteko z enim dogodkom. */
export function buildIcs() {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Studentski klub GROS//Glasbeni Atlas//SL",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${UID}`,
    `DTSTAMP:${DTSTAMP}`,
    `SEQUENCE:${SEQUENCE}`,
    `DTSTART:${calendarStart}`,
    `DTEND:${calendarEnd}`,
    `SUMMARY:${escapeText(calendarTitle)}`,
    `DESCRIPTION:${escapeText(calendarDescription)}`,
    `LOCATION:${escapeText(calendarLocation)}`,
    `URL:${site.url}`,
    "STATUS:CONFIRMED",
    "TRANSP:OPAQUE",
    // Opomnik dan prej — koncert je zvečer, zato je 24 ur pravi zamik.
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeText(`${event.name} je jutri.`)}`,
    "TRIGGER:-P1D",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  // iCalendar zahteva CRLF in končni prelom vrstice.
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}

/** Pot do `.ics` datoteke — deluje z Apple Koledarjem, Outlookom in Androidom. */
export const icsPath = "/koledar.ics";

/** Spletni obrazec Google Koledarja za tiste, ki koledar vodijo v brskalniku. */
export const googleCalendarUrl = `https://calendar.google.com/calendar/render?${new URLSearchParams(
  {
    action: "TEMPLATE",
    text: calendarTitle,
    dates: `${calendarStart}/${calendarEnd}`,
    details: calendarDescription,
    location: calendarLocation,
  },
).toString()}`;
