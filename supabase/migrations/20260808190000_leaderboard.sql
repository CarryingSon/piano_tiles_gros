CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.leaderboard_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  song_id TEXT NOT NULL CHECK (song_id IN ('mrfy', 'kokosy', 'tabu')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.leaderboard_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL UNIQUE REFERENCES public.leaderboard_sessions(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 20),
  song_id TEXT NOT NULL CHECK (song_id IN ('mrfy', 'kokosy', 'tabu')),
  score INTEGER NOT NULL CHECK (score >= 0),
  rating INTEGER NOT NULL CHECK (rating BETWEEN 0 AND 10000),
  perfect INTEGER NOT NULL CHECK (perfect >= 0),
  good INTEGER NOT NULL CHECK (good >= 0),
  misses INTEGER NOT NULL CHECK (misses >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS leaderboard_entries_overall_idx
  ON public.leaderboard_entries (rating DESC, score DESC, created_at ASC);
CREATE INDEX IF NOT EXISTS leaderboard_entries_song_idx
  ON public.leaderboard_entries (song_id, score DESC, created_at ASC);

ALTER TABLE public.leaderboard_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaderboard_entries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.leaderboard_sessions FROM anon, authenticated;
REVOKE ALL ON public.leaderboard_entries FROM anon, authenticated;

DROP POLICY IF EXISTS "Leaderboard is publicly readable" ON public.leaderboard_entries;
CREATE POLICY "Leaderboard is publicly readable"
  ON public.leaderboard_entries FOR SELECT
  TO anon, authenticated
  USING (TRUE);
GRANT SELECT ON public.leaderboard_entries TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.start_leaderboard_session(p_song_id TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_song_id NOT IN ('mrfy', 'kokosy', 'tabu') THEN
    RAISE EXCEPTION 'invalid song';
  END IF;
  INSERT INTO public.leaderboard_sessions (song_id)
  VALUES (p_song_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_leaderboard_score(
  p_session_id UUID,
  p_name TEXT,
  p_song_id TEXT,
  p_score INTEGER,
  p_rating INTEGER,
  p_perfect INTEGER,
  p_good INTEGER,
  p_misses INTEGER
)
RETURNS SETOF public.leaderboard_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_max_score INTEGER;
  v_note_count INTEGER;
BEGIN
  p_name := regexp_replace(btrim(p_name), '\s+', ' ', 'g');
  IF char_length(p_name) < 2 OR char_length(p_name) > 20 OR p_name ~ '[<>]' THEN
    RAISE EXCEPTION 'invalid name';
  END IF;

  SELECT CASE p_song_id
    WHEN 'mrfy' THEN 25100
    WHEN 'kokosy' THEN 18300
    WHEN 'tabu' THEN 29500
  END,
  CASE p_song_id
    WHEN 'mrfy' THEN 77
    WHEN 'kokosy' THEN 60
    WHEN 'tabu' THEN 88
  END
  INTO v_max_score, v_note_count;

  IF v_max_score IS NULL OR p_score < 0 OR p_score > v_max_score
    OR p_rating < 0 OR p_rating > 10000
    OR p_perfect < 0 OR p_good < 0 OR p_misses < 0
    OR p_perfect + p_good > v_note_count OR p_misses > v_note_count * 3
    OR p_rating <> LEAST(10000, ROUND((p_score::numeric / v_max_score) * 10000))::integer
  THEN
    RAISE EXCEPTION 'invalid score';
  END IF;

  UPDATE public.leaderboard_sessions
  SET completed_at = NOW()
  WHERE id = p_session_id
    AND song_id = p_song_id
    AND completed_at IS NULL
    AND started_at <= NOW() - INTERVAL '30 seconds'
    AND started_at >= NOW() - INTERVAL '15 minutes';

  IF NOT FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY
    INSERT INTO public.leaderboard_entries (
      session_id, name, song_id, score, rating, perfect, good, misses
    ) VALUES (
      p_session_id, p_name, p_song_id, p_score, p_rating, p_perfect, p_good, p_misses
    )
    RETURNING *;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_public_leaderboard(
  p_song_id TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  song_id TEXT,
  score INTEGER,
  rating INTEGER,
  perfect INTEGER,
  good INTEGER,
  misses INTEGER,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH ranked_personal_bests AS (
    SELECT e.*,
      ROW_NUMBER() OVER (
        PARTITION BY LOWER(e.name), CASE WHEN p_song_id IS NULL THEN NULL ELSE e.song_id END
        ORDER BY e.rating DESC, e.score DESC, e.created_at ASC
      ) AS personal_rank
    FROM public.leaderboard_entries e
    WHERE p_song_id IS NULL OR e.song_id = p_song_id
  ), personal_bests AS (
    SELECT *
    FROM ranked_personal_bests
    WHERE personal_rank = 1
  )
  SELECT pb.id, pb.name, pb.song_id, pb.score, pb.rating,
    pb.perfect, pb.good, pb.misses, pb.created_at
  FROM personal_bests pb
  ORDER BY
    CASE WHEN p_song_id IS NULL THEN pb.rating END DESC,
    CASE WHEN p_song_id IS NOT NULL THEN pb.score END DESC,
    pb.score DESC,
    pb.created_at ASC
  LIMIT LEAST(GREATEST(p_limit, 1), 100);
$$;

REVOKE ALL ON FUNCTION public.start_leaderboard_session(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_leaderboard_score(UUID, TEXT, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_leaderboard(TEXT, INTEGER) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.start_leaderboard_session(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_leaderboard_score(UUID, TEXT, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_leaderboard(TEXT, INTEGER) TO anon, authenticated;
