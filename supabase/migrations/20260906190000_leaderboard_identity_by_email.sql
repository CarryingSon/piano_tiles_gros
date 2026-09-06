-- Igralca odslej prepozna e-naslov, ne ime.
--
-- Doslej sta se najboljši krog in skupni seštevek računala po `LOWER(name)`:
-- dva človeka z istim vzdevkom sta bila en igralec, isti človek z „Jure" in
-- „jure123" pa dva. Ker se tri karte delijo po seštevku vseh treh komadov,
-- mora biti ključ nekaj, kar igralec pri vsakem krogu vpiše enako — to je
-- e-naslov, ki ga tako ali tako potrebujemo, da zmagovalca sploh obvestimo.
--
-- E-naslov zato postane obvezen. Stari vnosi brez njega se še vedno združujejo
-- po imenu (predpona `ime:` proti `mail:` prepreči, da bi se ime, ki je videti
-- kot e-naslov, zlilo s pravim e-naslovom).
--
-- E-naslovi ostanejo v `leaderboard_contacts`, ki anonimnemu ključu ni
-- dosegljiva. Sem pridejo samo kot ključ združevanja znotraj funkcije, ki teče
-- kot lastnik; med vrnjenimi stolpci e-naslova ni.

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

  INSERT INTO public.leaderboard_contacts (entry_id, email)
  VALUES (v_entry.id, v_email);

  RETURN NEXT v_entry;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_leaderboard_score(UUID, TEXT, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_public_leaderboard(
  p_song_id TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  song_id TEXT,
  song_count INTEGER,
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
  WITH played AS (
    -- Kdo je kdo: e-naslov vnosa, sicer ime (stari vnosi izpred obveznega
    -- e-naslova). E-naslov ne gre nikamor naprej, služi samo kot ključ.
    SELECT e.id, e.name, e.song_id, e.score, e.rating,
      e.perfect, e.good, e.misses, e.created_at,
      COALESCE('mail:' || lower(c.email), 'ime:' || lower(e.name)) AS player
    FROM public.leaderboard_entries e
    LEFT JOIN public.leaderboard_contacts c ON c.entry_id = e.id
    WHERE p_song_id IS NULL OR e.song_id = p_song_id
  ), song_bests AS (
    -- Najboljši krog igralca v posameznem komadu.
    SELECT DISTINCT ON (p.player, p.song_id)
      p.player, p.id, p.name, p.song_id, p.score, p.rating,
      p.perfect, p.good, p.misses, p.created_at
    FROM played p
    ORDER BY p.player, p.song_id, p.rating DESC, p.score DESC, p.created_at ASC
  ), overall AS (
    SELECT
      -- Vrstica seštevka nima svojega zapisa; nosi `id` in zapis imena tistega
      -- kroga, ki je v seštevku najboljši, da ostane ključ stabilen.
      (array_agg(b.id ORDER BY b.rating DESC, b.created_at ASC))[1] AS id,
      (array_agg(b.name ORDER BY b.rating DESC, b.created_at ASC))[1] AS name,
      NULL::TEXT AS song_id,
      COUNT(*)::INTEGER AS song_count,
      SUM(b.score)::INTEGER AS score,
      -- Tri: MRFY, Kokosy in Tabu — isti trije komadi, katerih stropi stojijo
      -- v `submit_leaderboard_score`.
      ROUND(SUM(b.rating)::numeric / 3)::INTEGER AS rating,
      SUM(b.perfect)::INTEGER AS perfect,
      SUM(b.good)::INTEGER AS good,
      SUM(b.misses)::INTEGER AS misses,
      MAX(b.created_at) AS created_at
    FROM song_bests b
    WHERE p_song_id IS NULL
    GROUP BY b.player
  )
  SELECT r.id, r.name, r.song_id, r.song_count, r.score, r.rating,
    r.perfect, r.good, r.misses, r.created_at
  FROM (
    SELECT o.* FROM overall o
    UNION ALL
    SELECT b.id, b.name, b.song_id, 1 AS song_count, b.score, b.rating,
      b.perfect, b.good, b.misses, b.created_at
    FROM song_bests b
    WHERE p_song_id IS NOT NULL
  ) r
  ORDER BY r.rating DESC, r.score DESC, r.created_at ASC
  LIMIT LEAST(GREATEST(p_limit, 1), 100);
$$;

REVOKE ALL ON FUNCTION public.get_public_leaderboard(TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_leaderboard(TEXT, INTEGER) TO anon, authenticated;

-- Izbris dosedanjih krogov: oddani so bili brez obveznega e-naslova, torej
-- brez ključa, po katerem se odslej seštevajo, in po pravilih, ki so se med
-- tem spremenila. Vnosi in stiki padejo skupaj s sejami prek ON DELETE CASCADE.
DELETE FROM public.leaderboard_sessions;
