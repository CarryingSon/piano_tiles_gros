import type { Metadata } from "next";
import RhythmGame from "@/components/game/RhythmGame";

export const metadata: Metadata = {
  title: "Glatlas Game | Glasbeni Atlas 2026",
  description:
    "Replikacija Piano Tiles s komadi Glasbenega Atlasa 2026. Zaigraj vse tri in se primerjaj na skupni lestvici.",
  alternates: { canonical: "/igra" },
};

export default function GamePage() {
  return <RhythmGame />;
}
