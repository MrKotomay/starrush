"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Wallet, X } from "lucide-react";
import styles from "@/styles/place-bet-modal.module.css";
import { RoundPhase } from "@/game/types";

export type PlaceBetTab = "GIFTS" | "TON" | "STARS";

export interface PlaceBetSubmitPayload {
  tab: PlaceBetTab;
  amount: number;
}

interface PlaceBetModalProps {
  open: boolean;
  defaultTonAmount: number;
  currentPhase: RoundPhase;
  tonAvailable: number;
  starsAvailable: number;
  anchorRect: { left: number; width: number } | null;
  isSubmitting?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: PlaceBetSubmitPayload) => void | Promise<void>;
}

const TON_QUICK = [0.1, 0.5, 1, 5];
const STARS_QUICK = [1, 5, 10, 25];
const TAB_ORDER: PlaceBetTab[] = ["GIFTS", "TON", "STARS"];
const SHEET_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const TOP_SAFE_MARGIN = 16;
const BOTTOM_SAFE_MARGIN = 12;
const INITIAL_TAB_HEIGHTS: Record<PlaceBetTab, number> = {
  GIFTS: 0,
  TON: 0,
  STARS: 0,
};

function parseTon(value: string): number {
  if (!value.trim()) return 0;
  const parsed = Number.parseFloat(value.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return parsed;
}

function formatTon(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "";
  return value.toFixed(2).replace(/\.?0+$/, "");
}

function sanitizeTonInput(raw: string): string {
  const normalized = raw.replace(",", ".").replace(/[^\d.]/g, "");
  if (!normalized) return "";

  const dotIndex = normalized.indexOf(".");
  if (dotIndex === -1) return normalized;

  const intPart = normalized.slice(0, dotIndex);
  const decimalsRaw = normalized.slice(dotIndex + 1).replace(/\./g, "");
  const decimals = decimalsRaw.slice(0, 2);
  return `${intPart}.${decimals}`;
}

function isTonZeroRaw(value: string): boolean {
  if (!value) return false;
  if (value.endsWith(".")) return false;
  return /^0+(?:\.0{1,2})?$/.test(value);
}

function parseStars(value: string): number {
  if (!value.trim()) return 0;
  const parsed = Number.parseInt(value.replace(/[^\d]/g, ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return parsed;
}

function sanitizeStarsInput(raw: string): string {
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return "";
  const parsed = Number.parseInt(digits, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return "";
  return String(parsed);
}

export function PlaceBetModal({
  open,
  defaultTonAmount: _defaultTonAmount,
  currentPhase,
  tonAvailable,
  starsAvailable,
  anchorRect,
  isSubmitting = false,
  onOpenChange,
  onSubmit,
}: PlaceBetModalProps) {
  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState<PlaceBetTab>("TON");
  const [tonAmountRaw, setTonAmountRaw] = useState("");
  const [starsAmountRaw, setStarsAmountRaw] = useState("");
  const [tabHeights, setTabHeights] =
    useState<Record<PlaceBetTab, number>>(INITIAL_TAB_HEIGHTS);
  const [maxSheetHeightPx, setMaxSheetHeightPx] = useState<number | null>(null);
  const [clampedContentHeightPx, setClampedContentHeightPx] = useState<number | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const topSectionRef = useRef<HTMLDivElement | null>(null);
  const footerRef = useRef<HTMLDivElement | null>(null);
  const measureGiftsRef = useRef<HTMLDivElement | null>(null);
  const measureTonRef = useRef<HTMLDivElement | null>(null);
  const measureStarsRef = useRef<HTMLDivElement | null>(null);
  const activeTabIndex = TAB_ORDER.indexOf(tab);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setTab("TON");
    setTonAmountRaw("");
    setStarsAmountRaw("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onEsc);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onEsc);
    };
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!mounted) return;
    if (open) document.body.dataset.placeBetModalOpen = "true";
  }, [mounted, open]);

  useEffect(() => {
    return () => {
      delete document.body.dataset.placeBetModalOpen;
    };
  }, []);

  const tonAmountValue = useMemo(() => parseTon(tonAmountRaw), [tonAmountRaw]);

  const starsAmountValue = useMemo(() => parseStars(starsAmountRaw), [starsAmountRaw]);

  const canSubmit =
    tab === "GIFTS" ||
    (tab === "TON" && tonAmountRaw.trim() !== "" && tonAmountValue > 0) ||
    (tab === "STARS" && starsAmountRaw.trim() !== "" && starsAmountValue > 0);
  const nextRoundHint =
    currentPhase === RoundPhase.RUNNING
      ? "Текущий раунд уже идёт, ставка применится к следующему."
      : currentPhase === RoundPhase.CRASHED || currentPhase === RoundPhase.RESETTING
        ? "Раунд переключается, ставка будет применена к следующему."
        : null;
  const availableBalance =
    tab === "TON" ? Math.max(0, tonAvailable) : tab === "STARS" ? Math.max(0, starsAvailable) : 0;
  const selectedAmount =
    tab === "TON" ? tonAmountValue : tab === "STARS" ? starsAmountValue : 0;
  const insufficientBalance =
    tab !== "GIFTS" &&
    canSubmit &&
    selectedAmount > 0 &&
    Number.isFinite(selectedAmount) &&
    selectedAmount > availableBalance;
  const submitDisabled = !canSubmit || isSubmitting || insufficientBalance;
  const tonInputIsDefault = tonAmountRaw.trim() === "" || tonAmountValue <= 0;
  const starsInputIsDefault = starsAmountRaw.trim() === "" || starsAmountValue <= 0;
  const submitLabel = isSubmitting
    ? "Отправка..."
    : insufficientBalance
      ? "Недостаточно средств, пополните баланс"
      : "Сделать ставку";

  const anchorStyle = useMemo<CSSProperties | null>(() => {
    if (!anchorRect || anchorRect.width <= 0) return null;
    return {
      left: `${Math.round(anchorRect.left)}px`,
      width: `${Math.round(anchorRect.width)}px`,
      maxWidth: `${Math.round(anchorRect.width)}px`,
    };
  }, [anchorRect]);

  const sheetStyle = useMemo<CSSProperties | null>(() => {
    if (!anchorStyle) return null;
    if (!maxSheetHeightPx || maxSheetHeightPx <= 0) return anchorStyle;
    return {
      ...anchorStyle,
      maxHeight: `${maxSheetHeightPx}px`,
    };
  }, [anchorStyle, maxSheetHeightPx]);

  const readSafeInsetPx = useCallback((side: "top" | "bottom") => {
    if (typeof document === "undefined") return 0;
    const probe = document.createElement("div");
    probe.style.position = "fixed";
    probe.style.visibility = "hidden";
    probe.style.pointerEvents = "none";
    if (side === "top") probe.style.paddingTop = "var(--safe-top)";
    if (side === "bottom") probe.style.paddingBottom = "var(--content-safe-bottom)";
    document.body.appendChild(probe);
    const computed = getComputedStyle(probe);
    const raw = side === "top" ? computed.paddingTop : computed.paddingBottom;
    probe.remove();
    const value = Number.parseFloat(raw);
    return Number.isFinite(value) ? value : 0;
  }, []);

  const updateMeasuredHeights = useCallback(() => {
    const nextHeights: Record<PlaceBetTab, number> = {
      GIFTS: Math.ceil(measureGiftsRef.current?.getBoundingClientRect().height ?? 0),
      TON: Math.ceil(measureTonRef.current?.getBoundingClientRect().height ?? 0),
      STARS: Math.ceil(measureStarsRef.current?.getBoundingClientRect().height ?? 0),
    };

    setTabHeights((prev) => {
      if (
        prev.GIFTS === nextHeights.GIFTS &&
        prev.TON === nextHeights.TON &&
        prev.STARS === nextHeights.STARS
      ) {
        return prev;
      }
      return nextHeights;
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updateMeasuredHeights();
  }, [open, anchorStyle?.width, updateMeasuredHeights]);

  useEffect(() => {
    if (!open) return;

    const pairs: Array<[PlaceBetTab, HTMLDivElement | null]> = [
      ["GIFTS", measureGiftsRef.current],
      ["TON", measureTonRef.current],
      ["STARS", measureStarsRef.current],
    ];
    const observers: ResizeObserver[] = [];

    pairs.forEach(([tabKey, node]) => {
      if (!node) return;
      const observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        const nextHeight = Math.ceil(entry.contentRect.height);
        setTabHeights((prev) => {
          if (prev[tabKey] === nextHeight) return prev;
          return { ...prev, [tabKey]: nextHeight };
        });
      });
      observer.observe(node);
      observers.push(observer);
    });

    updateMeasuredHeights();

    return () => {
      observers.forEach((observer) => observer.disconnect());
    };
  }, [open, anchorStyle?.width, updateMeasuredHeights]);

  const maxMeasuredTabHeight = useMemo(() => {
    return Math.max(tabHeights.GIFTS, tabHeights.TON, tabHeights.STARS);
  }, [tabHeights.GIFTS, tabHeights.TON, tabHeights.STARS]);

  const recalcLayout = useCallback(() => {
    if (!open) return;
    const viewportHeight = Math.floor(window.visualViewport?.height ?? window.innerHeight);
    const safeTop = readSafeInsetPx("top");
    const safeBottom = readSafeInsetPx("bottom");

    const nextMaxSheetHeight = Math.max(
      260,
      Math.floor(
        viewportHeight - TOP_SAFE_MARGIN - safeTop - BOTTOM_SAFE_MARGIN - safeBottom,
      ),
    );
    setMaxSheetHeightPx((prev) => (prev === nextMaxSheetHeight ? prev : nextMaxSheetHeight));

    const sheetEl = sheetRef.current;
    const topSectionEl = topSectionRef.current;
    const footerEl = footerRef.current;
    if (!sheetEl || !topSectionEl || !footerEl) return;

    const sheetStyles = getComputedStyle(sheetEl);
    const padTop = Number.parseFloat(sheetStyles.paddingTop) || 0;
    const padBottom = Number.parseFloat(sheetStyles.paddingBottom) || 0;
    const topHeight = topSectionEl.offsetHeight;
    const footerHeight = footerEl.offsetHeight;

    const availableContentHeight = Math.max(
      0,
      Math.floor(nextMaxSheetHeight - padTop - padBottom - topHeight - footerHeight),
    );
    const reserved = Math.max(
      0,
      Math.min(maxMeasuredTabHeight + 2, availableContentHeight),
    );

    setClampedContentHeightPx((prev) => (prev === reserved ? prev : reserved));
  }, [maxMeasuredTabHeight, open, readSafeInsetPx]);

  useLayoutEffect(() => {
    recalcLayout();
  }, [recalcLayout, anchorStyle?.width]);

  useEffect(() => {
    if (!open) return;

    const onWindowResize = () => recalcLayout();
    window.addEventListener("resize", onWindowResize, { passive: true });
    window.visualViewport?.addEventListener("resize", onWindowResize);
    window.visualViewport?.addEventListener("scroll", onWindowResize);

    const observers: ResizeObserver[] = [];
    const refs = [sheetRef.current, topSectionRef.current, footerRef.current];
    refs.forEach((el) => {
      if (!el) return;
      const observer = new ResizeObserver(() => recalcLayout());
      observer.observe(el);
      observers.push(observer);
    });

    return () => {
      window.removeEventListener("resize", onWindowResize);
      window.visualViewport?.removeEventListener("resize", onWindowResize);
      window.visualViewport?.removeEventListener("scroll", onWindowResize);
      observers.forEach((observer) => observer.disconnect());
    };
  }, [open, recalcLayout]);

  const contentViewportStyle = useMemo<CSSProperties | undefined>(() => {
    const fallback = tabHeights[tab] > 0 ? tabHeights[tab] : 160;
    const height = clampedContentHeightPx && clampedContentHeightPx > 0
      ? clampedContentHeightPx
      : fallback;
    return { height: `${height}px` };
  }, [clampedContentHeightPx, tab, tabHeights]);

  const renderTabContent = (targetTab: PlaceBetTab, mode: "live" | "measure") => {
    const isMeasure = mode === "measure";
    if (targetTab === "GIFTS") {
      return (
        <div className={`${styles.contentInner} ${styles.contentInnerCentered}`}>
          <div className={styles.emptyWrap}>
            <X size={44} strokeWidth={2.5} className={styles.emptyIcon} />
            <p className={`${styles.emptyText} ${styles.mutedText}`}>Инвентарь пуст</p>
          </div>
        </div>
      );
    }

    const isTonTab = targetTab === "TON";
    const quickValues = isTonTab ? TON_QUICK : STARS_QUICK;
    const balanceLabel = isTonTab
      ? `${Math.max(0, tonAvailable).toFixed(2)} TON`
      : `${Math.floor(Math.max(0, starsAvailable))} Stars`;
    const normalizedValue = isTonTab
      ? (tonInputIsDefault ? "0.00" : formatTon(tonAmountValue))
      : (starsInputIsDefault ? "0" : String(starsAmountValue));

    return (
      <div className={styles.contentInner}>
        <div className={styles.amountCard}>
          <div className={styles.amountHeader}>
            <span className={`${styles.amountLabel} ${styles.mutedText}`}>Сумма ставки</span>
            <span className={`${styles.balanceLabel} ${styles.mutedText}`}>
              Баланс: {balanceLabel}
            </span>
          </div>

          <div className={styles.inputRow}>
            {isMeasure ? (
              <div
                className={`${styles.amountInputMock} ${
                  (isTonTab ? tonInputIsDefault : starsInputIsDefault)
                    ? styles.amountInputMuted
                    : ""
                }`}
              >
                {normalizedValue || (isTonTab ? "0.00" : "0")}
              </div>
            ) : (
              <input
                className={`${styles.amountInput} ${
                  (isTonTab ? tonInputIsDefault : starsInputIsDefault)
                    ? styles.amountInputMuted
                    : ""
                }`}
                type="text"
                disabled={isSubmitting}
                inputMode={isTonTab ? "decimal" : "numeric"}
                value={isTonTab ? tonAmountRaw : starsAmountRaw}
                onChange={(event) => {
                  if (isTonTab) {
                    const nextRaw = sanitizeTonInput(event.target.value);
                    setTonAmountRaw(isTonZeroRaw(nextRaw) ? "" : nextRaw);
                  }
                  else setStarsAmountRaw(sanitizeStarsInput(event.target.value));
                }}
                onBlur={() => {
                  if (isTonTab) {
                    const parsed = parseTon(tonAmountRaw);
                    setTonAmountRaw(parsed > 0 ? formatTon(parsed) : "");
                  } else {
                    setStarsAmountRaw((prev) => sanitizeStarsInput(prev));
                  }
                }}
                placeholder={isTonTab ? "0.00" : "0"}
              />
            )}
            <span className={`${styles.inputSuffix} ${styles.mutedText}`}>
              {isTonTab ? "TON" : "Stars"}
            </span>
          </div>
        </div>

        <div className={styles.quickRow}>
          {quickValues.map((value) => {
            const isActiveQuick = isTonTab
              ? tonAmountRaw.trim() !== "" && Math.abs(tonAmountValue - value) < 0.0001
              : starsAmountRaw.trim() !== "" && starsAmountValue === value;

            return (
              <button
                key={`${targetTab}-${value}`}
                type="button"
                className={`${styles.quickButton} ${isActiveQuick ? styles.quickButtonActive : ""}`}
                disabled={isMeasure || isSubmitting}
                tabIndex={isMeasure || isSubmitting ? -1 : undefined}
                aria-pressed={isActiveQuick}
                onClick={
                  isMeasure || isSubmitting
                    ? undefined
                    : () => {
                        if (isTonTab) setTonAmountRaw(value > 0 ? String(value) : "");
                        else setStarsAmountRaw(value > 0 ? String(value) : "");
                      }
                }
              >
                <span className={styles.quickButtonText}>{value}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  if (!mounted || !sheetStyle || !anchorStyle) return null;

  return createPortal(
    <AnimatePresence
      onExitComplete={() => {
        delete document.body.dataset.placeBetModalOpen;
      }}
    >
      {open ? (
        <motion.div
          className={styles.backdrop}
          onClick={() => onOpenChange(false)}
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: SHEET_EASE }}
        >
          <motion.div
            className={styles.sheet}
            style={sheetStyle}
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label="Сделать ставку"
            onClick={(event) => event.stopPropagation()}
            initial={{ y: 28, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            transition={{ duration: 0.24, ease: SHEET_EASE }}
          >
            <div ref={topSectionRef} className={styles.topSection}>
              <div className={styles.header}>
                <h3 className={styles.title}>Сделать ставку</h3>
                <button
                  type="button"
                  className={styles.closeButton}
                  aria-label="Закрыть"
                  onClick={() => onOpenChange(false)}
                >
                  <X size={19} strokeWidth={2} />
                </button>
              </div>

              <div className={styles.tabs}>
                <motion.span
                  className={styles.tabIndicator}
                  aria-hidden="true"
                  initial={false}
                  animate={{ x: `${activeTabIndex * 100}%` }}
                  transition={{ duration: 0.2, ease: SHEET_EASE }}
                />
                <button
                  type="button"
                  className={`${styles.tabButton} ${tab === "GIFTS" ? styles.tabButtonActive : ""}`}
                  disabled={isSubmitting}
                  onClick={() => setTab("GIFTS")}
                >
                  Подарки
                </button>
                <button
                  type="button"
                  className={`${styles.tabButton} ${tab === "TON" ? styles.tabButtonActive : ""}`}
                  disabled={isSubmitting}
                  onClick={() => setTab("TON")}
                >
                  TON
                </button>
                <button
                  type="button"
                  className={`${styles.tabButton} ${tab === "STARS" ? styles.tabButtonActive : ""}`}
                  disabled={isSubmitting}
                  onClick={() => setTab("STARS")}
                >
                  Stars
                </button>
              </div>
              {nextRoundHint ? (
                <p className={styles.modeHint}>{nextRoundHint}</p>
              ) : null}
            </div>

            <div className={styles.contentViewport} style={contentViewportStyle}>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={tab}
                  className={styles.contentPane}
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -10, opacity: 0 }}
                  transition={{ duration: 0.18, ease: SHEET_EASE }}
                >
                  {renderTabContent(tab, "live")}
                </motion.div>
              </AnimatePresence>
            </div>

            <div ref={footerRef} className={styles.footer}>
              <button
                type="button"
                className={`${styles.submitButton} ${isSubmitting ? styles.submitButtonLoading : ""}`}
                disabled={submitDisabled}
                aria-busy={isSubmitting}
                onClick={async () => {
                  if (submitDisabled) return;
                  const amount =
                    tab === "TON" ? tonAmountValue : tab === "STARS" ? starsAmountValue : 0;
                  await Promise.resolve(onSubmit({ tab, amount }));
                }}
              >
                <span className={styles.submitButtonContent}>
                  {insufficientBalance && !isSubmitting ? (
                    <Wallet size={18} strokeWidth={2.1} className={styles.submitWalletIcon} />
                  ) : null}
                  <span>{submitLabel}</span>
                </span>
              </button>
            </div>
          </motion.div>

          <div className={styles.measureHost} style={anchorStyle} aria-hidden="true">
            <div ref={measureGiftsRef} className={styles.measurePane}>
              {renderTabContent("GIFTS", "measure")}
            </div>
            <div ref={measureTonRef} className={styles.measurePane}>
              {renderTabContent("TON", "measure")}
            </div>
            <div ref={measureStarsRef} className={styles.measurePane}>
              {renderTabContent("STARS", "measure")}
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

