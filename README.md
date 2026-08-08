# Glasbeni Atlas 2026 — pristajalna stran

Custom pristajalna stran za Glasbeni Atlas 2026 (Kokosy, MRFY, Tabu — 10. 10.
2026, Parkirišče Ivančna Gorica). Zgrajena z Next.js 16 (App Router),
TypeScript in Tailwind CSS 4.

## Zagon

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # produkcijski build
npm run lint     # ESLint
```

## Igra »Ujemi ritem«

Samostojna mobilna igra je na poti [`/igra`](http://localhost:3000/igra),
na domači strani pa jo napoveduje sekcija »Misliš, da imaš ritem?«.

Vse nastavitve igre so v `src/data/game.ts`: podatki dogodka, Eventim URL,
BPM, zvočni zamik, timing okna, točkovanje, pragovi naslovov, barve, besedilo
za deljenje in beat mapi. Trije 36-sekundni izseki so v `public/media/game/`:
MRFY — »Prjatučki«, Kokosy — »Planeti se vrtijo« in Tabu — »Poljubljena«.

Za zamenjavo glasbe:

1. novo, za uporabo potrjeno datoteko skopirajte v `public/media/game/`;
2. v `gameConfig.audio` popravite `file`, `bpm`, `offset` in `duration`;
3. note v `gameConfig.notes` oziroma funkciji `createBeatMap` časovno prilagodite
   novemu posnetku;
4. na telefonu preverite prvih in zadnjih deset sekund igre.

Uporaba glasbenih izsekov mora biti pred javno objavo urejena z imetniki pravic.

## Supabase leaderboard

Igra uporablja pravi skupni leaderboard brez prijave. Po koncu igralec vpiše
ime, rezultat pa se lahko odda samo enkrat za veljavno 30–45-sekundno igralno
sejo. Skupna lestvica rezultate različnih skladb primerja z normalizirano
oceno, zavihek izvajalca pa prikazuje surove točke za izbrano skladbo.

### Prvi zagon baze

1. V projektu Supabase odprite **SQL Editor → New query**.
2. Kopirajte in zaženite celotno datoteko
   `supabase/migrations/20260808190000_leaderboard.sql`.
3. Lokalno ustvarite `.env.local` po vzoru `.env.example`.
4. V Vercelu pod **Project Settings → Environment Variables** dodajte:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in
   `NEXT_PUBLIC_SITE_URL`.
5. Po dodajanju spremenljivk sprožite nov deployment.

SQL migracija vključi RLS. Javni ključ lahko samo bere javno lestvico in kliče
omejene funkcije za začetek ter zaključek igralne seje; neposreden zapis v
tabele in dostop do sej nista dovoljena. `service_role` ključ ni potreben in
ne sme biti izpostavljen v brskalniku.

## Urejanje vsebine

Vse dejstvo, povezave, ceno vstopnic, zasedbo in podatke o organizatorju
urejate na enem mestu: [`src/data/event.ts`](src/data/event.ts). Ta datoteka
vsebuje podroben seznam TODO-jev na vrhu — stvari, ki jih morajo
organizatorji potrditi pred objavo (ura vrat, cena vstopnic, statistika,
uradne fotografije skupin).

## Medijske datoteke

`public/media/` vsebuje lokalne, optimizirane kopije uradnih fotografij in
video izsekov Glasbenega Atlasa (arhiv ŠK GROŠ, izdaji 2022 in 2024). Next.js
`<Image>` samodejno generira AVIF/WebP različice ob strežbi.

`public/media/lineup/` in `public/media/campaign/` sta izrezana oziroma
pretvorjena iz organizatorjevih Instagram-grafik "GLATLAS 2026" (plakat,
datum, lokacija in napovedi nastopajočih) — vir za fotografije skupin v
sekciji Izvajalci in za drsnik s kampanjo.

## Struktura komponent

Vsaka sekcija strani je svoja komponenta v `src/components/`:

| Komponenta | Sekcija |
|---|---|
| `Nav` | Lepljiva navigacija + mobilni CTA |
| `Hero` | Junaški del s posterjem/videom |
| `Experience` | Doživetje — fotografski kolaž |
| `GameTeaser` | Napoved igre in povezava na `/igra` |
| `Aftermovie` | Uradni aftermovie 2024 |
| `Timeline` | Postaje skozi leta (2022 → 2024 → 2026) |
| `Lineup` | Zasedba 2026 |
| `CampaignSlider` | Uradne kampanjske objave 2026 |
| `Story` | Zgodba projekta |
| `PracticalInfo` | Praktične informacije |
| `FinalCta` | Zaključni konverzijski del |
| `Footer` | Kontakt, družbena omrežja |

## Pred objavo preverite

Glejte TODO-sekcijo v `src/data/event.ts` — vključuje potrditev ure vrat in
cene vstopnic.

## Objava na Vercelu

Landing page in igra sta namenoma v istem repozitoriju in istem Next.js
projektu. Po povezavi GitHub repozitorija `CarryingSon/piano_tiles_gros`
Vercel sam zazna framework; Root Directory naj ostane koren repozitorija,
Build Command pa privzeti `npm run build`.

Produkcijske poti:

- `/` — landing page;
- `/igra` — mobilna ritmična igra;
- `/api/leaderboard` — strežniški Supabase API;
- `/sitemap.xml` in `/robots.txt` — iskalniki.

Pred produkcijskim deploymentom:

1. zaženite Supabase migracijo iz prejšnjega poglavja;
2. v Vercelu dodajte vse tri spremenljivke iz `.env.example` za Production,
   Preview in Development;
3. `NEXT_PUBLIC_SITE_URL` nastavite na končno domeno brez končne poševnice;
4. sprožite nov deployment, ker se nove okoljske spremenljivke ne dodajo že
   obstoječim deploymentom;
5. preverite `/`, `/igra`, oddajo rezultata in Eventim povezavo.
