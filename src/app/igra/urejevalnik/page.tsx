import type { Metadata } from "next";
import { notFound } from "next/navigation";
import BeatmapRecorder from "@/components/game/BeatmapRecorder";

export const metadata: Metadata = {
  title: "Beatmap recorder | Glasbeni Atlas",
  description: "Začasno lokalno orodje za snemanje ritmičnih chartov.",
  robots: { index: false, follow: false },
};

export default function BeatmapRecorderPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <BeatmapRecorder />;
}
