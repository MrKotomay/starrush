"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy, Settings2, Vibrate, VibrateOff } from "lucide-react";

import styles from "@/styles/starrush.module.css";

import {
  PlaceBetModal,
  type PlaceBetSubmitPayload,
} from "@/components/bets/PlaceBetModal";
import { CoefficientDisplay } from "@/components/game/CoefficientDisplay";
import { PlayersBetsList } from "@/components/game/PlayersBetsList";
import { RocketOverlay } from "@/components/game/RocketOverlay";
import { Currency, RoundHistoryItem, RoundPhase } from "@/game/types";
import { useAppSettings } from "@/lib/app-settings";
import { formatCurrencyAmount, isIntegerCurrency } from "@/lib/currency";
import { useHaptics } from "@/lib/haptics";
import { useI18n } from "@/lib/i18n";

import {
  HISTORY_POPOVER_EASE,
  HISTORY_POPOVER_MAX_WIDTH_PX,
  HISTORY_POPOVER_SIDE_GAP_PX,
  MAX_BET_BY_CURRENCY,
  MIN_BET_BY_CURRENCY,
  ROUND_SWITCH_RETRY_STEP_MS,
  ROUND_SWITCH_RETRY_WINDOW_MS,
  TOAST_EASE,
  TOAST_VISIBLE_MS,
  formatConnectionHint,
  formatRoundDate,
  formatRoundTime,
  historyPillClass,
  isRoundSwitchErrorMessage,
  localizeAdapterMessage,
  toFiniteNumber,
  type HistoryDetailsState,
  type HistoryPopoverPosition,
  type MainCtaState,
  type ToastState,
  type WalletsApiResponse,
} from "@/components/game/star-rush/helpers";
import { useRoundAdapter } from "@/components/game/star-rush/hooks/use-round-adapter";
import { useWalletBalances } from "@/components/game/star-rush/hooks/use-wallet-balances";

interface StarRushPanelProps {
  initialTonBalance?: number;
  initialStarsBalance?: number;
  isActive?: boolean;
  onOnlineCountChange?: (count: number) => void;
  onWalletNeedsRefresh?: () => void;
}

/* ================================================================
   StarRushPanel - main crash-game page component
   ================================================================ */
export function StarRushPanel({
  initialTonBalance = 0,
  initialStarsBalance = 0,
  isActive = true,
  onOnlineCountChange,
  onWalletNeedsRefresh,
}: StarRushPanelProps) {
  const { locale, setLocale, hapticsEnabled, setHapticsEnabled } = useAppSettings();
  const { t, formatDate, formatTime } = useI18n();
  const haptics = useHaptics();
  const panelRootRef = useRef<HTMLDivElement | null>(null);
  const historyRowRef = useRef<HTMLDivElement | null>(null);
  const historyRailRef = useRef<HTMLDivElement | null>(null);
  const historyPopoverRef = useRef<HTMLDivElement | null>(null);
  const settingsPopoverRef = useRef<HTMLDivElement | null>(null);

  const [betAmount, setBetAmount] = useState<number>(1);
  const [isBetSubmitting, setBetSubmitting] = useState(false);
  const [isCashoutSubmitting, setCashoutSubmitting] = useState(false);
  const [panelAnchorRect, setPanelAnchorRect] = useState<{ left: number; width: number } | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [isPlaceModalOpen, setPlaceModalOpen] = useState(false);
  const [isSettingsOpen, setSettingsOpen] = useState(false);
  const [showHistoryEdgeFade, setShowHistoryEdgeFade] = useState(false);
  const [openHistoryKey, setOpenHistoryKey] = useState<string | null>(null);
  const [historyPopoverPos, setHistoryPopoverPos] = useState<HistoryPopoverPosition | null>(null);
  const [copiedHistoryField, setCopiedHistoryField] = useState<"hash" | "seed" | null>(null);

  const renderCountRef = useRef(0);
  const toastIdRef = useRef(0);
  const historyCopyResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onWalletNeedsRefreshRef = useRef(onWalletNeedsRefresh);
  const lastPhaseRef = useRef<RoundPhase>(RoundPhase.PREPARING);
  const lastCrashHapticRoundRef = useRef<string | null>(null);
  renderCountRef.current += 1;

  useEffect(() => {
    onWalletNeedsRefreshRef.current = onWalletNeedsRefresh;
  }, [onWalletNeedsRefresh]);

  const showToast = useCallback((message: string) => {
    const trimmed = message.trim();
    if (!trimmed) return;
    toastIdRef.current += 1;
    setToast({ id: toastIdRef.current, message: trimmed });
  }, []);

  const {
    tonAvailableBalance,
    starsAvailableBalance,
    refreshWalletBalances,
  } = useWalletBalances({ initialTonBalance, initialStarsBalance });

  const {
    snapshot,
    coefficient,
    connectionState,
    mountRef,
    rendererRef,
    adapterRef: roundAdapterRef,
    getLiveCoefficient,
  } = useRoundAdapter({
    isActive,
    isPlaceModalOpen,
    onError: showToast,
    onPostBootstrap: refreshWalletBalances,
    onWalletNeedsRefresh,
    onOnlineCountChange,
  });

  useEffect(() => {
    const panel = panelRootRef.current;
    if (!panel) return;

    const updateRect = () => {
      const rect = panel.getBoundingClientRect();
      const left = Math.round(rect.left);
      const width = Math.round(rect.width);
      if (width <= 0) return;
      setPanelAnchorRect((prev) => {
        if (prev && prev.left === left && prev.width === width) return prev;
        return { left, width };
      });
    };

    updateRect();

    const observer = new ResizeObserver(updateRect);
    observer.observe(panel);
    window.addEventListener("resize", updateRect, { passive: true });
    window.addEventListener("scroll", updateRect, { passive: true });
    window.addEventListener("orientationchange", updateRect, { passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect);
      window.removeEventListener("orientationchange", updateRect);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), TOAST_VISIBLE_MS);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!isActive) {
      setSettingsOpen(false);
    }
  }, [isActive]);

  useEffect(() => {
    if (isPlaceModalOpen) {
      setSettingsOpen(false);
    }
  }, [isPlaceModalOpen]);

  useEffect(() => {
    const previousPhase = lastPhaseRef.current;
    const phaseChanged = previousPhase !== snapshot.phase;
    const crashedNow =
      phaseChanged &&
      previousPhase === RoundPhase.RUNNING &&
      (snapshot.phase === RoundPhase.CRASHED || snapshot.phase === RoundPhase.RESETTING);

    if (crashedNow && lastCrashHapticRoundRef.current !== snapshot.roundId) {
      haptics.roundCrash();
      lastCrashHapticRoundRef.current = snapshot.roundId;
    }

    lastPhaseRef.current = snapshot.phase;
  }, [haptics, snapshot.phase, snapshot.roundId]);

  useEffect(() => {
    return () => {
      if (historyCopyResetTimerRef.current) {
        clearTimeout(historyCopyResetTimerRef.current);
        historyCopyResetTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (connectionState.status === "connected") return;
    if (isPlaceModalOpen) {
      setPlaceModalOpen(false);
    }
    setSettingsOpen(false);
  }, [connectionState.status, isPlaceModalOpen]);

  useEffect(() => {
    if (process.env.NODE_ENV === "production" || typeof window === "undefined") {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    if (!params.has("debugReact")) return;

    const timer = window.setInterval(() => {
      console.debug(`[StarRushPanel] renders/s=${renderCountRef.current}`);
      renderCountRef.current = 0;
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const placeBetAmount = useCallback(
    async (rawBetAmount: number, currency: Currency): Promise<boolean> => {
      const adapter = roundAdapterRef.current;
      if (!adapter) return false;
      if (isBetSubmitting || isCashoutSubmitting) return false;

      const amount = isIntegerCurrency(currency)
        ? Math.round(Math.max(0, rawBetAmount))
        : Math.round(Math.max(0, rawBetAmount) * 100) / 100;
      const minBet = MIN_BET_BY_CURRENCY[currency];
      const maxBet = MAX_BET_BY_CURRENCY[currency];
      if (!Number.isFinite(amount) || amount < minBet || amount > maxBet) {
        showToast(t("rush.betLimit", { min: minBet, max: maxBet }));
        return false;
      }

      setBetSubmitting(true);
      try {
        let result = await adapter.placeBet(amount, currency);
        if (!result.ok && isRoundSwitchErrorMessage(result.message)) {
          const retryDeadline = Date.now() + ROUND_SWITCH_RETRY_WINDOW_MS;

          while (Date.now() < retryDeadline) {
            await new Promise<void>((resolve) => {
              window.setTimeout(resolve, ROUND_SWITCH_RETRY_STEP_MS);
            });

            const liveSnapshot = adapter.getSnapshot();
            const canRetryNow =
              (liveSnapshot.phase === RoundPhase.PREPARING || liveSnapshot.phase === RoundPhase.RUNNING) &&
              liveSnapshot.canPlaceBet;
            if (!canRetryNow) continue;

            result = await adapter.placeBet(amount, currency);
            if (result.ok) break;
            if (!isRoundSwitchErrorMessage(result.message)) break;
          }
        }

        if (!result.ok) {
          showToast(localizeAdapterMessage(result.message, t));
          return false;
        }

        await refreshWalletBalances();
        onWalletNeedsRefreshRef.current?.();
        haptics.betPlaced();
        return true;
      } finally {
        setBetSubmitting(false);
      }
    },
    [haptics, isBetSubmitting, isCashoutSubmitting, refreshWalletBalances, showToast, t],
  );

  const onCashOut = useCallback(async () => {
    const adapter = roundAdapterRef.current;
    if (!adapter) return;
    if (isCashoutSubmitting || isBetSubmitting) return;

    setCashoutSubmitting(true);
    try {
      const result = await adapter.cashOut();
      if (!result.ok) {
        showToast(localizeAdapterMessage(result.message, t));
        return;
      }

      haptics.cashoutSuccess();
      showToast(t("rush.cashoutToast", {
        payout: formatCurrencyAmount(result.currency, result.payout, { compactStars: false }),
        multiplier: result.multiplier.toFixed(2),
        currency: result.currency,
      }));
      await refreshWalletBalances();
      onWalletNeedsRefreshRef.current?.();
    } finally {
      setCashoutSubmitting(false);
    }
  }, [haptics, isBetSubmitting, isCashoutSubmitting, refreshWalletBalances, showToast, t]);

  const onPlaceFromModal = useCallback(async (payload: PlaceBetSubmitPayload) => {
    if (payload.tab === "GIFTS") {
      showToast(t("placeBet.emptyInventory"));
      return;
    }

    const amount = Math.max(0, payload.amount);
    const currency: Currency = payload.tab === "STARS" ? "STARS" : "TON";
    setBetAmount(amount);

    const accepted = await placeBetAmount(amount, currency);
    if (!accepted) return;

    setPlaceModalOpen(false);
  }, [placeBetAmount, showToast, t]);

  const isPreparing = snapshot.phase === RoundPhase.PREPARING;
  const isRunning = snapshot.phase === RoundPhase.RUNNING;
  const isSettling = snapshot.phase === RoundPhase.CRASHED || snapshot.phase === RoundPhase.RESETTING;
  const hasStatusChip = isPreparing || isRunning || isSettling;
  const history = useMemo(() => {
    const source = isSettling
      ? snapshot.history.filter((item) => item.roundId !== snapshot.roundId)
      : snapshot.history;
    return source.slice(0, 6);
  }, [isSettling, snapshot.history, snapshot.roundId]);
  const currentRoundHistoryDetails = useMemo<HistoryDetailsState>(() => ({
    key: `round-${snapshot.roundId}`,
    isCurrentRound: true,
    roundId: snapshot.roundId,
    crashAt: snapshot.phase === RoundPhase.RUNNING ? coefficient : snapshot.crashAt,
    timestamp: null,
    serverSeedHash: snapshot.fairness?.serverSeedHash ?? null,
    serverSeed: snapshot.fairness?.serverSeed ?? null,
  }), [
    coefficient,
    snapshot.crashAt,
    snapshot.fairness?.serverSeed,
    snapshot.fairness?.serverSeedHash,
    snapshot.phase,
    snapshot.roundId,
  ]);
  const userActive = snapshot.userActiveBet?.status === "ACTIVE" ? snapshot.userActiveBet : null;
  const canCashOutNow = snapshot.phase === RoundPhase.RUNNING && snapshot.canCashOut && !!userActive;
  const isActionBusy = isBetSubmitting || isCashoutSubmitting;
  const isConnectionInterrupted = connectionState.status !== "connected";
  const cashoutAmount = userActive ? userActive.amount * coefficient : 0;
  const activeBetCurrency = userActive?.currency ?? "TON";
  const connectionHint = useMemo(() => {
    if (!isConnectionInterrupted) return "";
    if (connectionState.reconnectAttempt > 0) {
      return t("rush.connectionRetry", { attempt: connectionState.reconnectAttempt });
    }
    return t("rush.connectionLost");
  }, [connectionState.reconnectAttempt, isConnectionInterrupted, t]);
  const connectionStatusText = isConnectionInterrupted
    ? connectionHint || formatConnectionHint(connectionState.reconnectAttempt, t)
    : "";
  const ctaState = useMemo<MainCtaState>(() => {
    if (isConnectionInterrupted) return "connection-lost";
    if (isActionBusy) return "submitting";
    if (canCashOutNow) return "cashout-ready";
    return "bet-ready";
  }, [canCashOutNow, isActionBusy, isConnectionInterrupted]);
  const mainBetLabel = useMemo(() => {
    if (ctaState === "connection-lost") return t("rush.noConnection");
    if (ctaState === "submitting") {
      return isCashoutSubmitting ? t("rush.cashoutShort") : t("rush.submit");
    }
    if (ctaState === "cashout-ready") {
      return t("rush.cashout", {
        amount: formatCurrencyAmount(activeBetCurrency, cashoutAmount, { compactStars: false }),
        currency: activeBetCurrency,
      });
    }
    return t("rush.bet");
  }, [activeBetCurrency, cashoutAmount, ctaState, isCashoutSubmitting, t]);
  const isMainActionDisabled =
    ctaState === "submitting" || ctaState === "connection-lost";
  const ctaStateClass = ctaState === "cashout-ready"
    ? styles.btnStateCashout
    : ctaState === "connection-lost"
      ? styles.btnStateDisconnected
      : ctaState === "submitting"
        ? styles.btnStateSubmitting
        : styles.btnStateBetReady;
  const ctaSheenMode = ctaState === "submitting" || ctaState === "connection-lost"
      ? "off"
      : "always";
  const statusChipLabel = isRunning
    ? `x${coefficient.toFixed(2)}`
    : isSettling
      ? `x${snapshot.crashAt.toFixed(2)}`
      : t("rush.waiting");
  const statusChipClass = isRunning
    ? styles.historyPillLive
    : isSettling
      ? styles.historyPillActive
      : styles.historyPillWaiting;
  const statusChipTextKey = `${snapshot.roundId}-${snapshot.phase}-${locale}`;

  const buildCompletedHistoryDetails = useCallback((item: RoundHistoryItem): HistoryDetailsState => ({
    key: `round-${item.roundId}`,
    isCurrentRound: false,
    roundId: item.roundId,
    crashAt: item.crashAt,
    timestamp: item.timestamp,
    serverSeedHash: item.serverSeedHash ?? null,
    serverSeed: item.serverSeed ?? null,
  }), []);

  const onToggleHistoryDetails = useCallback((key: string) => {
    setCopiedHistoryField(null);
    setOpenHistoryKey((prev) => (prev === key ? null : key));
  }, []);

  const selectedHistoryDetails = useMemo<HistoryDetailsState | null>(() => {
    if (!openHistoryKey) return null;
    if (openHistoryKey === currentRoundHistoryDetails.key) return currentRoundHistoryDetails;
    const found = history.find((item) => `round-${item.roundId}` === openHistoryKey);
    return found ? buildCompletedHistoryDetails(found) : null;
  }, [buildCompletedHistoryDetails, currentRoundHistoryDetails, history, openHistoryKey]);

  const showExpandedHistoryDetails = useMemo(() => {
    if (!selectedHistoryDetails) return false;
    if (!selectedHistoryDetails.isCurrentRound) return true;
    return snapshot.phase === RoundPhase.CRASHED || snapshot.phase === RoundPhase.RESETTING;
  }, [selectedHistoryDetails, snapshot.phase]);

  const updateHistoryPopoverPosition = useCallback(() => {
    if (!openHistoryKey) {
      setHistoryPopoverPos(null);
      return;
    }
    const row = historyRowRef.current;
    if (!row) {
      setHistoryPopoverPos(null);
      return;
    }
    const anchor = row.querySelector<HTMLElement>(`[data-history-key="${openHistoryKey}"]`);
    if (!anchor) {
      setHistoryPopoverPos(null);
      return;
    }
    const anchorRect = anchor.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const popoverWidth = Math.min(
      HISTORY_POPOVER_MAX_WIDTH_PX,
      Math.max(0, viewportWidth - HISTORY_POPOVER_SIDE_GAP_PX * 2),
    );
    const anchorCenterX = anchorRect.left + anchorRect.width / 2;
    const minLeft = HISTORY_POPOVER_SIDE_GAP_PX;
    const maxLeft = viewportWidth - popoverWidth - HISTORY_POPOVER_SIDE_GAP_PX;
    const left = maxLeft > minLeft
      ? Math.min(maxLeft, Math.max(minLeft, anchorCenterX - popoverWidth / 2))
      : Math.max(0, anchorCenterX - popoverWidth / 2);
    const top = anchorRect.bottom + 9;
    setHistoryPopoverPos((prev) => {
      if (prev && Math.abs(prev.left - left) < 0.5 && Math.abs(prev.top - top) < 0.5) return prev;
      return { left, top };
    });
  }, [openHistoryKey]);

  const onCopyHistoryValue = useCallback(async (field: "hash" | "seed", value: string | null) => {
    if (!value) return;
    if (typeof window === "undefined" || typeof document === "undefined") return;

    let copied = false;

    if (window.isSecureContext && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(value);
        copied = true;
      } catch {
        copied = false;
      }
    }

    if (!copied) {
      const helper = document.createElement("textarea");
      helper.value = value;
      helper.setAttribute("readonly", "true");
      helper.style.position = "fixed";
      helper.style.opacity = "0";
      helper.style.pointerEvents = "none";
      document.body.appendChild(helper);
      helper.select();
      try {
        copied = document.execCommand("copy");
      } catch {
        copied = false;
      }
      helper.remove();
    }

    if (!copied) {
      showToast(t("rush.copyFailed"));
      return;
    }

    setCopiedHistoryField(field);
    if (historyCopyResetTimerRef.current) {
      clearTimeout(historyCopyResetTimerRef.current);
      historyCopyResetTimerRef.current = null;
    }
    historyCopyResetTimerRef.current = setTimeout(() => {
      setCopiedHistoryField(null);
      historyCopyResetTimerRef.current = null;
    }, 1200);
    showToast(field === "hash" ? t("rush.hashCopied") : t("rush.seedCopied"));
  }, [showToast, t]);

  useEffect(() => {
    if (!openHistoryKey) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      const row = historyRowRef.current;
      if (row?.contains(target)) return;
      const popover = historyPopoverRef.current;
      if (popover?.contains(target)) return;
      setOpenHistoryKey(null);
      setCopiedHistoryField(null);
      setHistoryPopoverPos(null);
    };

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [openHistoryKey]);

  useEffect(() => {
    if (!isSettingsOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      const row = historyRowRef.current;
      if (!row) return;

      const settingsButton = row.querySelector<HTMLElement>("[data-rush-settings-button]");
      if (settingsButton?.contains(target)) return;
      if (settingsPopoverRef.current?.contains(target)) return;
      setSettingsOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [isSettingsOpen]);

  useEffect(() => {
    if (!openHistoryKey) {
      setHistoryPopoverPos(null);
      return;
    }

    const rail = historyRailRef.current;
    const refresh = () => updateHistoryPopoverPosition();

    refresh();
    rail?.addEventListener("scroll", refresh, { passive: true });
    window.addEventListener("resize", refresh, { passive: true });
    window.addEventListener("scroll", refresh, { passive: true });

    return () => {
      rail?.removeEventListener("scroll", refresh);
      window.removeEventListener("resize", refresh);
      window.removeEventListener("scroll", refresh);
    };
  }, [openHistoryKey, updateHistoryPopoverPosition]);

  useEffect(() => {
    if (!openHistoryKey) return;
    updateHistoryPopoverPosition();
  }, [openHistoryKey, selectedHistoryDetails, coefficient, snapshot.phase, snapshot.roundId, history.length, updateHistoryPopoverPosition]);
  useEffect(() => {
    const rail = historyRailRef.current;
    if (!rail) return;

    const updateHistoryEdgeFade = () => {
      const maxScrollLeft = rail.scrollWidth - rail.clientWidth;
      if (maxScrollLeft <= 1) {
        setShowHistoryEdgeFade(false);
        return;
      }
      const hasHiddenRightPart = rail.scrollLeft < maxScrollLeft - 1;
      setShowHistoryEdgeFade(hasHiddenRightPart);
    };

    updateHistoryEdgeFade();
    rail.addEventListener("scroll", updateHistoryEdgeFade, { passive: true });
    const observer = new ResizeObserver(updateHistoryEdgeFade);
    observer.observe(rail);

    return () => {
      rail.removeEventListener("scroll", updateHistoryEdgeFade);
      observer.disconnect();
    };
  }, [hasStatusChip, isRunning, history.length]);

  useEffect(() => {
    const rail = historyRailRef.current;
    if (!rail) return;
    rail.scrollTo({ left: 0, behavior: "auto" });
  }, [snapshot.phase, snapshot.roundId]);

  const onMainAction = useCallback(() => {
    setSettingsOpen(false);
    if (ctaState === "connection-lost") return;
    if (ctaState === "cashout-ready") {
      void onCashOut();
      return;
    }

    if (ctaState !== "bet-ready") return;
    setPlaceModalOpen(true);
  }, [ctaState, onCashOut]);
  const getRocketPose = useCallback(() => rendererRef.current?.getRocketPose() ?? null, [rendererRef]);
  const onHistoryWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    const rail = historyRailRef.current;
    if (!rail) return;
    if (Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;
    if (rail.scrollWidth <= rail.clientWidth) return;
    event.preventDefault();
    rail.scrollLeft += event.deltaY;
  }, []);

  return (
    <div ref={panelRootRef} className={styles.panelRoot}>
      <div className={styles.gameArea}>
        <div ref={mountRef} className={styles.phaserMount} />
        <RocketOverlay getPose={getRocketPose} />

        {snapshot.phase !== RoundPhase.RUNNING ? (
          <div className={styles.coeffOverlay}>
            <CoefficientDisplay
              phase={snapshot.phase}
              coefficient={coefficient}
              crashAt={snapshot.crashAt}
              countdown={snapshot.countdown}
            />
          </div>
        ) : null}

        {isConnectionInterrupted ? (
          <div className={styles.connectionBanner} role="status" aria-live="polite">
            <span className={styles.connectionBannerTitle}>{t("rush.noConnection")}</span>
            <span className={styles.connectionBannerText}>{connectionStatusText}</span>
          </div>
        ) : null}

        <div ref={historyRowRef} className={styles.historyRow}>
          <div ref={historyRailRef} className={styles.historyRail} onWheel={onHistoryWheel}>
            {hasStatusChip ? (
              <div className={styles.historyPillWrap}>
                <button
                  type="button"
                  className={styles.historyPillBtn}
                  data-history-key={currentRoundHistoryDetails.key}
                  onClick={() => onToggleHistoryDetails(currentRoundHistoryDetails.key)}
                  aria-label={t("rush.fairness.currentRound")}
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
                      aria-label={t("rush.fairness.roundDetails", { roundId: item.roundId })}
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
            className={`${styles.historyEdgeFade} ${!showHistoryEdgeFade ? styles.historyEdgeFadeHidden : ""}`}
            aria-hidden="true"
          />

          {/* settings gear */}
          <button
            type="button"
            data-rush-settings-button="true"
            className={styles.settingsBtn}
            aria-label={t("rush.settingsButton")}
            aria-expanded={isSettingsOpen}
            onClick={() => setSettingsOpen((prev) => !prev)}
          >
            <Settings2 size={16} strokeWidth={2.1} />
          </button>

          <AnimatePresence initial={false}>
            {isSettingsOpen ? (
              <motion.div
                ref={settingsPopoverRef}
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
                    aria-label={t("rush.settings.haptics")}
                    onClick={() => setHapticsEnabled(!hapticsEnabled)}
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
                    aria-label={`${t("rush.settings.language")}: ${locale === "ru" ? "RU" : "EN"}`}
                    onClick={() => setLocale(locale === "ru" ? "en" : "ru")}
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
        </div>

        {typeof document !== "undefined"
          ? createPortal(
            <AnimatePresence initial={false}>
              {selectedHistoryDetails && historyPopoverPos ? (
                <motion.div
                  ref={historyPopoverRef}
                  className={`${styles.historyInfoPopover} ${styles.historyInfoPopoverFloating}`}
                  style={{
                    left: `${historyPopoverPos.left}px`,
                    top: `${historyPopoverPos.top}px`,
                  }}
                  initial={{ opacity: 0, y: -6, scale: 0.985 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -5, scale: 0.985 }}
                  transition={{ duration: 0.18, ease: HISTORY_POPOVER_EASE }}
                >
                  <div className={styles.historyInfoSection}>
                    <span className={styles.historyInfoLabel}>{t("rush.fairness.serverSeedHash")}</span>
                    <button
                      type="button"
                      className={styles.historyInfoCopyBtn}
                      disabled={!selectedHistoryDetails.serverSeedHash}
                      onClick={() => {
                        void onCopyHistoryValue("hash", selectedHistoryDetails.serverSeedHash);
                      }}
                    >
                      <span className={styles.historyInfoValue}>
                        {selectedHistoryDetails.serverSeedHash ?? "—"}
                      </span>
                      {copiedHistoryField === "hash" ? (
                        <Check size={14} className={styles.historyInfoCopyIcon} />
                      ) : (
                        <Copy size={14} className={styles.historyInfoCopyIcon} />
                      )}
                    </button>
                  </div>

                  {showExpandedHistoryDetails ? (
                    <>
                      <div className={styles.historyInfoSection}>
                        <span className={styles.historyInfoLabel}>{t("rush.fairness.serverSeed")}</span>
                        <button
                          type="button"
                          className={styles.historyInfoCopyBtn}
                          disabled={!selectedHistoryDetails.serverSeed}
                          onClick={() => {
                            void onCopyHistoryValue("seed", selectedHistoryDetails.serverSeed);
                          }}
                        >
                          <span className={styles.historyInfoValue}>
                            {selectedHistoryDetails.serverSeed ?? "—"}
                          </span>
                          {copiedHistoryField === "seed" ? (
                            <Check size={14} className={styles.historyInfoCopyIcon} />
                          ) : (
                            <Copy size={14} className={styles.historyInfoCopyIcon} />
                          )}
                        </button>
                      </div>

                      <div className={styles.historyInfoGrid}>
                        <span className={styles.historyInfoGridLabel}>{t("rush.fairness.coefficient")}</span>
                        <span className={styles.historyInfoGridValue}>{`${selectedHistoryDetails.crashAt.toFixed(2)}x`}</span>
                        <span className={styles.historyInfoGridLabel}>{t("rush.fairness.date")}</span>
                        <span className={styles.historyInfoGridValue}>{formatRoundDate(selectedHistoryDetails.timestamp, formatDate)}</span>
                        <span className={styles.historyInfoGridLabel}>{t("rush.fairness.time")}</span>
                        <span className={styles.historyInfoGridValue}>{formatRoundTime(selectedHistoryDetails.timestamp, formatTime)}</span>
                      </div>
                    </>
                  ) : null}
                </motion.div>
              ) : null}
            </AnimatePresence>,
            document.body,
          )
          : null}

        <section className={styles.betSection}>
          <div className={styles.betDock}>
            <button
              key={ctaState === "connection-lost" ? `offline-${connectionState.reconnectAttempt}` : ctaState}
              type="button"
              className={`${styles.actionButton} ${ctaStateClass} liquid-sheen`}
              disabled={isMainActionDisabled}
              data-sheen={ctaSheenMode}
              data-cta-state={ctaState}
              aria-busy={isActionBusy}
              onClick={onMainAction}
            >
              {ctaState === "connection-lost" ? t("rush.noConnection") : mainBetLabel}
            </button>
            {ctaState === "connection-lost" ? (
              <p className={styles.queueHint}>{connectionStatusText}</p>
            ) : null}
          </div>
        </section>
      </div>

      <PlayersBetsList
        players={snapshot.players}
        queuedBet={snapshot.queuedBet}
        phase={snapshot.phase}
        getLiveCoefficient={getLiveCoefficient}
      />

      <PlaceBetModal
        open={isPlaceModalOpen}
        defaultTonAmount={betAmount}
        currentPhase={snapshot.phase}
        tonAvailable={tonAvailableBalance}
        starsAvailable={starsAvailableBalance}
        anchorRect={panelAnchorRect}
        isSubmitting={isBetSubmitting}
        onOpenChange={(open) => {
          if (isBetSubmitting) return;
          if (open) {
            setSettingsOpen(false);
          }
          setPlaceModalOpen(open);
        }}
        onSubmit={onPlaceFromModal}
      />

      <AnimatePresence mode="wait" initial={false}>
        {toast ? (
          <div className={styles.toastLayer}>
            <motion.div
              key={toast.id}
              className={styles.toastMotion}
              initial={{ opacity: 0, y: -18, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -14, scale: 0.985 }}
              transition={{ duration: 0.24, ease: TOAST_EASE }}
            >
              <div className={styles.toast}>{toast.message}</div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}











