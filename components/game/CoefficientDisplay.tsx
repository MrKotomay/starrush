import styles from "@/styles/starrush.module.css";
import { RoundPhase } from "@/game/types";

interface CoefficientDisplayProps {
  phase: RoundPhase;
  coefficient: number;
  crashAt: number;
  countdown: number;
}

export function CoefficientDisplay({
  phase,
  coefficient: _coefficient,
  crashAt,
  countdown,
}: CoefficientDisplayProps) {
  if (phase === RoundPhase.PREPARING) {
    return (
      <div className={styles.coeffWrap}>
        <p className={`${styles.coeffValue} ${styles.coeffPreparing}`}>
          {countdown > 0 ? `${countdown}` : "..."}
        </p>
        <p className={styles.coeffSub}>Подготовка к раунду</p>
      </div>
    );
  }

  // RUNNING multiplier is rendered in the LIVE history chip.
  if (phase === RoundPhase.RUNNING) {
    return null;
  }

  if (phase === RoundPhase.CRASHED || phase === RoundPhase.RESETTING) {
    return (
      <div className={styles.coeffWrap}>
        <p className={`${styles.coeffValue} ${styles.coeffCrashed}`}>
          {crashAt.toFixed(2)}x
        </p>
        <p className={styles.coeffSub}>Краш!</p>
      </div>
    );
  }

  return null;
}
