import { gameConfig } from "@/data/game";
import {
  getOverallLeaderboard,
  getSongLeaderboard,
  submitLeaderboardScore,
} from "@/lib/leaderboard";

export const runtime = "nodejs";

const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const namePattern = /^[\p{L}\p{N} ._'’\-]+$/u;
/** Groba oblika e-naslova: brez presledkov, en @ in pika za njim. */
const emailPattern = /^[^\s@]+@[^\s@.]+\.[^\s@]{2,}$/;

function cleanName(value: unknown) {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/\s+/g, " ").normalize("NFC");
  const length = [...name].length;
  if (length < 2 || length > 20 || !namePattern.test(name)) return null;
  return name;
}

/**
 * E-naslov je obvezen: po njem se igralčevi krogi seštejejo v skupno lestvico
 * (`get_public_leaderboard` združuje prav po njem) in po njem ga obvestimo o
 * karti. Vrne `null`, kadar manjka ali ni e-naslov — oddaja je takrat
 * zavrnjena, da igralec ne misli, da je rezultat zabeležen.
 */
function cleanEmail(value: unknown) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length >= 6 && email.length <= 160 && emailPattern.test(email)
    ? email
    : null;
}

function integer(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

/**
 * Zavrnitve, ki jih `submit_leaderboard_score` pove po imenu. Vsaka ima svoj
 * odziv, ker vsaka od igralca terja nekaj drugega: 425 je edina, ki mine sama
 * od sebe, zato stran prav pri njej počaka in poskusi znova.
 */
const REFUSALS: Record<string, { status: number; error: string }> = {
  // Seja je mlajša od tihe glave za odštevanje — krog se je končal tako hitro,
  // da oddaja prehiteva bazo. Mine v nekaj sekundah.
  "session too soon": {
    status: 425,
    error: "Rezultat je še vroč — shranjujem …",
  },
  // E-naslova ni: na primer zavihek, ki je ostal odprt izpred te zahteve.
  "invalid email": {
    status: 400,
    error: "Vpiši e-naslov — po njem se rezultati seštevajo in brez njega jih ne moremo shraniti.",
  },
  "session expired": {
    status: 409,
    error: "Igralna seja je potekla. Odigraj krog še enkrat in ga oddaj sproti.",
  },
  "unknown session": {
    status: 409,
    error: "Te igralne seje ni več. Odigraj krog še enkrat.",
  },
  "already submitted": {
    status: 409,
    error: "Ta krog je že na lestvici.",
  },
};

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const songId = url.searchParams.get("song");
    const entries = songId && gameConfig.songs.some((song) => song.id === songId)
      ? await getSongLeaderboard(songId)
      : await getOverallLeaderboard();
    return Response.json({ entries }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Leaderboard read error", error);
    return Response.json({ error: "Lestvica trenutno ni dosegljiva." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  // Zunaj `try`, da ju lahko izpiše tudi lovilec napak spodaj.
  const submitted: { songId?: string; score?: number | null; rating?: number } = {};
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const name = cleanName(body.name);
    const email = cleanEmail(body.email);
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
    const songId = typeof body.songId === "string" ? body.songId : "";
    const song = gameConfig.songs.find((item) => item.id === songId);
    const score = integer(body.score);
    submitted.songId = songId;
    submitted.score = score;
    const perfect = integer(body.perfect);
    const good = integer(body.good);
    const misses = integer(body.misses);

    if (!email) {
      return Response.json(
        { error: "Vpiši e-naslov — po njem se rezultati seštevajo in brez njega jih ne moremo shraniti." },
        { status: 400 },
      );
    }
    if (!name || !idPattern.test(sessionId) || !song || score === null || perfect === null || good === null || misses === null) {
      return Response.json({ error: "Preveri ime in e-naslov ter poskusi znova." }, { status: 400 });
    }
    if (
      score < 0 || score > song.maxScore || perfect < 0 || good < 0 || misses < 0 ||
      perfect + good > song.notes.length || misses > song.notes.length * 3
    ) {
      return Response.json({ error: "Rezultata ni bilo mogoče potrditi." }, { status: 422 });
    }

    const rating = Math.min(10000, Math.round((score / song.maxScore) * 10000));
    submitted.rating = rating;
    const entry = await submitLeaderboardScore({
      sessionId, name, email, songId, score, rating, perfect, good, misses,
    });
    if (!entry) {
      return Response.json({ error: "Igralna seja je potekla ali je bil rezultat že oddan." }, { status: 409 });
    }
    return Response.json({ entry }, { status: 201 });
  } catch (error) {
    // `invalid score` pomeni, da meje v bazi zaostajajo za `src/data/game.ts`:
    // funkcija preračuna oceno s svojim stropom in zavrne vsako neujemanje.
    // Brez teh podatkov v dnevniku je videti kot izpad baze, čeprav manjka
    // samo zagnana migracija — zato jih izpišemo in vrnemo 422, ne 503.
    const message = (error as { message?: string } | null)?.message;
    const stale = message === "invalid score";
    console.error("Leaderboard submit error", error, { ...submitted, staleBounds: stale });
    const refusal = message ? REFUSALS[message] : undefined;
    if (refusal) return Response.json({ error: refusal.error }, { status: refusal.status });
    return stale
      ? Response.json({ error: "Rezultata ni bilo mogoče potrditi." }, { status: 422 })
      : Response.json({ error: "Rezultata trenutno ni mogoče shraniti." }, { status: 503 });
  }
}
