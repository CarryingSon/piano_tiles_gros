import { gameConfig } from "@/data/game";
import { createGameSession } from "@/lib/leaderboard";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { songId?: unknown };
    const songId = typeof body.songId === "string" ? body.songId : "";
    if (!gameConfig.songs.some((song) => song.id === songId)) {
      return Response.json({ error: "Neveljavna skladba." }, { status: 400 });
    }
    const sessionId = await createGameSession(songId);
    return Response.json({ sessionId }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Leaderboard session error", error);
    return Response.json({ error: "Lestvica trenutno ni dosegljiva." }, { status: 503 });
  }
}
