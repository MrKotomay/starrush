import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import styles from "@/styles/starrush.module.css";
import { RoundPhase } from "@/game/types";
import { useI18n } from "@/lib/i18n";

interface CoefficientDisplayProps {
  phase: RoundPhase;
  coefficient: number;
  crashAt: number;
  countdown: number;
}

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

export function CoefficientDisplay({
  phase,
  coefficient,
  crashAt,
  countdown,
}: CoefficientDisplayProps) {
  const { t } = useI18n();
  const [crashSettled, setCrashSettled] = useState(phase !== RoundPhase.CRASHED);

  useEffect(() => {
    if (phase !== RoundPhase.CRASHED) {
      setCrashSettled(phase === RoundPhase.RESETTING);
      return;
    }

    setCrashSettled(false);
    const timer = window.setTimeout(() => setCrashSettled(true), 260);
    return () => window.clearTimeout(timer);
  }, [phase]);

  const layoutClass = useMemo(() => {
    if (phase === RoundPhase.RUNNING) return styles.coeffWrapFloating;
    if (phase === RoundPhase.CRASHED || phase === RoundPhase.RESETTING) return styles.coeffWrapCrash;
    return styles.coeffWrapCenter;
  }, [phase]);

  const valueClass = useMemo(() => {
    if (phase === RoundPhase.RUNNING) return styles.coeffRunningLive;
    if (phase === RoundPhase.CRASHED || phase === RoundPhase.RESETTING) {
      return crashSettled ? styles.coeffCrashed : styles.coeffCrashTravel;
    }
    return styles.coeffPreparing;
  }, [crashSettled, phase]);

  const valueText =
    phase === RoundPhase.PREPARING
      ? countdown > 0
        ? `${countdown}`
        : "..."
      : `${(phase === RoundPhase.RUNNING ? coefficient : crashAt).toFixed(2)}x`;

  const subText =
    phase === RoundPhase.PREPARING
      ? t("rush.preparing")
      : phase === RoundPhase.RUNNING
        ? t("rush.waiting")
        : t("rush.crashed");

  return (
    <div className={`${styles.coeffWrap} ${layoutClass}`}>
      <motion.div
        animate={
          phase === RoundPhase.RUNNING
            ? { y: 0, opacity: 1, scale: 1 }
            : phase === RoundPhase.CRASHED
              ? { y: -6, opacity: 1, scale: 1 }
              : { y: 0, opacity: 1, scale: 1 }
        }
        transition={{ duration: 0.28, ease: EASE }}
      >
      <AnimatePresence mode="wait" initial={false}>
        <motion.p
          key={`${phase}-${valueText}`}
          className={`${styles.coeffValue} ${valueClass}`}
          initial={
            phase === RoundPhase.RUNNING
              ? { opacity: 0, y: 10 }
              : phase === RoundPhase.CRASHED
                ? { opacity: 0, y: 20 }
                : { opacity: 0, y: 6 }
          }
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.22, ease: EASE }}
        >
          {valueText}
        </motion.p>
      </AnimatePresence>

      <AnimatePresence mode="wait" initial={false}>
        <motion.p
          key={`${phase}-sub-${subText}`}
          className={styles.coeffSub}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18, ease: EASE }}
        >
          {subText}
        </motion.p>
      </AnimatePresence>
      </motion.div>
    </div>
  );
}
