import { gameConfig } from "@/data/game";
import { getOverallLeaderboard, getSongLeaderboard } from "@/lib/leaderboard";

/**
 * Povzetek lestvice za napoved igre na domači strani: prvi trije po skupnem
 * seštevku (prejemniki brezplačnih vstopnic) in vodilni po vsaki skladbi.
 *
 * Svoja pot obstaja zato, da domača stran opravi en zahtevek namesto štirih;
 * poizvedbe se na strežniku izvedejo vzporedno.
 */
export const runtime = "nodejs";

export async function GET() {
  try {
    const [overall, ...perSong] = await Promise.all([
      getOverallLeaderboard(3),
      ...gameConfig.songs.map((song) => getSongLeaderboard(song.id, 1)),
    ]);

    return Response.json(
      {
        overall,
        songs: gameConfig.songs.map((song, index) => ({
          songId: song.id,
          band: song.band,
          title: song.title,
          color: song.baseColor,
          entry: perSong[index]?.[0] ?? null,
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
