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

## Struktura komponent

Vsaka sekcija strani je svoja komponenta v `src/components/`:

| Komponenta | Sekcija |
|---|---|
| `Nav` | Lepljiva navigacija + mobilni CTA |
| `Hero` | Junaški del s posterjem/videom |
| `Experience` | Doživetje — fotografski kolaž |
| `Aftermovie` | Uradni aftermovie 2024 |
| `Timeline` | Postaje skozi leta (2022 → 2024 → 2026) |
| `Lineup` | Zasedba 2026 |
| `Story` | Zgodba projekta |
| `PracticalInfo` | Praktične informacije |
| `FinalCta` | Zaključni konverzijski del |
| `Footer` | Kontakt, družbena omrežja |

## Pred objavo preverite

Glejte TODO-sekcijo v `src/data/event.ts` — vključuje potrditev ure vrat,
cene vstopnic in manjkajočih uradnih fotografij skupin Kokosy, MRFY in Tabu.
