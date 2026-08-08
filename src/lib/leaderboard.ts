import "server-only";

import { createClient } from "@/utils/supabase/server";

export type LeaderboardEntry = {
  id: string;
  name: string;
  songId: string;
  score: number;
  rating: number;
  perfect: number;
  good: number;
  misses: number;
  createdAt: string;
};

function mapEntry(row: Record<string, unknown>): LeaderboardEntry {
  return {
    id: String(row.id),
    name: String(row.name),
    songId: String(row.song_id),
    score: Number(row.score),
    rating: Number(row.rating),
    perfect: Number(row.perfect),
    good: Number(row.good),
    misses: Number(row.misses),
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

export async function createGameSession(songId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_leaderboard_session", {
    p_song_id: songId,
  });
  if (error) throw error;
  return String(data);
}

export async function submitLeaderboardScore(input: {
  sessionId: string;
  name: string;
  songId: string;
  score: number;
  rating: number;
  perfect: number;
  good: number;
  misses: number;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_leaderboard_score", {
    p_session_id: input.sessionId,
    p_name: input.name,
    p_song_id: input.songId,
    p_score: input.score,
    p_rating: input.rating,
    p_perfect: input.perfect,
    p_good: input.good,
    p_misses: input.misses,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row ? mapEntry(row as Record<string, unknown>) : null;
}

async function getLeaderboard(songId: string | null, limit: number) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_leaderboard", {
    p_song_id: songId,
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => mapEntry(row));
}

export function getOverallLeaderboard(limit = 20) {
  return getLeaderboard(null, limit);
}

export function getSongLeaderboard(songId: string, limit = 20) {
  return getLeaderboard(songId, limit);
}
