-- Izbris lestvice pred tekmovanjem.
--
-- Stari krogi so bili odigrani po drugih pravilih: s tremi življenji (zdaj je
-- eno) in proti nižjemu stropu točk, ker se je zadnji refren premaknil naprej.
-- Njihova normalizirana ocena je zato za nekaj odstotkov radodarna, sam krog pa
-- ni primerljiv z novim — in prav po tej oceni se delijo tri brezplačne karte.
--
-- Funkcija je tu ponovljena nespremenjena: `verify-game-data.mjs` bere meje iz
-- leksikalno zadnje migracije, zato jih mora ta nositi s sabo.
--
-- Trenutne meje (izpiše `node scripts/verify-game-data.mjs`):
--   mrfy    228890  (387 not)
--   kokosy  221900  (522 not)
--   tabu    260300  (460 not)

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
    WHEN 'mrfy' THEN 228890
    WHEN 'kokosy' THEN 221900
    WHEN 'tabu' THEN 260300
  END,
  CASE p_song_id
    WHEN 'mrfy' THEN 387
    WHEN 'kokosy' THEN 522
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

-- Karte (število not) so nespremenjene; briše se samo odigrano. Vnosi padejo
-- skupaj s sejami prek ON DELETE CASCADE.
DELETE FROM public.leaderboard_sessions;
