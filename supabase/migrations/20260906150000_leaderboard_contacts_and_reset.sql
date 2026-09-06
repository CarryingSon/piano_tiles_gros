-- Ob oddaji rezultata se zdaj lahko pusti tudi e-naslov, da je zmagovalca
-- sploh mogoče obvestiti o karti.
--
-- E-naslov NE gre v `leaderboard_entries`: nad to tabelo stoji politika
-- "Leaderboard is publicly readable" in `GRANT SELECT ... TO anon`, torej bi
-- ga lahko z javnim ključem prebral kdorkoli. Stiki zato živijo v svoji
-- tabeli, ki anonimnemu ključu ni dosegljiva — vanjo piše samo funkcija
-- `submit_leaderboard_score`, ki teče kot lastnik (SECURITY DEFINER).
--
-- Poleg tega izbriše dosedanje rezultate: odigrani so bili s tremi življenji
-- (zdaj je eno) in proti nižjemu stropu točk, zato niso primerljivi z novimi,
-- prav po njih pa se delijo tri brezplačne karte.
--
-- Trenutne meje (izpiše `node scripts/verify-game-data.mjs`):
--   mrfy    228890  (387 not)
--   kokosy  221900  (522 not)
--   tabu    260300  (460 not)

CREATE TABLE IF NOT EXISTS public.leaderboard_contacts (
  entry_id UUID PRIMARY KEY
    REFERENCES public.leaderboard_entries(id) ON DELETE CASCADE,
  email TEXT NOT NULL CHECK (
    char_length(email) BETWEEN 6 AND 160
    AND email ~ '^[^[:space:]@]+@[^[:space:]@.]+\.[^[:space:]@]{2,}$'
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Brez politike in brez pravic: tabela je dosegljiva samo lastniku sheme in
-- funkcijam, ki tečejo v njegovem imenu. Do e-naslovov se pride prek nadzorne
-- plošče Supabase, ne prek spletne strani.
ALTER TABLE public.leaderboard_contacts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.leaderboard_contacts FROM anon, authenticated;

-- Stara osemargumentna različica mora stran: PostgREST bi ob dveh preobtežbah
-- z istim imenom klic zavrnil kot dvoumen.
DROP FUNCTION IF EXISTS public.submit_leaderboard_score(
  UUID, TEXT, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER
);

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

  v_email := NULLIF(btrim(COALESCE(p_email, '')), '');
  IF v_email IS NOT NULL AND (
    char_length(v_email) > 160
    OR v_email !~ '^[^[:space:]@]+@[^[:space:]@.]+\.[^[:space:]@]{2,}$'
  ) THEN
    RAISE EXCEPTION 'invalid email';
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

  INSERT INTO public.leaderboard_entries (
    session_id, name, song_id, score, rating, perfect, good, misses
  ) VALUES (
    p_session_id, p_name, p_song_id, p_score, p_rating, p_perfect, p_good, p_misses
  )
  RETURNING * INTO v_entry;

  IF v_email IS NOT NULL THEN
    INSERT INTO public.leaderboard_contacts (entry_id, email)
    VALUES (v_entry.id, v_email);
  END IF;

  RETURN NEXT v_entry;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_leaderboard_score(UUID, TEXT, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, TEXT) TO anon, authenticated;

-- Izbris dosedanjih krogov. Vnosi in stiki padejo skupaj s sejami prek
-- ON DELETE CASCADE.
DELETE FROM public.leaderboard_sessions;
