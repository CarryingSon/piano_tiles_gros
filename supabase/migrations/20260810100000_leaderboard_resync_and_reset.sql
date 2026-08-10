-- POPRAVEK: oddaja rezultata je v produkciji vračala 503.
--
-- Vzrok: v bazi je bila še vedno funkcija iz migracije
-- `20260809120000_leaderboard_full_songs.sql` (mrfy 173500), koda pa je bila že
-- pri 215110. Funkcija ne primerja samo stropa, ampak tudi preračuna oceno:
--
--   p_rating <> ROUND((p_score::numeric / v_max_score) * 10000)
--
-- Ker aplikacija oceno deli z 215110, baza pa s 173500, se vrednosti nista
-- ujemali pri NOBENEM rezultatu razen 0 — vsaka oddaja je sprožila
-- `invalid score` (P0001). Šest migracij med tema dvema ni bilo nikoli
-- zagnanih; vse od prve naprej samo zamenjajo to funkcijo, zato je dovolj,
-- da se požene ta datoteka.
--
-- Trenutne meje (izpiše `node scripts/verify-game-data.mjs`):
--   mrfy    215110  (387 not)
--   kokosy  154700  (401 not)
--   tabu    241290  (460 not)

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
    WHEN 'mrfy' THEN 215110
    WHEN 'kokosy' THEN 154700
    WHEN 'tabu' THEN 241290
  END,
  CASE p_song_id
    WHEN 'mrfy' THEN 387
    WHEN 'kokosy' THEN 401
    WHEN 'tabu' THEN 460
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
    AND started_at <= NOW() - INTERVAL '10 seconds'
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

GRANT EXECUTE ON FUNCTION public.submit_leaderboard_score(UUID, TEXT, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER) TO anon, authenticated;

-- Obstoječi vnosi imajo oceno, izračunano proti staremu stropu 173500, zato so
-- na skupni lestvici napihnjeni (161120 točk je dobilo oceno 9286 namesto
-- 7490) in bi neupravičeno prekrili vse nove. Ker so bili to testni krogi,
-- se lestvica počisti. Seje odnesejo vnose s seboj (ON DELETE CASCADE), a
-- vnose brišemo izrecno, da je namen jasen.
DELETE FROM public.leaderboard_entries;
DELETE FROM public.leaderboard_sessions;
