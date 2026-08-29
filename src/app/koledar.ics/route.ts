import { buildIcs } from "@/lib/calendar";

/**
 * `.ics` datoteka za gumb "Dodaj v koledar". Vsebina je izpeljana iz
 * `data/event.ts` in se med zahtevki ne spreminja, zato jo Next lahko
 * predpripravi ob gradnji.
 */
export const dynamic = "force-static";

export function GET() {
  return new Response(buildIcs(), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      // Ime datoteke, ki ga uporabnik vidi v prenosih; `inline` pusti mobilnim
      // sistemom, da vnos odprejo neposredno v koledarski aplikaciji.
      "Content-Disposition": 'inline; filename="glasbeni-atlas-2026.ics"',
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
