import Aftermovie from "@/components/Aftermovie";
import CampaignSlider from "@/components/CampaignSlider";
import Experience from "@/components/Experience";
import FinalCta from "@/components/FinalCta";
import GameTeaser from "@/components/GameTeaser";
import Footer from "@/components/Footer";
import Hero from "@/components/Hero";
import Lineup from "@/components/Lineup";
import Nav from "@/components/Nav";
import PracticalInfo from "@/components/PracticalInfo";
import Reveal from "@/components/Reveal";
import Story from "@/components/Story";
import Timeline from "@/components/Timeline";

export default function Home() {
  return (
    <>
      <Reveal />
      <Nav />
      <main>
        <Hero />
        <Experience />
        <GameTeaser />
        <Aftermovie />
        <Timeline />
        <Lineup />
        <CampaignSlider />
        <Story />
        <PracticalInfo />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
