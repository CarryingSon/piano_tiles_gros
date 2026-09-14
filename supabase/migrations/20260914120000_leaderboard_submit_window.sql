-- POPRAVEK: oddaja rezultata je občasno javila, da rezultata ni mogoče
-- shraniti, ob ponovnem pritisku pa se je shranila.
--
-- Vzrok je bil desetsekundni prag v tej funkciji:
--
--   AND started_at <= NOW() - INTERVAL '10 seconds'
--
-- Seja se ustvari, ko se komad začne nalagati. Ko je bilo življenj še pet, je
-- krog vedno trajal dlje od desetih sekund. Z enim življenjem pa je konec pri
-- prvi napaki: prva nota pade pri 3,51 s (MRFY) oz. 3,53 s (Tabu), krog se
-- lahko konča pri štirih sekundah, obrazec pa je igralcu, ki je že kdaj
-- oddajal, vnaprej izpolnjen iz brskalnika — pritisne lahko takoj. Oddaja pri
-- ~6 s je zato padla mimo praga, UPDATE ni našel vrstice, funkcija je vrnila
-- prazno množico in stran je javila napako. Čez nekaj sekund je isti pritisk
-- uspel. Od tod "včasih", od tod "pritisni še enkrat".
--
-- Trije popravki:
--
-- 1. Prag pade z 10 s na 3 s — na dolžino tihe glave za odštevanje. Pred njo
--    nobene note ni, torej noben pošten krog ne more oddati prej.
-- 2. Rok se podaljša s 15 na 30 minut. Igralec po koncu kroga bere lestvico,
--    tipka ime in e-naslov na telefonu; zavreči pošteno odigran krog je slabše
--    od tveganja, da kdo sejo drži odprto. Seja je tako ali tako enkratna.
-- 3. Oddaja postane idempotentna in razlogi za zavrnitev ločeni. Če je krog že
--    na lestvici, funkcija vrne obstoječi vnos namesto napake — dosedaj je
--    izgubljen odgovor (slaba mobilna povezava, zaprt zavihek) pomenil, da je
--    bil rezultat shranjen, igralec pa je do konca videl samo napako. Namesto
--    tihega `RETURN` zdaj pove, kaj je narobe, in stran lahko na "session too
--    soon" sama počaka in poskusi znova, namesto da to nalaga igralcu.
--
-- Stropi in število not se ne spremenijo — težavnost je drugačna, `scoring` pa
-- ne (preveri z `node scripts/verify-game-data.mjs`):
--   mrfy    228890  (387 not)
--   kokosy  211250  (451 not)
--   tabu    283570  (586 not)

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
  v_session public.leaderboard_sessions;
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
    WHEN 'tabu' THEN 283570
  END,
  CASE p_song_id
    WHEN 'mrfy' THEN 387
    WHEN 'kokosy' THEN 451
    WHEN 'tabu' THEN 586
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

  SELECT * INTO v_session
  FROM public.leaderboard_sessions
  WHERE id = p_session_id AND song_id = p_song_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown session';
  END IF;

  -- Krog je že oddan: vrni, kar na lestvici že stoji. Ponovni pritisk tako
  -- pokaže isti vnos namesto napake, oddaja pa ničesar ne prepiše.
  IF v_session.completed_at IS NOT NULL THEN
    SELECT * INTO v_entry
    FROM public.leaderboard_entries
    WHERE session_id = p_session_id;
    IF FOUND THEN
      RETURN NEXT v_entry;
      RETURN;
    END IF;
    RAISE EXCEPTION 'already submitted';
  END IF;

  -- Tiha glava za odštevanje traja 3 s; prej ni nobene note, torej ni kaj
  -- oddati. Stran to ujame in čez hip poskusi znova.
  IF v_session.started_at > NOW() - INTERVAL '3 seconds' THEN
    RAISE EXCEPTION 'session too soon';
  END IF;

  IF v_session.started_at < NOW() - INTERVAL '30 minutes' THEN
    RAISE EXCEPTION 'session expired';
  END IF;

  -- Sejo si prilasti šele ta UPDATE: `completed_at IS NULL` v pogoju pomeni,
  -- da pri dveh hkratnih oddajah ene in iste seje uspe natanko ena.
  UPDATE public.leaderboard_sessions
  SET completed_at = NOW()
  WHERE id = p_session_id
    AND completed_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'already submitted';
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
