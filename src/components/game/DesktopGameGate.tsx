"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { gameConfig } from "@/data/game";
import styles from "./RhythmGame.module.css";

/** Kako se igra — pet korakov, ki jih igralec potrebuje pred prvim tapom. */
const RULES = [
  { title: "Izberi komad", text: "Kokosy, MRFY ali Tabu — vsak ima svojo karto in svojo barvo." },
  { title: "Tapni ploščico", text: "Ploščice padajo po štirih stezah; vsako tapni v njeni stezi." },
  { title: "Počakaj jo nižje", text: "Nižja ko je ploščica ob dotiku, več točk. Zaporedni zadetki množijo rezultat." },
  { title: "Dolgo drži", text: "Podolgovato ploščico drži do konca in izpusti na črti." },
  { title: "Eno življenje", text: "Prva zgrešena ploščica ali tap v prazno stezo konča krog." },
];

export default function DesktopGameGate() {
  const [desktop, setDesktop] = useState(false);
  const [qrCode, setQrCode] = useState("");

  useEffect(() => {
    const query = window.matchMedia("(min-width: 768px) and (pointer: fine)");
    const update = () => setDesktop(query.matches);
    const frame = window.requestAnimationFrame(update);
    query.addEventListener("change", update);
    return () => {
      window.cancelAnimationFrame(frame);
      query.removeEventListener("change", update);
    };
  }, []);

  useEffect(() => {
    if (!desktop) return;
    let active = true;
    void QRCode.toDataURL(gameConfig.siteUrl, {
      width: 420,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#050708", light: "#FFD800" },
    }).then((dataUrl) => {
      if (active) setQrCode(dataUrl);
    });
    return () => { active = false; };
  }, [desktop]);

  if (!desktop) return null;

  return (
    <aside className={styles.desktopGate} aria-labelledby="desktop-game-title">
      <Link
        href="/"
        className={styles.desktopBack}
        aria-label="Nazaj na Glasbeni Atlas"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
        >
          <path
            d="M19 12H5m0 0 6-6m-6 6 6 6"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span>Nazaj</span>
      </Link>
      {/* Dva stolpca, ker mora vse stati na en zaslon brez pomikanja: levo
          navodila, desno koda, s katero se igra odpre na telefonu. */}
      <div className={styles.desktopGateInner}>
        <div className={styles.desktopGateText}>
          <Image
            src="/media/logo-glasbeni-atlas.svg"
            width={718}
            height={577}
            alt="Glasbeni Atlas"
            className={styles.desktopLogo}
            priority
          />
          <p className={styles.eyebrow}>Mobilna ritmična igra</p>
          <h1 id="desktop-game-title">Glatlas Game</h1>
          <p className={styles.desktopLead}>
            Igra teče na telefonu — štiri steze in en cel komad. Tu je na
            kratko, kako gre.
          </p>
          <ol className={styles.gateRules}>
            {RULES.map((rule) => (
              <li key={rule.title}>
                <strong>{rule.title}</strong>
                <span>{rule.text}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className={styles.desktopGateAside}>
          <div className={styles.qrFrame}>
            {qrCode ? (
              <Image src={qrCode} alt="QR-koda za mobilno igro Ujemi ritem" width={260} height={260} unoptimized />
            ) : (
              <span>Nalagam QR …</span>
            )}
          </div>
          <p className={styles.desktopScan}>
            Skeniraj s telefonom in odpri igro v pokončnem načinu.
          </p>
          <strong className={styles.desktopPrize}>{gameConfig.competition.headline}</strong>
          <Link href="/" className={styles.desktopTextLink}>
            Nazaj na Glasbeni Atlas
          </Link>
        </div>
      </div>
    </aside>
  );
}
