/**
 * Razglašeni zmagovalci Glatlas Game — prvi trije po skupnem seštevku, ki
 * dobijo zastonj karto za Glasbeni Atlas 2026.
 *
 * Zapisani so na roke in ne bereni z lestvice: lestvica teče naprej in igra se
 * da igrati tudi po razglasitvi, nagrada pa je podeljena. Kdor zmagovalce
 * zdaj prehiti, stoji na lestvici višje, karte pa ne dobi več.
 *
 * Stanje skupne lestvice ob razglasitvi, 9. 10. 2026. Ločen modul, da ga
 * domača stran lahko uvozi, ne da bi s sabo potegnila `data/game.ts` z notami.
 */

export type Winner = {
  place: 1 | 2 | 3;
  name: string;
  /** Seštevek točk vseh treh komadov. */
  score: number;
  /** Delež vseh možnih točk v stotinkah odstotka (9943 = 99,43 %). */
  rating: number;
};

export const winners: Winner[] = [
  { place: 1, name: "Nejc", score: 719507, rating: 9943 },
  { place: 2, name: "Žan", score: 719363, rating: 9941 },
  { place: 3, name: "Marcel", score: 719305, rating: 9936 },
];
