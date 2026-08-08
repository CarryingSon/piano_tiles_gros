import type { Metadata } from "next";
import RhythmGame from "@/components/game/RhythmGame";

export const metadata: Metadata = {
  title: "Ujemi ritem | Glasbeni Atlas 2026",
  description:
    "Ujemi ritem v kratki koncertni igri in najdi svojo pot do Glasbenega Atlasa 2026.",
  alternates: { canonical: "/igra" },
};

export default function GamePage() {
  return <RhythmGame />;
}
