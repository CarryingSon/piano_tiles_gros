import { gameConfig } from "@/data/game";
import { getOverallLeaderboard, getSongLeaderboard } from "@/lib/leaderboard";

/**
 * Povzetek lestvice za napoved igre na domači strani: prvi trije po skupnem
 * seštevku (prejemniki brezplačnih vstopnic) in vrh lestvice vsake skladbe.
 *
 * Svoja pot obstaja zato, da domača stran opravi en zahtevek namesto štirih;
 * poizvedbe se na strežniku izvedejo vzporedno. Kartica preklaplja med zavihki
 * brez novega zahtevka, zato pride vseh nekaj vrstic na skladbo skupaj.
 */
export const runtime = "nodejs";

/** Koliko vrstic pokaže zavihek posamezne skladbe. */
const PER_SONG = 5;

export async function GET() {
  try {
    const [overall, ...perSong] = await Promise.all([
      getOverallLeaderboard(3),
      ...gameConfig.songs.map((song) => getSongLeaderboard(song.id, PER_SONG)),
    ]);

    return Response.json(
      {
        overall,
        songs: gameConfig.songs.map((song, index) => ({
          songId: song.id,
          band: song.band,
          title: song.title,
          color: song.baseColor,
          entries: perSong[index] ?? [],
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Leaderboard summary error", error);
    return Response.json(
      { error: "Lestvica trenutno ni dosegljiva." },
      { status: 503 },
    );
  }
}
