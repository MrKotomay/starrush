"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Vibrate, VibrateOff } from "lucide-react";
import type { RefObject } from "react";

import styles from "@/styles/starrush.module.css";

import { HISTORY_POPOVER_EASE } from "../helpers";

export interface SettingsPopoverProps {
  isOpen: boolean;
  popoverRef: RefObject<HTMLDivElement | null>;
  hapticsEnabled: boolean;
  hapticsLabel: string;
  onToggleHaptics: () => void;
  locale: "ru" | "en";
  languageLabel: string;
  onToggleLocale: () => void;
}

/**
 * Floating settings popover anchored to the gear button in HistoryRail.
 * Holds two toggles (haptics, language) — keep this file as the only place
 * to redesign the popover.
 */
export function SettingsPopover({
  isOpen,
  popoverRef,
  hapticsEnabled,
  hapticsLabel,
  onToggleHaptics,
  locale,
  languageLabel,
  onToggleLocale,
}: SettingsPopoverProps) {
  return (
    <AnimatePresence initial={false}>
      {isOpen ? (
        <motion.div
          ref={popoverRef}
          className={styles.settingsPopover}
          initial={{ opacity: 0, y: 6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 6, scale: 0.98 }}
          transition={{ duration: 0.18, ease: HISTORY_POPOVER_EASE }}
        >
          <div className={styles.settingsIconStack}>
            <button
              type="button"
              className={styles.settingsIconBtn}
              aria-pressed={hapticsEnabled}
              aria-label={hapticsLabel}
              onClick={onToggleHaptics}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={hapticsEnabled ? "vibrate-on" : "vibrate-off"}
                  className={styles.settingsIconGlyph}
                  initial={{ opacity: 0, scale: 0.82, y: 4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.82, y: -4 }}
                  transition={{ duration: 0.16, ease: HISTORY_POPOVER_EASE }}
                >
                  {hapticsEnabled ? <Vibrate size={15} strokeWidth={2.1} /> : <VibrateOff size={15} strokeWidth={2.1} />}
                </motion.span>
              </AnimatePresence>
            </button>

            <button
              type="button"
              className={styles.settingsIconBtn}
              aria-label={languageLabel}
              onClick={onToggleLocale}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={locale === "ru" ? "lang-ru" : "lang-en"}
                  className={styles.settingsIconGlyph}
                  initial={{ opacity: 0, scale: 0.82, y: 4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.82, y: -4 }}
                  transition={{ duration: 0.16, ease: HISTORY_POPOVER_EASE }}
                >
                  <span aria-hidden="true" className={styles.flagBadge}>
                    <img
                      src={locale === "ru" ? "/ru-flag.svg" : "/usa-flag.svg"}
                      alt=""
                      className={styles.flagImage}
                    />
                  </span>
                </motion.span>
              </AnimatePresence>
            </button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
