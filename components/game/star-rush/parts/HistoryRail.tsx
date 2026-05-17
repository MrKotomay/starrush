"use client";

import { useEffect, useState, type ReactNode, type RefObject, type WheelEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";

import styles from "@/styles/starrush.module.css";

import type { RoundHistoryItem } from "@/game/types";

import {
  HISTORY_POPOVER_EASE,
  historyPillClass,
  type HistoryDetailsState,
} from "../helpers";

export interface HistoryRailProps {
  // Data
  history: RoundHistoryItem[];
  buildCompletedHistoryDetails: (item: RoundHistoryItem) => HistoryDetailsState;
  openHistoryKey: string | null;
  onToggleHistoryDetails: (key: string) => void;
  // Status chip (current round)
  hasStatusChip: boolean;
  currentRoundHistoryDetails: HistoryDetailsState;
  statusChipLabel: string;
  statusChipClass: string;
  statusChipTextKey: string;
  // i18n
  currentRoundLabel: string;
  roundDetailsAriaLabel: (roundId: string) => string;
  // Re-trigger scroll reset on round change
  phase: string;
  roundId: string;
  // External refs (so click-outside detection in parent works)
  rowRef: RefObject<HTMLDivElement | null>;
  railRef: RefObject<HTMLDivElement | null>;
  // Trailing slot — settings gear + popover live here
  trailing?: ReactNode;
}

/**
 * Horizontal pill rail with the current-round status chip and the recent
 * crash history. Owns its own edge-fade and wheel-scroll behaviour. The
 * settings gear + its popover are slotted via `trailing` so visual order
 * in starrush.module.css stays untouched.
 */
export function HistoryRail({
  history,
  buildCompletedHistoryDetails,
  openHistoryKey,
  onToggleHistoryDetails,
  hasStatusChip,
  currentRoundHistoryDetails,
  statusChipLabel,
  statusChipClass,
  statusChipTextKey,
  currentRoundLabel,
  roundDetailsAriaLabel,
  phase,
  roundId,
  rowRef,
  railRef,
  trailing,
}: HistoryRailProps) {
  const [showEdgeFade, setShowEdgeFade] = useState(false);

  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    const rail = railRef.current;
    if (!rail) return;
    if (Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;
    if (rail.scrollWidth <= rail.clientWidth) return;
    event.preventDefault();
    rail.scrollLeft += event.deltaY;
  };

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;

    const update = () => {
      const maxScrollLeft = rail.scrollWidth - rail.clientWidth;
      if (maxScrollLeft <= 1) {
        setShowEdgeFade(false);
        return;
      }
      const hasHiddenRightPart = rail.scrollLeft < maxScrollLeft - 1;
      setShowEdgeFade(hasHiddenRightPart);
    };

    update();
    rail.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(rail);

    return () => {
      rail.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [hasStatusChip, history.length, railRef]);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    rail.scrollTo({ left: 0, behavior: "auto" });
  }, [phase, roundId, railRef]);

  return (
    <div ref={rowRef} className={styles.historyRow}>
      <div ref={railRef} className={styles.historyRail} onWheel={onWheel}>
        {hasStatusChip ? (
          <div className={styles.historyPillWrap}>
            <button
              type="button"
              className={styles.historyPillBtn}
              data-history-key={currentRoundHistoryDetails.key}
              onClick={() => onToggleHistoryDetails(currentRoundHistoryDetails.key)}
              aria-label={currentRoundLabel}
            >
              <span
                className={`${styles.historyPill} ${styles.historyPillFirst} ${styles.historyPillPinnedActive} ${statusChipClass} ${
                  openHistoryKey === currentRoundHistoryDetails.key ? styles.historyPillActive : ""
                }`}
              >
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={statusChipTextKey}
                    className={styles.historyPillAnimatedText}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    transition={{ duration: 0.16, ease: HISTORY_POPOVER_EASE }}
                  >
                    {statusChipLabel}
                  </motion.span>
                </AnimatePresence>
              </span>
            </button>
          </div>
        ) : null}

        <AnimatePresence initial={false}>
          {history.map((item) => {
            const details = buildCompletedHistoryDetails(item);
            const isOpen = openHistoryKey === details.key;
            return (
              <motion.div
                key={item.roundId}
                layout
                className={styles.historyPillWrap}
                initial={{ opacity: 0, x: 16, scale: 0.96 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -16, scale: 0.96 }}
                transition={{ duration: 0.2, ease: HISTORY_POPOVER_EASE }}
              >
                <button
                  type="button"
                  className={styles.historyPillBtn}
                  data-history-key={details.key}
                  onClick={() => onToggleHistoryDetails(details.key)}
                  aria-label={roundDetailsAriaLabel(item.roundId)}
                >
                  <span className={`${historyPillClass(item.crashAt, false)} ${isOpen ? styles.historyPillActive : ""}`}>
                    {`x${item.crashAt.toFixed(2)}`}
                  </span>
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      <div
        className={`${styles.historyEdgeFade} ${!showEdgeFade ? styles.historyEdgeFadeHidden : ""}`}
        aria-hidden="true"
      />

      {trailing}
    </div>
  );
}
