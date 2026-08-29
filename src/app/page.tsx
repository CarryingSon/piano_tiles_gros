import Aftermovie from "@/components/Aftermovie";
import Countdown from "@/components/Countdown";
import Experience from "@/components/Experience";
import GameTeaser from "@/components/GameTeaser";
import Footer from "@/components/Footer";
import Hero from "@/components/Hero";
import Lineup from "@/components/Lineup";
import Nav from "@/components/Nav";
import Partners from "@/components/Partners";
import PracticalInfo from "@/components/PracticalInfo";
import Reveal from "@/components/Reveal";
import Story from "@/components/Story";
import Tickets from "@/components/Tickets";
import Timeline from "@/components/Timeline";

export default function Home() {
  return (
    <>
      <Reveal />
      <Nav />
      <main>
        <Hero />
        <Experience />
        {/* Odštevanje stoji med Doživetjem in Izvajalci: najprej vzdušje,
            nato konkreten datum, šele potem imena na plakatu. */}
        <Countdown />
        <Lineup />
        {/* Stanje prodaje takoj za zasedbo: šele ko obiskovalec ve, kdo igra,
            ga zanima, koliko stane. */}
        <Tickets />
        <GameTeaser />
        <Aftermovie />
        <Timeline />
        <Story />
        <Partners />
        <PracticalInfo />
      </main>
      <Footer />
    </>
  );
}
