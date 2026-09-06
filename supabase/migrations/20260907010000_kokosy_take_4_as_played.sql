-- Kokosy: chart je zdaj natanko posneti take 4, brez enega samega dodanega
-- tona. Prejšnja migracija je štela 423 not, ker je urejevalnikov samodejni
-- popravek v redek uvod vrinil pet svojih — te so ven. Ostane 417 not, kot so
-- bile natipkane, in s tem nižji strop:
--
--   mrfy    228890  (387 not)
--   kokosy  184400  (417 not)   ← spremenjeno
--   tabu    260300  (460 not)
--
-- Uvod komada je zato tih: prva ploščica pade ob 7,83 s, do 18. sekunde pa jih
-- pride ena na dobri dve sekundi in pol. Tako je zaigrano in tako ostane.
--
-- Krogi Kokosyja, odigrani po prejšnjem chartu, padejo: strop je bil drugačen,
-- zato v skupnem seštevku ne bi bili primerljivi. Druga dva komada ostaneta.

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
    WHEN 'kokosy' THEN 184400
    WHEN 'tabu' THEN 260300
  END,
  CASE p_song_id
    WHEN 'mrfy' THEN 387
    WHEN 'kokosy' THEN 417
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
