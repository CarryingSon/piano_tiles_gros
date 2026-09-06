-- Skupna lestvica — tista, ki deli tri brezplačne karte — od zdaj šteje
-- seštevek vseh treh komadov, ne več enega samega najboljšega kroga. Igralec
-- prispeva svoj najboljši krog v vsakem komadu; kdor odigra le enega, ima
-- seštevek enega komada in stoji nižje od tistega s tremi.
--
-- Vrnjene vrstice skupne lestvice zato niso več posamezni vnosi:
--   * `song_id` je NULL (vrstica ni od enega komada),
--   * `song_count` pove, koliko komadov je v seštevku (1–3),
--   * `score`, `perfect`, `good` in `misses` so vsote,
--   * `rating` je delež VSEH možnih točk čez vse tri komade — vsota ocen,
--     deljena s tremi. Sam seštevek točk ne bi bil pošten kriterij, ker imajo
--     komadi različne stropove; nedokončan komplet pa mora ostati nižje, zato
--     se deli s tremi in ne s številom odigranih komadov.
--   * `created_at` je čas zadnjega kroga v seštevku: pri izenačenju je prej
--     zbrani seštevek pred pozneje zbranim.
--
-- Lestvica posameznega komada ostane, kar je bila: najboljši krog na igralca,
-- razvrščen po točkah, `song_count` je tam vedno 1.
--
-- Nova je oblika vrnjene tabele, zato gre stara različica prej ven —
-- `CREATE OR REPLACE` vrnjenega tipa ne more spremeniti.

DROP FUNCTION IF EXISTS public.get_public_leaderboard(TEXT, INTEGER);

CREATE FUNCTION public.get_public_leaderboard(
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
  WITH song_bests AS (
    -- Najboljši krog igralca v posameznem komadu. Igralec je ime brez ozira na
    -- velike črke — enako pravilo kot doslej.
    SELECT DISTINCT ON (LOWER(e.name), e.song_id)
      LOWER(e.name) AS player,
      e.id, e.name, e.song_id, e.score, e.rating,
      e.perfect, e.good, e.misses, e.created_at
    FROM public.leaderboard_entries e
    WHERE p_song_id IS NULL OR e.song_id = p_song_id
    ORDER BY LOWER(e.name), e.song_id, e.rating DESC, e.score DESC, e.created_at ASC
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
