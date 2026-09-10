-- Kokosy: nov posneti chart z dne 10. 9. 2026. Steze so tokrat tipkane po eni
-- naenkrat — vsaka nota je padla v stezo, ki jo je izbral prst — zato jih je
-- 451 (31 holdov) namesto 417 (8 holdov). Iz posnetka je popravljena ena sama
-- stvar: hold pri 78,50 s je bil za 10 ms daljši od razmika do naslednje note,
-- zato je skrajšan z 2,61 s na 2,60 s. Nič drugega ni dodano ali odvzeto.
--
-- Strop se premakne z njim:
--
--   mrfy    228890  (387 not)
--   kokosy  211250  (451 not)   <- spremenjeno, prej 184400 / 417
--   tabu    260300  (460 not)
--
-- Komad ima tri tihe odseke pri 209-218 s in zadnjih 11,6 s brez ploščic; tako
-- je zaigrano in tako ostane, kot velja za uvod prejsnjega posnetka.
--
-- Krogi Kokosyja po starem chartu padejo: strop je bil drugacen, zato v skupnem
-- sestevku ne bi bili primerljivi. Druga dva komada ostaneta.

CREATE OR REPLACE FUNCTION public.submit_leaderboard_score(
  p_session_id UUID,
  p_name TEXT,
  p_song_id TEXT,
  p_score INTEGER,
  p_rating INTEGER,
  p_perfect INTEGER,
  p_good INTEGER,
  p_misses INTEGER,
  p_email TEXT DEFAULT NULL
)
RETURNS SETOF public.leaderboard_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_max_score INTEGER;
  v_note_count INTEGER;
  v_email TEXT;
  v_entry public.leaderboard_entries;
BEGIN
  p_name := regexp_replace(btrim(p_name), '\s+', ' ', 'g');
  IF char_length(p_name) < 2 OR char_length(p_name) > 20 OR p_name ~ '[<>]' THEN
    RAISE EXCEPTION 'invalid name';
  END IF;

  -- Brez e-naslova ni vnosa: brez njega se krogi istega igralca ne bi znali
  -- sešteti, karte pa se delijo prav po seštevku.
  v_email := lower(NULLIF(btrim(COALESCE(p_email, '')), ''));
  IF v_email IS NULL
    OR char_length(v_email) > 160
    OR v_email !~ '^[^[:space:]@]+@[^[:space:]@.]+\.[^[:space:]@]{2,}$'
  THEN
    RAISE EXCEPTION 'invalid email';
  END IF;

  SELECT CASE p_song_id
    WHEN 'mrfy' THEN 228890
    WHEN 'kokosy' THEN 211250
    WHEN 'tabu' THEN 260300
  END,
  CASE p_song_id
    WHEN 'mrfy' THEN 387
    WHEN 'kokosy' THEN 451
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

  INSERT INTO public.leaderboard_entries (
    session_id, name, song_id, score, rating, perfect, good, misses
  ) VALUES (
    p_session_id, p_name, p_song_id, p_score, p_rating, p_perfect, p_good, p_misses
  )
  RETURNING * INTO v_entry;

  INSERT INTO public.leaderboard_contacts (entry_id, email)
  VALUES (v_entry.id, v_email);

  RETURN NEXT v_entry;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_leaderboard_score(UUID, TEXT, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, TEXT) TO anon, authenticated;

-- Krogi po starem chartu. Vnos in stik padeta skupaj s sejo prek ON DELETE CASCADE.
DELETE FROM public.leaderboard_sessions WHERE song_id = 'kokosy';
