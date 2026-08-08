import Image from "next/image";

/**
 * Uradni besedni znak Glasbenega Atlasa (vektorska datoteka organizatorja).
 * Velikost upravlja `className` (h-* + w-auto) — razmerje stranic ohranja
 * next/image glede na intrinsic width/height.
 */
export default function Wordmark({
  className = "h-9 w-auto",
}: {
  className?: string;
}) {
  return (
    <Image
      src="/media/logo-glasbeni-atlas.svg"
      alt="Glasbeni Atlas"
      width={718}
      height={577}
      priority
      className={className}
    />
  );
}
