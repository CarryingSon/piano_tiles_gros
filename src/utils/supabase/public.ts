import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Odjemalec za branje javne lestvice. Za razliko od `./server` se piškotkov ne
 * dotakne — in prav v tem je bistvo: branje lestvice je anonimno, `cookies()`
 * pa pot v Next.js razglasi za dinamično in ji povozi glavo `Cache-Control` z
 * `no-store`. Brez piškotkov sme lestvico postreči Vercelov rob, tako da vsi
 * hkratni gledalci porabijo en sam klic v bazo.
 *
 * Seja tu ne manjka nikomur: `get_public_leaderboard` teče kot lastnik
 * (SECURITY DEFINER) in je anonimnemu ključu na voljo tako ali tako.
 */
export function createPublicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_UNAVAILABLE");

  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
