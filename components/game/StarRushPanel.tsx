"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Settings2 } from "lucide-react";

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
import { formatCurrencyAmount } from "@/lib/currency";
import { useHaptics } from "@/lib/haptics";
import { useI18n } from "@/lib/i18n";

import {
  HISTORY_POPOVER_MAX_WIDTH_PX,
  HISTORY_POPOVER_SIDE_GAP_PX,
  TOAST_VISIBLE_MS,
  formatConnectionHint,
  type HistoryDetailsState,
  type HistoryPopoverPosition,
  type MainCtaState,
  type ToastState,
} from "@/components/game/star-rush/helpers";
import { useGameActions } from "@/components/game/star-rush/hooks/use-game-actions";
import { useRoundAdapter } from "@/components/game/star-rush/hooks/use-round-adapter";
import { useWalletBalances } from "@/components/game/star-rush/hooks/use-wallet-balances";
import { ConnectionBanner } from "@/components/game/star-rush/parts/ConnectionBanner";
import { HistoryDetailsPopover } from "@/components/game/star-rush/parts/HistoryDetailsPopover";
import { HistoryRail } from "@/components/game/star-rush/parts/HistoryRail";
import { MainCta } from "@/components/game/star-rush/parts/MainCta";
import { SettingsPopover } from "@/components/game/star-rush/parts/SettingsPopover";
import { ToastLayer } from "@/components/game/star-rush/parts/ToastLayer";

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
  const [panelAnchorRect, setPanelAnchorRect] = useState<{ left: number; width: number } | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [isPlaceModalOpen, setPlaceModalOpen] = useState(false);
  const [isSettingsOpen, setSettingsOpen] = useState(false);
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

  const handleWalletNeedsRefresh = useCallback(() => {
    onWalletNeedsRefreshRef.current?.();
  }, []);

  const {
    isBetSubmitting,
    isCashoutSubmitting,
    isActionBusy,
    placeBet,
    cashOut: onCashOut,
  } = useGameActions({
    adapterRef: roundAdapterRef,
    haptics,
    t,
    showToast,
    refreshWalletBalances,
    onWalletNeedsRefresh: handleWalletNeedsRefresh,
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

  const onPlaceFromModal = useCallback(async (payload: PlaceBetSubmitPayload) => {
    if (payload.tab === "GIFTS") {
      showToast(t("placeBet.emptyInventory"));
      return;
    }

    const amount = Math.max(0, payload.amount);
    const currency: Currency = payload.tab === "STARS" ? "STARS" : "TON";
    setBetAmount(amount);

    const accepted = await placeBet(amount, currency);
    if (!accepted) return;

    setPlaceModalOpen(false);
  }, [placeBet, showToast, t]);

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
          <ConnectionBanner title={t("rush.noConnection")} hint={connectionStatusText} />
        ) : null}

        <HistoryRail
          history={history}
          buildCompletedHistoryDetails={buildCompletedHistoryDetails}
          openHistoryKey={openHistoryKey}
          onToggleHistoryDetails={onToggleHistoryDetails}
          hasStatusChip={hasStatusChip}
          currentRoundHistoryDetails={currentRoundHistoryDetails}
          statusChipLabel={statusChipLabel}
          statusChipClass={statusChipClass}
          statusChipTextKey={statusChipTextKey}
          currentRoundLabel={t("rush.fairness.currentRound")}
          roundDetailsAriaLabel={(roundId) => t("rush.fairness.roundDetails", { roundId })}
          phase={snapshot.phase}
          roundId={snapshot.roundId}
          rowRef={historyRowRef}
          railRef={historyRailRef}
          trailing={
            <>
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
              <SettingsPopover
                isOpen={isSettingsOpen}
                popoverRef={settingsPopoverRef}
                hapticsEnabled={hapticsEnabled}
                hapticsLabel={t("rush.settings.haptics")}
                onToggleHaptics={() => setHapticsEnabled(!hapticsEnabled)}
                locale={locale}
                languageLabel={`${t("rush.settings.language")}: ${locale === "ru" ? "RU" : "EN"}`}
                onToggleLocale={() => setLocale(locale === "ru" ? "en" : "ru")}
              />
            </>
          }
        />

        <HistoryDetailsPopover
          details={selectedHistoryDetails}
          position={historyPopoverPos}
          expanded={showExpandedHistoryDetails}
          copiedField={copiedHistoryField}
          popoverRef={historyPopoverRef}
          hashLabel={t("rush.fairness.serverSeedHash")}
          seedLabel={t("rush.fairness.serverSeed")}
          coefficientLabel={t("rush.fairness.coefficient")}
          dateLabel={t("rush.fairness.date")}
          timeLabel={t("rush.fairness.time")}
          onCopy={(field, value) => { void onCopyHistoryValue(field, value); }}
          formatDate={formatDate}
          formatTime={formatTime}
        />

        <MainCta
          ctaState={ctaState}
          ctaStateClass={ctaStateClass}
          ctaSheenMode={ctaSheenMode}
          reconnectAttempt={connectionState.reconnectAttempt}
          isMainActionDisabled={isMainActionDisabled}
          isActionBusy={isActionBusy}
          mainBetLabel={mainBetLabel}
          connectionLostLabel={t("rush.noConnection")}
          connectionStatusText={connectionStatusText}
          onClick={onMainAction}
        />
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

      <ToastLayer toast={toast} />
    </div>
  );
}











