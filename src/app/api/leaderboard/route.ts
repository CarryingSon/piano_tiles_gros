import { gameConfig } from "@/data/game";
import {
  getOverallLeaderboard,
  getSongLeaderboard,
  submitLeaderboardScore,
} from "@/lib/leaderboard";

export const runtime = "nodejs";

const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const namePattern = /^[\p{L}\p{N} ._'’\-]+$/u;

function cleanName(value: unknown) {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/\s+/g, " ").normalize("NFC");
  const length = [...name].length;
  if (length < 2 || length > 20 || !namePattern.test(name)) return null;
  return name;
}

function integer(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

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
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
    const songId = typeof body.songId === "string" ? body.songId : "";
    const song = gameConfig.songs.find((item) => item.id === songId);
    const score = integer(body.score);
    submitted.songId = songId;
    submitted.score = score;
    const perfect = integer(body.perfect);
    const good = integer(body.good);
    const misses = integer(body.misses);

    if (!name || !idPattern.test(sessionId) || !song || score === null || perfect === null || good === null || misses === null) {
      return Response.json({ error: "Preveri ime in poskusi znova." }, { status: 400 });
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
      sessionId, name, songId, score, rating, perfect, good, misses,
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
    const stale = (error as { message?: string } | null)?.message === "invalid score";
    console.error("Leaderboard submit error", error, { ...submitted, staleBounds: stale });
    return stale
      ? Response.json({ error: "Rezultata ni bilo mogoče potrditi." }, { status: 422 })
      : Response.json({ error: "Rezultata trenutno ni mogoče shraniti." }, { status: 503 });
  }
}
