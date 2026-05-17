"use client";

import styles from "@/styles/starrush.module.css";

import type { MainCtaState } from "../helpers";

export interface MainCtaProps {
  ctaState: MainCtaState;
  ctaStateClass: string;
  ctaSheenMode: "always" | "off";
  reconnectAttempt: number;
  isMainActionDisabled: boolean;
  isActionBusy: boolean;
  mainBetLabel: string;
  connectionLostLabel: string;
  connectionStatusText: string;
  onClick: () => void;
}

/**
 * Primary game CTA: switches between "Bet", "Cashout x.yz", "Submitting…",
 * and "No connection" via the `ctaState` prop. Visual treatments live in
 * starrush.module.css (`.actionButton` + `.btnState…` modifiers).
 */
export function MainCta({
  ctaState,
  ctaStateClass,
  ctaSheenMode,
  reconnectAttempt,
  isMainActionDisabled,
  isActionBusy,
  mainBetLabel,
  connectionLostLabel,
  connectionStatusText,
  onClick,
}: MainCtaProps) {
  return (
    <section className={styles.betSection}>
      <div className={styles.betDock}>
        <button
          key={ctaState === "connection-lost" ? `offline-${reconnectAttempt}` : ctaState}
          type="button"
          className={`${styles.actionButton} ${ctaStateClass} liquid-sheen`}
          disabled={isMainActionDisabled}
          data-sheen={ctaSheenMode}
          data-cta-state={ctaState}
          aria-busy={isActionBusy}
          onClick={onClick}
        >
          {ctaState === "connection-lost" ? connectionLostLabel : mainBetLabel}
        </button>
        {ctaState === "connection-lost" ? (
          <p className={styles.queueHint}>{connectionStatusText}</p>
        ) : null}
      </div>
    </section>
  );
}
