"use client";

import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy } from "lucide-react";
import type { RefObject } from "react";

import styles from "@/styles/starrush.module.css";

import {
  HISTORY_POPOVER_EASE,
  formatRoundDate,
  formatRoundTime,
  type HistoryDetailsState,
  type HistoryPopoverPosition,
} from "../helpers";

type DateFormatter = (value: number | string | Date, options?: Intl.DateTimeFormatOptions) => string;

export interface HistoryDetailsPopoverProps {
  details: HistoryDetailsState | null;
  position: HistoryPopoverPosition | null;
  expanded: boolean;
  copiedField: "hash" | "seed" | null;
  popoverRef: RefObject<HTMLDivElement | null>;
  hashLabel: string;
  seedLabel: string;
  coefficientLabel: string;
  dateLabel: string;
  timeLabel: string;
  onCopy: (field: "hash" | "seed", value: string | null) => void;
  formatDate: DateFormatter;
  formatTime: DateFormatter;
}

/**
 * Portal-mounted floating popover showing provable-fairness data for the
 * round selected in HistoryRail. The popover lives at document.body so it
 * is not clipped by the game card; positioning is computed in the parent
 * (panel) via `updateHistoryPopoverPosition`.
 */
export function HistoryDetailsPopover({
  details,
  position,
  expanded,
  copiedField,
  popoverRef,
  hashLabel,
  seedLabel,
  coefficientLabel,
  dateLabel,
  timeLabel,
  onCopy,
  formatDate,
  formatTime,
}: HistoryDetailsPopoverProps) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence initial={false}>
      {details && position ? (
        <motion.div
          ref={popoverRef}
          className={`${styles.historyInfoPopover} ${styles.historyInfoPopoverFloating}`}
          style={{
            left: `${position.left}px`,
            top: `${position.top}px`,
          }}
          initial={{ opacity: 0, y: -6, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -5, scale: 0.985 }}
          transition={{ duration: 0.18, ease: HISTORY_POPOVER_EASE }}
        >
          <div className={styles.historyInfoSection}>
            <span className={styles.historyInfoLabel}>{hashLabel}</span>
            <button
              type="button"
              className={styles.historyInfoCopyBtn}
              disabled={!details.serverSeedHash}
              onClick={() => onCopy("hash", details.serverSeedHash)}
            >
              <span className={styles.historyInfoValue}>
                {details.serverSeedHash ?? "—"}
              </span>
              {copiedField === "hash" ? (
                <Check size={14} className={styles.historyInfoCopyIcon} />
              ) : (
                <Copy size={14} className={styles.historyInfoCopyIcon} />
              )}
            </button>
          </div>

          {expanded ? (
            <>
              <div className={styles.historyInfoSection}>
                <span className={styles.historyInfoLabel}>{seedLabel}</span>
                <button
                  type="button"
                  className={styles.historyInfoCopyBtn}
                  disabled={!details.serverSeed}
                  onClick={() => onCopy("seed", details.serverSeed)}
                >
                  <span className={styles.historyInfoValue}>
                    {details.serverSeed ?? "—"}
                  </span>
                  {copiedField === "seed" ? (
                    <Check size={14} className={styles.historyInfoCopyIcon} />
                  ) : (
                    <Copy size={14} className={styles.historyInfoCopyIcon} />
                  )}
                </button>
              </div>

              <div className={styles.historyInfoGrid}>
                <span className={styles.historyInfoGridLabel}>{coefficientLabel}</span>
                <span className={styles.historyInfoGridValue}>{`${details.crashAt.toFixed(2)}x`}</span>
                <span className={styles.historyInfoGridLabel}>{dateLabel}</span>
                <span className={styles.historyInfoGridValue}>{formatRoundDate(details.timestamp, formatDate)}</span>
                <span className={styles.historyInfoGridLabel}>{timeLabel}</span>
                <span className={styles.historyInfoGridValue}>{formatRoundTime(details.timestamp, formatTime)}</span>
              </div>
            </>
          ) : null}
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
