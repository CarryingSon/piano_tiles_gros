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
na domači strani pa jo napoveduje sekcija »Misliš, da imaš ritem?«. Na
namiznem računalniku se namesto igralne površine pokaže QR-koda za odprtje
igre na telefonu.

Igra teče po vzoru Piano Tiles: ploščico tapneš v njeni stezi kadar koli,
odkar se prikaže — ciljne črte ni. Nižje ko je ploščica ob tapu, več točk
(Perfect proti Good). Dolgo ploščico držiš, dokler njen rep ne zapusti
igrišča. Na koncu se poleg rezultata izpiše največje možno število točk.

Igralec ima **tri življenja**. Zgrešena ploščica in tap v prazno stezo stanejo
enako — eno življenje —, tri napake pa končajo krog.

Težavnost raste vzdolž komada in vrh doseže v zaključku:

- ploščice padajo do **2,9-krat** hitreje kot na začetku, kar skrajša čas od
  prikaza do črte z 1,55 s na približno 0,53 s. Trenutek zadetka je vezan na
  noto v beatmapu, ne na hitrost, zato tapi ostanejo natanko na ritmu;
- okno za Perfect se po isti krivulji zoži s **530 ms na 250 ms**, pozno okno
  pa z 260 ms na 160 ms. Brez tega bi bila proti koncu vsaka zadeta ploščica
  samodejno Perfect, ker je na zaslonu manj časa, kot je široko okno;
- od **zadnjega refrena** naprej vse točke veljajo ×1,25.

Ob 10.000, 60.000 in 100.000 točkah igrišče na kratko proslavi; dosežene mejnike
pokaže tudi zaključni zaslon.

Ploščice sledijo **pevčevemu glasu**: vsak zapeti zlog je ploščica, dolgo
držan ton je dolga ploščica, steza pa pride iz višine tona — nizki toni levo,
visoki desno, tako da se plošča vzpenja in spušča z melodijo. Nekajkrat na
komad se ob najmočnejšem poudarku pojavita dve ploščici hkrati. Vsak komad ima
svojo barvo (MRFY oranžna, Kokosy roza, Tabu atlas rumena).

Refren se od kitice loči na pogled: ozadje dobi drugi, zgornji radij in zadiha v
tempu komada, ploščice pa nosijo polno barvo benda s širšim sijem, medtem ko so v
kitici zatemnjene. Ploščica je pobarvana po delu komada, ki mu **pripada**, ne po
tistem, ki teče — barva zato pripotuje po igrišču navzdol skupaj z glasbo,
namesto da bi vse ploščice na zaslonu hkrati preskočile.

Kjer se ne poje —
uvodi so dolgi tudi po dvajset sekund — se prikaže odštevanje do naslednje
ploščice, da igra ne izgleda pokvarjena.

En krog traja cel komad. Zvok je v `public/media/game/` kot mono AAC
(≈ 64 kbit/s, 1,8–2,0 MB na komad) in se pretaka, ne nalaga v pomnilnik.
Vsaka datoteka ima na začetku 3 sekunde tišine, čez katere teče odštevanje.

Note so v `src/data/charts.ts` — generirana datoteka, ki jo napiše
`scripts/build-charts.py` (potrebuje ffmpeg, numpy in Demucs). Skripta iz
mastra vzame tempo, iz izoliranega vokala pa note, njihovo dolžino in višino:

```bash
python3 -m demucs --two-stems=vocals -d mps -o stems master.mp3
python3 scripts/build-charts.py --preview \
    mrfy=master.mp3:stems/htdemucs/master/vocals.wav ... > src/data/charts.ts
```

Z `--preview` nastane za vsak komad še mp3 s klikom na vsaki ploščici — edini
zanesljiv način, da preverite, ali se ploščice ujemajo s petjem.

Za zamenjavo glasbe:

1. iz potrjenega mastra kodirajte predvajalno datoteko (ukaz je v glavi skripte)
   in jo shranite v `public/media/game/`;
2. z Demucsom izluščite vokal in z isto skripto zgenerirajte `src/data/charts.ts`;
3. v `gameSongs` v `src/data/game.ts` popravite `file`, izvajalca, naslov in barvo;
4. **zaženite novo SQL migracijo z mejami rezultata**, ki jih izpiše
   `node scripts/verify-game-data.mjs` — brez tega strežnik zavrne vsak
   rezultat;
5. poslušajte preview in na telefonu preverite prvih in zadnjih deset sekund.

Isto velja za vsako spremembo `scoring` v `src/data/game.ts`: strop rezultata se
premakne in migracija mora za njim. Skripta preverjanja obojo primerja in pade,
če se razideta.

Ostale nastavitve igre so v `src/data/game.ts`: podatki dogodka, Eventim URL,
hitrost padanja, končna hitrost, širina oken za zadetek, število življenj,
točkovanje s finale bonusom, mejniki za proslave, pragovi naslovov, barve in
besedilo za deljenje.

Uporaba glasbe mora biti pred javno objavo urejena z imetniki pravic.

## Supabase leaderboard

> **Branje lestvice deluje, oddaja pa je bila pokvarjena do 10. 8. 2026.** V
> bazi je ostala funkcija iz `20260809120000_leaderboard_full_songs.sql`
> (strop mrfy 173500), koda pa je bila že pri 215110. Funkcija oceno preračuna
> in zahteva natančno ujemanje, zato je padel *vsak* rezultat razen 0 — z
> `invalid score`. Popravek je
> `20260810100000_leaderboard_resync_and_reset.sql`; **dokler ni pognan v
> Supabase, oddaja ne deluje.** Ista datoteka počisti tudi stare vnose, ker so
> imeli oceno računano proti staremu stropu in bi bili na skupni lestvici
> napihnjeni.
>
> Vsaka nadaljnja sprememba točkovanja zahteva novo migracijo po istem vzorcu.
> Vse migracije za prvo samo zamenjajo `submit_leaderboard_score`, zato je ob
> zaostanku dovolj pognati zadnjo, ne vseh po vrsti.

Igra uporablja pravi skupni leaderboard brez prijave. Po koncu igralec vpiše
ime, rezultat pa se lahko odda samo enkrat za veljavno igralno sejo (med 10
sekundami in 15 minutami). Skupna lestvica rezultate različnih skladb primerja z normalizirano
oceno, zavihek izvajalca pa prikazuje surove točke za izbrano skladbo.
Na skupni lestvici se posamezno ime pojavi samo enkrat z najboljšim rezultatom.
Prva tri mesta so označena kot prejemniki 50-% popusta na vstopnico; pred javno
objavo mora organizator dopolniti uradna pravila, rok tekmovanja, reševanje
izenačenih rezultatov in način prevzema popusta.

### Prvi zagon baze

1. V projektu Supabase odprite **SQL Editor → New query**.
2. Zaženite migracije iz `supabase/migrations/` po vrsti, od najstarejše do
   najnovejše. Zadnja vedno nosi trenutne meje rezultata; brez nje strežnik
   zavrne vsak nov rezultat kot »invalid score«.
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
| `Countdown` | Odštevanje do začetka |
| `Lineup` | Zasedba 2026 |
| `Tickets` | Serije vstopnic in stanje prodaje |
| `GameTeaser` | Napoved igre in povezava na `/igra` |
| `Aftermovie` | Uradni aftermovie 2024 |
| `Timeline` | Postaje skozi leta (2022 → 2024 → 2026) |
| `CampaignSlider` | Uradne kampanjske objave 2026 |
| `Story` | Zgodba projekta |
| `Partners` | Trak partnerjev z mirujočim osrednjim logotipom |
| `PracticalInfo` | Praktične informacije |
| `AddToCalendar` | Gumb »Dodaj v koledar« (v `PracticalInfo`) |
| `Footer` | Kontakt, družbena omrežja |

Vrstni red v tabeli ustreza vrstnemu redu sekcij v `src/app/page.tsx`.

### Partnerji

Logotipe ureja seznam `partners` v `src/data/event.ts`, osrednji mirujoči
logotip pa `featuredPartner`. Vsak vnos ima `url` — uradno stran partnerja,
na katero logotip vodi v novem zavihku. Datoteke so v `public/media/partners/` —
obrezani in pomanjšani izvirniki iz organizatorjeve mape »GLATLAS 2026«,
vsi beli na prosojnem ozadju. Nov logotip pripravite enako: odrežite prosojni
rob, pomanjšajte na največ 560 × 160 in v `event.ts` vpišite **dejanske** mere
obrezane datoteke, sicer `next/image` rezervira napačen prostor.

Trak teče na čistem CSS-u (`marquee-track` v `globals.css`). Seznam se v
oznakah izriše dvakrat, animacija pa ga premakne za polovico širine — od tod
neopazna zanka. Kdor ima izklopljene animacije, dobi mirno prelomljeno vrsto
vseh logotipov (`partners-static`).

### Dodaj v koledar

`AddToCalendar` ne uporablja JavaScripta ne zunanjih skriptov. Glavna povezava
vodi na `/koledar.ics` — datoteko sestavi `src/lib/calendar.ts` iz podatkov v
`src/data/event.ts`, zato sprememba datuma ali prizorišča samodejno velja tudi
za koledarske vnose. Zraven je povezava na že izpolnjen obrazec Google
Koledarja za tiste, ki koledar vodijo v brskalniku.

Ob **vsebinski** spremembi dogodka (datum, ura, prizorišče) povišajte
`SEQUENCE` v `src/lib/calendar.ts`, sicer koledarji pri obstoječih vnosih
posodobitve ne prevzamejo — `UID` je namenoma stalen, da ponoven prenos ne
ustvari podvojenega dogodka.

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
- `/koledar.ics` — koledarski vnos za gumb »Dodaj v koledar«;
- `/sitemap.xml` in `/robots.txt` — iskalniki.

Pred produkcijskim deploymentom:

1. zaženite Supabase migracijo iz prejšnjega poglavja;
2. v Vercelu dodajte vse tri spremenljivke iz `.env.example` za Production,
   Preview in Development;
3. `NEXT_PUBLIC_SITE_URL` nastavite na končno domeno brez končne poševnice;
4. sprožite nov deployment, ker se nove okoljske spremenljivke ne dodajo že
   obstoječim deploymentom;
5. preverite `/`, `/igra`, oddajo rezultata in Eventim povezavo.
