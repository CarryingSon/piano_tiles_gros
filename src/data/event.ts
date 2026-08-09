/**
 * ─────────────────────────────────────────────────────────────────────────────
 * GLASBENI ATLAS 2026 — osrednja podatkovna datoteka
 *
 * Vse vsebine, povezave in dejstva na strani se urejajo TUKAJ.
 * Viri: www.klub-gros.com/glasbeni-atlas-2-4/ in www.eventim.si/en/artist/glasbeni-atlas/
 * (stanje: 8. 8. 2026)
 *
 * TODO za organizatorje — pred objavo potrdite:
 *  1. Začetek ob 19.00 je naveden po Eventimu; odštevalnik na klub-gros.com
 *     cilja na 18.00. Če se vrata odprejo ob 18.00, vpišite `doorsTime`.
 *  2. Cena "od 16 €" je bila prevzeta z Eventima 8. 8. 2026 — preverite ob objavi.
 *  3. Statistika (obiskovalci, prostovoljci …) na klub-gros.com ni bila berljiva
 *     (animirani števci kažejo 0) — sekcija je zato izklopljena, glej `stats`.
 *  4. `siteUrl` nastavite na končno domeno pred objavo.
 *
 * Uradne fotografije skupin (lineup) in kampanjski plakati (campaign) so
 * izrezani/pretvorjeni iz organizatorjevih Instagram-grafik "GLATLAS 2026".
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const site = {
  /** Na Vercelu nastavite NEXT_PUBLIC_SITE_URL na končno domeno brez končne poševnice. */
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? "https://glasbeniatlas.si").replace(/\/$/, ""),
  title: "Glasbeni Atlas 2026 — 10. 10. 2026, Ivančna Gorica",
  description:
    "Kokosy, MRFY in Tabu na enem odru. Glasbeni Atlas — koncertni projekt Študentskega kluba GROŠ, ki ga v celoti organizirajo študentje in dijaki. 10. oktober 2026, Parkirišče Ivančna Gorica. Vstopnice na Eventimu.",
  ogImage: "/media/og-glasbeni-atlas-2026.jpg",
} as const;

export const event = {
  name: "Glasbeni Atlas 2026",
  /** Krilatica z uradne strani dogodka. */
  tagline: "Glasba. Ljubezen. Užitek.",
  dateHuman: "10. 10. 2026",
  dateLong: "sobota, 10. oktober 2026",
  /** ISO za schema.org — začetek po Eventimu (19.00, CEST). */
  startIso: "2026-10-10T19:00:00+02:00",
  /** Začetek koncerta po Eventimu. Odštevalnik na klub-gros.com cilja 18.00 — verjetno vrata. */
  startTimeHuman: "ob 19.00",
  /** TODO: potrdite uro odprtja vrat (null = se ne prikaže). */
  doorsTime: null as string | null,
  venue: "Parkirišče Ivančna Gorica",
  city: "Ivančna Gorica",
  country: "SI",
  /** Koordinate prizorišča — potrjene prek uradne Google Maps lokacijske povezave. */
  coords: { lat: "45.9372° N", lng: "14.8064° E" },
  mapsUrl: "https://www.google.com/maps/search/?api=1&query=45.937179,14.806368",
} as const;

export const tickets = {
  /** Vsi CTA-ji za vstopnice vodijo SEM. */
  url: "https://www.eventim.si/en/artist/glasbeni-atlas/",
  /** Stanje prodaje, preverjeno na Eventimu 8. 8. 2026 (dogodek izpisan s ceno "od 16,00 €"). */
  onSale: true,
  priceFromHuman: "od 16 €",
  priceFrom: 16,
  currency: "EUR",
  provider: "Eventim SI",
  ctaLabel: "Kupi vstopnice",
  ctaLabelLong: "Kupi vstopnice na Eventimu",
} as const;

export type Performer = {
  name: string;
  /** Kratek, preverjen opis — brez izmišljenih biografij. */
  description: string;
  /** Pot do uradne fotografije v /public. null → označen nadomestni okvir. */
  image: string | null;
  /** Oznaka na "legendi zemljevida". */
  index: string;
};

/** Zasedba 2026 — potrjena na Eventimu in družbenih omrežjih ŠK GROŠ. */
export const lineup: Performer[] = [
  {
    index: "01",
    name: "Kokosy",
    description:
      "Ena najbolj prepoznavnih zasedb nove slovenske scene — koncerti, ki jih publika poje na pamet.",
    image: "/media/lineup/kokosy.jpg",
  },
  {
    index: "02",
    name: "MRFY",
    description: "Indie rock iz Novega mesta. Kitare, ki napolnijo šotor.",
    image: "/media/lineup/mrfy.jpg",
  },
  {
    index: "03",
    name: "Tabu",
    description:
      "Ena najbolj priljubljenih slovenskih pop-rock zasedb z več kot 25 leti uspešnic.",
    image: "/media/lineup/tabu.jpg",
  },
];

export type Edition = {
  year: string;
  stopLabel: string;
  city: string;
  dateHuman: string;
  performers: string[];
  note?: string;
  image: { src: string; alt: string; width: number; height: number } | null;
};

/** Pretekli izdaji — potrjeni na klub-gros.com in Eventimu. */
export const editions: Edition[] = [
  {
    year: "2022",
    stopLabel: "Prva postaja",
    city: "Grosuplje",
    dateHuman: "23. april 2022",
    performers: ["Joker Out", "Koala Voice"],
    note: "Ideja, rojena po 20. obletnici kluba, je prvič oživela pred Gasilskim centrom Grosuplje.",
    image: {
      src: "/media/2022/priklon-benda-2022.jpg",
      alt: "Nastopajoči se ob koncu koncerta priklonijo publiki na odru Glasbenega Atlasa 2022.",
      width: 1600,
      height: 1067,
    },
  },
  {
    year: "2024",
    stopLabel: "Druga postaja",
    city: "Grosuplje",
    dateHuman: "5. oktober 2024",
    performers: ["Siddharta", "Dan D", "Jet Black Diamonds", "Kreera"],
    note: "Ob 25-letnici ŠK GROŠ so se mladim zasedbam na odru pridružila največja imena slovenskega rocka.",
    image: {
      src: "/media/2024/pevka-v-modri-luci-2024.jpg",
      alt: "Pevka v modri odrski svetlobi na Glasbenem Atlasu 2024.",
      width: 1600,
      height: 1067,
    },
  },
  {
    year: "2026",
    stopLabel: "Naslednja postaja",
    city: "Ivančna Gorica",
    dateHuman: "10. oktober 2026",
    performers: ["Kokosy", "MRFY", "Tabu"],
    note: "Atlas se prvič seli v Ivančno Gorico. Zgodba se piše naprej — tokrat s tabo.",
    image: null,
  },
];

/**
 * Zgodba projekta — skrajšano po uradnem besedilu na klub-gros.com.
 */
export const story = {
  quote: "Mladim damo prostor, oder in priložnost.",
  paragraphs: [
    "Glasbeni Atlas smo ustvarili, ker smo želeli v domačem okolju narediti nekaj več — dogodek, ki ne temelji le na eni noči zabave. Po 20. obletnici kluba je ideja rasla, leta 2022 pa smo jo prvič uresničili.",
    "Dogodek v celoti organiziramo študentje in dijaki: od ideje, organizacije in produkcije do izvedbe. Vse nastaja znotraj ekipe, ki verjame v projekt in vanj vlaga svoj čas.",
    "Na odru združujemo mlade, perspektivne izvajalce in uveljavljena imena slovenske scene. Zmagovalcu Bitke bendov ponujamo mesto predskupine — tako oder vsako izdajo odpre nekomu novemu.",
    "Dogodek iz leta v leto raste — po obisku, odzivu in zanimanju partnerjev. Za nas ni le koncert, ampak projekt, ki povezuje generacije, glasbo in lokalno okolje.",
  ],
} as const;

/**
 * Statistika ("Glasbeni Atlas v številkah") — na izvorni strani so animirani
 * števci ob zajemu kazali 0, zato zanesljivih vrednosti NI in sekcija je
 * izklopljena. Ko organizatorji potrdite prave številke, jih vpišite spodaj
 * in postavite `enabled: true` — sekcija se bo prikazala samodejno.
 */
export const stats = {
  enabled: false,
  items: [
    { value: null as number | null, label: "edicije" },
    { value: null as number | null, label: "obiskovalcev" },
    { value: null as number | null, label: "glasbenih skupin" },
    { value: null as number | null, label: "prostovoljcev" },
  ],
} as const;

export const aftermovies = [
  {
    year: "2024",
    /** Lokalna kopija uradnega aftermovia 2024 (izvirnik: YouTube kanal ŠK GROŠ). */
    src: "/media/video/aftermovie-2024.mp4",
    poster: "/media/video/aftermovie-poster.jpg",
    duration: "1:03",
  },
  {
    year: "2022",
    /** Lokalna kopija uradnega aftermovia 2022 (izvirnik: YouTube kanal ŠK GROŠ). */
    src: "/media/video/aftermovie-2022.mp4",
    poster: "/media/video/aftermovie-2022-poster.jpg",
    duration: "1:35",
  },
] as const;

export const heroMedia = {
  /** Kratek, utišan izsek iz uradnega aftermovia 2024 (last ŠK GROŠ). */
  videoMp4: "/media/video/hero-loop.mp4",
  videoWebm: "/media/video/hero-loop.webm",
  poster: "/media/video/hero-poster.jpg",
  posterAlt:
    "Polna dvorana pod šotorom na Glasbenem Atlasu 2024 — publika pred odrom v soju žarometov.",
} as const;

export const organizer = {
  name: "Študentski klub GROŠ",
  shortName: "ŠK GROŠ",
  address: "Industrijska cesta 1g, 1290 Grosuplje",
  email: "studentski@klub-gros.com",
  phone: "041 358 392",
  phoneHref: "+38641358392",
  president: { name: "Anja Jančar", email: "predsednik@klub-gros.com" },
  website: "https://www.klub-gros.com",
  eventPage: "https://www.klub-gros.com/glasbeni-atlas-2-4/",
  socials: [
    { label: "Facebook", url: "https://www.facebook.com/sk.gros/" },
    { label: "Instagram", url: "https://www.instagram.com/sk.gros/" },
    { label: "TikTok", url: "https://www.tiktok.com/@sk.gros" },
    {
      label: "Spotify",
      url: "https://open.spotify.com/user/31cgl5dlpe3tud5o4cui2i3kwqhm",
    },
    { label: "YouTube", url: "https://www.youtube.com/@%C5%A1k.gro%C5%A1" },
  ],
} as const;

/** Sidra navigacije. */
export const navLinks = [
  { href: "#dozivetje", label: "Doživetje" },
  { href: "#izvajalci", label: "Izvajalci" },
  { href: "#zgodba", label: "Zgodba" },
  { href: "#informacije", label: "Informacije" },
] as const;

/**
 * Kampanjski plakati (Instagram objave 2026) — uradne grafike organizatorja,
 * v izvirnem pokončnem formatu 4:5. Uporabljeni v sliderju na domači strani.
 */
export const campaign = [
  {
    src: "/media/campaign/glasbeni-atlas.jpg",
    alt: "Osrednji plakat Glasbenega Atlasa 2026 s črno-belim fotografskim kolažem.",
  },
  {
    src: "/media/campaign/datum.jpg",
    alt: "Objava z datumom dogodka: 10. 10. 2026.",
  },
  {
    src: "/media/campaign/lokacija.jpg",
    alt: "Objava z lokacijo dogodka: Ivančna Gorica.",
  },
  {
    src: "/media/campaign/kokosy-post.jpg",
    alt: "Napoved nastopa skupine Kokosy na Glasbenem Atlasu 2026.",
  },
  {
    src: "/media/campaign/mrfy-post.jpg",
    alt: "Napoved nastopa skupine MRFY na Glasbenem Atlasu 2026.",
  },
  {
    src: "/media/campaign/tabu-post.jpg",
    alt: "Napoved nastopa skupine Tabu na Glasbenem Atlasu 2026.",
  },
] as const;
