import Link from "next/link";
import styles from "./GameTeaser.module.css";

const tiles = [
  { lane: 0, delay: "-2.1s", color: "#ffd800" },
  { lane: 2, delay: "-1.55s", color: "#e99fd6" },
  { lane: 1, delay: "-.95s", color: "#ffd800" },
  { lane: 3, delay: "-.35s", color: "#e99fd6" },
];

export default function GameTeaser() {
  return (
    <section className={styles.section} aria-labelledby="igra-naslov">
      <div className={styles.inner}>
        <div>
          <p className={styles.kicker}>Nova postaja · 36 sekund</p>
          <h2 id="igra-naslov" className={styles.title}>Misliš, da imaš ritem?</h2>
          <p className={styles.copy}>Štiri steze. En beat. Pot do Ivančne Gorice se začne s prvim tapom.</p>
          <Link href="/igra" className={styles.cta}>Zaigraj <span aria-hidden>↗</span></Link>
        </div>
        <div className={styles.preview} aria-hidden="true">
          <span className={styles.previewLabel}>Ujemi ritem</span>
          <div className={styles.lanes}>{[0, 1, 2, 3].map((lane) => <span className={styles.lane} key={lane} />)}</div>
          {tiles.map((tile) => (
            <span
              className={styles.tile}
              key={tile.lane}
              style={{ "--lane": tile.lane, "--delay": tile.delay, "--tile-color": tile.color } as React.CSSProperties}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
