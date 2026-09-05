import type { Metadata } from "next";
import { Anton, Space_Grotesk } from "next/font/google";
import { event, lineup, organizer, site, tickets } from "@/data/event";
import "./globals.css";

const anton = Anton({
  variable: "--font-anton",
  weight: "400",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

const grotesk = Space_Grotesk({
  variable: "--font-grotesk",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  /* V zavihku naj stoji samo datum dogodka; celoten naslov ostane v OG in
     Twitter podatkih, kjer ga vidijo delitve povezave. Ikona je logotip ŠK
     GROŠ (src/app/icon.png), enak kot na klub-gros.com. */
  title: event.dateHuman,
  description: site.description,
  alternates: { canonical: "/" },
  openGraph: {
    title: site.title,
    description: site.description,
    url: "/",
    siteName: "Glasbeni Atlas",
    locale: "sl_SI",
    type: "website",
    images: [
      {
        url: site.ogImage,
        width: 1200,
        height: 630,
        alt: "Glasbeni Atlas — uradni vizual: logotip na črno-beli koncertni fotografiji.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: site.title,
    description: site.description,
    images: [site.ogImage],
  },
};

/** Strukturirani podatki schema.org/MusicEvent za iskalnike. */
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "MusicEvent",
  name: event.name,
  startDate: event.startIso,
  eventStatus: "https://schema.org/EventScheduled",
  eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
  location: {
    "@type": "Place",
    name: event.venue,
    address: {
      "@type": "PostalAddress",
      addressLocality: event.city,
      addressCountry: event.country,
    },
  },
  image: [`${site.url}${site.ogImage}`],
  description: site.description,
  performer: lineup.map((p) => ({ "@type": "MusicGroup", name: p.name })),
  organizer: {
    "@type": "Organization",
    name: organizer.name,
    url: organizer.website,
  },
  offers: {
    "@type": "Offer",
    url: tickets.url,
    price: tickets.priceFrom,
    priceCurrency: tickets.currency,
    availability: tickets.onSale
      ? "https://schema.org/InStock"
      : "https://schema.org/SoldOut",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // `data-scroll-behavior="smooth"` je od Next 16 obvezen dodatek k
    // `scroll-behavior: smooth` iz globals.css: brez njega router med
    // navigacijo te nastavitve ne prepiše več, zato se skok na vrh animira
    // namesto da bi bil trenuten — in vrnitev iz /igre pristane na sredini
    // oziroma na dnu strani. Z atributom router med prehodom začasno vklopi
    // `auto`, skoči na vrh in nato vrne mehko drsenje za sidra v navigaciji.
    <html
      lang="sl"
      data-scroll-behavior="smooth"
      className={`${anton.variable} ${grotesk.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {children}
      </body>
    </html>
  );
}
