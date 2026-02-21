"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { StarRushGame } from "@/game/StarRushGame";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy, Settings2 } from "lucide-react";

import styles from "@/styles/starrush.module.css";

import {
  PlaceBetModal,
  type PlaceBetSubmitPayload,
} from "@/components/bets/PlaceBetModal";
import { CoefficientDisplay } from "@/components/game/CoefficientDisplay";
import { PlayersBetsList } from "@/components/game/PlayersBetsList";
import { RocketOverlay } from "@/components/game/RocketOverlay";
import { Currency, PlayerBetView, RoundHistoryItem, RoundPhase, RoundSnapshot } from "@/game/types";
import { BackendRoundStateAdapter } from "@/lib/game/backend-round-state-adapter";

const MIN_BET = 0.1;
const MAX_BET = 1000;
const TOAST_VISIBLE_MS = 4800;
const TOAST_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const ROUND_SWITCH_RETRY_WINDOW_MS = 3200;
const ROUND_SWITCH_RETRY_STEP_MS = 180;
const MIN_RENDER_SURFACE_PX = 24;
const HISTORY_POPOVER_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const HISTORY_POPOVER_SIDE_GAP_PX = 22;
const HISTORY_POPOVER_MAX_WIDTH_PX = 250;

const INITIAL_SNAPSHOT: RoundSnapshot = {
  phase: RoundPhase.PREPARING,
  roundId: "round-0",
  roundIndex: 0,
  onlineCount: 0,
  coefficient: 1,
  crashAt: 1.5,
  countdown: 5,
  runningElapsedMs: 0,
  phaseElapsedMs: 0,
  history: [],
  fairness: null,
  players: [],
  queuedBet: null,
  userActiveBet: null,
  canPlaceBet: true,
  canCashOut: false,
};

interface StarRushPanelProps {
  initialTonBalance?: number;
  initialStarsBalance?: number;
  isActive?: boolean;
  onOnlineCountChange?: (count: number) => void;
  onWalletNeedsRefresh?: () => void;
}

type ToastState = {
  id: number;
  message: string;
};

type HistoryDetailsState = {
  key: string;
  isCurrentRound: boolean;
  roundId: string;
  crashAt: number;
  timestamp: number | null;
  serverSeedHash: string | null;
  serverSeed: string | null;
};

type HistoryPopoverPosition = {
  left: number;
  top: number;
};

type WalletsApiResponse = {
  ok?: boolean;
  wallets?: Array<{
    currency?: string;
    balance?: string;
    lockedBalance?: string;
  }>;
};

function toFiniteNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function formatRoundDate(timestamp: number | null): string {
  if (!timestamp || !Number.isFinite(timestamp)) return "--.--.----";
  return new Date(timestamp).toLocaleDateString("ru-RU");
}

function formatRoundTime(timestamp: number | null): string {
  if (!timestamp || !Number.isFinite(timestamp)) return "--:--:--";
  return new Date(timestamp).toLocaleTimeString("ru-RU", { hour12: false });
}

function isRoundSwitchErrorMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("round is not accepting bets") ||
    normalized.includes("betting closed") ||
    normalized.includes("раунд сейчас не принимает ставки")
  );
}
function historyPillClass(crashAt: number, isFirst: boolean): string {
  if (isFirst) return `${styles.historyPill} ${styles.historyPillFirst}`;
  if (crashAt < 1.6) return `${styles.historyPill} ${styles.historyLow}`;
  if (crashAt < 3.2) return `${styles.historyPill} ${styles.historyMid}`;
  return `${styles.historyPill} ${styles.historyHigh}`;
}

function isSameBet(a: PlayerBetView | null, b: PlayerBetView | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.id === b.id &&
    a.status === b.status &&
    a.amount === b.amount &&
    a.payout === b.payout &&
    a.cashoutMultiplier === b.cashoutMultiplier &&
    a.visibleToCurrentUserOnly === b.visibleToCurrentUserOnly
  );
}

function isSamePlayers(a: PlayerBetView[], b: PlayerBetView[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;

  for (let i = 0; i < a.length; i += 1) {
    const p = a[i];
    const n = b[i];
    if (
      p.id !== n.id ||
      p.status !== n.status ||
      p.amount !== n.amount ||
      p.payout !== n.payout ||
      p.cashoutMultiplier !== n.cashoutMultiplier ||
      p.visibleToCurrentUserOnly !== n.visibleToCurrentUserOnly
    ) {
      return false;
    }
  }

  return true;
}

function hasStructuralSnapshotChange(prev: RoundSnapshot, next: RoundSnapshot): boolean {
  if (prev.phase !== next.phase) return true;
  if (prev.roundId !== next.roundId) return true;
  if (prev.roundIndex !== next.roundIndex) return true;
  if (prev.onlineCount !== next.onlineCount) return true;
  if (prev.countdown !== next.countdown) return true;
  if (prev.crashAt !== next.crashAt) return true;
  if ((prev.fairness?.serverSeedHash ?? null) !== (next.fairness?.serverSeedHash ?? null)) return true;
  if ((prev.fairness?.serverSeed ?? null) !== (next.fairness?.serverSeed ?? null)) return true;
  if (prev.canPlaceBet !== next.canPlaceBet) return true;
  if (prev.canCashOut !== next.canCashOut) return true;
  if (!isSameBet(prev.queuedBet, next.queuedBet)) return true;
  if (!isSameBet(prev.userActiveBet, next.userActiveBet)) return true;
  if (!isSamePlayers(prev.players, next.players)) return true;
  if (prev.history.length !== next.history.length) return true;

  for (let i = 0; i < prev.history.length; i += 1) {
    if (
      prev.history[i].roundId !== next.history[i].roundId ||
      prev.history[i].crashAt !== next.history[i].crashAt ||
      prev.history[i].timestamp !== next.history[i].timestamp ||
      (prev.history[i].serverSeedHash ?? null) !== (next.history[i].serverSeedHash ?? null) ||
      (prev.history[i].serverSeed ?? null) !== (next.history[i].serverSeed ?? null)
    ) {
      return true;
    }
  }

  return false;
}

function cloneSnapshotForPhaser(snapshot: RoundSnapshot): RoundSnapshot {
  return {
    ...snapshot,
    history: snapshot.history.map((item) => ({ ...item })),
    players: snapshot.players.map((player) => ({ ...player })),
    queuedBet: snapshot.queuedBet ? { ...snapshot.queuedBet } : null,
    userActiveBet: snapshot.userActiveBet ? { ...snapshot.userActiveBet } : null,
  };
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
  const panelRootRef = useRef<HTMLDivElement | null>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const historyRowRef = useRef<HTMLDivElement | null>(null);
  const historyRailRef = useRef<HTMLDivElement | null>(null);
  const historyPopoverRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<StarRushGame | null>(null);
  const resizeObRef = useRef<ResizeObserver | null>(null);
  const roundAdapterRef = useRef<BackendRoundStateAdapter | null>(null);
  const isPanelActiveRef = useRef(isActive);
  const activationResizeRafRef = useRef<number | null>(null);

  const [snapshot, setSnapshot] = useState<RoundSnapshot>(INITIAL_SNAPSHOT);
  const [coefficient, setCoefficient] = useState<number>(INITIAL_SNAPSHOT.coefficient);
  const [betAmount, setBetAmount] = useState<number>(1);
  const [walletTonBalance, setWalletTonBalance] = useState<number>(Math.max(0, initialTonBalance));
  const [walletTonLocked, setWalletTonLocked] = useState<number>(0);
  const [walletStarsBalance, setWalletStarsBalance] = useState<number>(Math.max(0, initialStarsBalance));
  const [walletStarsLocked, setWalletStarsLocked] = useState<number>(0);
  const [isBetSubmitting, setBetSubmitting] = useState(false);
  const [isCashoutSubmitting, setCashoutSubmitting] = useState(false);
  const [panelAnchorRect, setPanelAnchorRect] = useState<{ left: number; width: number } | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [isPlaceModalOpen, setPlaceModalOpen] = useState(false);
  const [showHistoryEdgeFade, setShowHistoryEdgeFade] = useState(false);
  const [openHistoryKey, setOpenHistoryKey] = useState<string | null>(null);
  const [historyPopoverPos, setHistoryPopoverPos] = useState<HistoryPopoverPosition | null>(null);
  const [copiedHistoryField, setCopiedHistoryField] = useState<"hash" | "seed" | null>(null);

  // Separate fast-changing coefficient from structural snapshot
  // so the bets list doesn't re-render at ~15fps during RUNNING.
  const lastStructRef = useRef<RoundSnapshot>(INITIAL_SNAPSHOT);
  const coeffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCoeffRef = useRef<number>(INITIAL_SNAPSHOT.coefficient);
  const latestPhaserSnapshotRef = useRef<RoundSnapshot>(cloneSnapshotForPhaser(INITIAL_SNAPSHOT));
  const debugPhaserSyncRef = useRef(false);
  const renderCountRef = useRef(0);
  const toastIdRef = useRef(0);
  const historyCopyResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onOnlineCountChangeRef = useRef(onOnlineCountChange);
  const onWalletNeedsRefreshRef = useRef(onWalletNeedsRefresh);
  renderCountRef.current += 1;

  useEffect(() => {
    onOnlineCountChangeRef.current = onOnlineCountChange;
  }, [onOnlineCountChange]);

  useEffect(() => {
    onWalletNeedsRefreshRef.current = onWalletNeedsRefresh;
  }, [onWalletNeedsRefresh]);

  useEffect(() => {
    setWalletTonBalance(Math.max(0, initialTonBalance));
  }, [initialTonBalance]);

  useEffect(() => {
    setWalletStarsBalance(Math.max(0, initialStarsBalance));
  }, [initialStarsBalance]);

  const showToast = useCallback((message: string) => {
    const trimmed = message.trim();
    if (!trimmed) return;
    toastIdRef.current += 1;
    setToast({ id: toastIdRef.current, message: trimmed });
  }, []);

  const refreshTonWalletBalance = useCallback(async () => {
    const response = await fetch("/api/wallets", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });

    const payload = (await response.json().catch(() => ({}))) as WalletsApiResponse;
    if (!response.ok || payload?.ok !== true || !Array.isArray(payload.wallets)) return;

    const tonWallet = payload.wallets.find((wallet) => wallet.currency === "TON");
    const starsWallet = payload.wallets.find((wallet) => wallet.currency === "STARS");

    setWalletTonBalance(Math.max(0, toFiniteNumber(tonWallet?.balance)));
    setWalletTonLocked(Math.max(0, toFiniteNumber(tonWallet?.lockedBalance)));
    setWalletStarsBalance(Math.max(0, toFiniteNumber(starsWallet?.balance)));
    setWalletStarsLocked(Math.max(0, toFiniteNumber(starsWallet?.lockedBalance)));
  }, []);

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
  /* -- backend adapter + renderer init -- */
  useEffect(() => {
    const isDevClient = process.env.NODE_ENV !== "production" && typeof window !== "undefined";
    const params = isDevClient ? new URLSearchParams(window.location.search) : null;
    const debugRoundSync = Boolean(isDevClient && params?.has("debugRoundSync"));
    const debugPhaserSync = Boolean(isDevClient && params?.has("debugPhaserSync"));
    debugPhaserSyncRef.current = debugPhaserSync;
    const adapter = new BackendRoundStateAdapter({
      debug: debugRoundSync,
      snapshotPath: "/api/game/round/current",
    });
    roundAdapterRef.current = adapter;

    const unsub = adapter.subscribe((next) => {
      const phaserSnapshot = cloneSnapshotForPhaser(next);
      latestPhaserSnapshotRef.current = phaserSnapshot;

      // Always forward to Phaser (it handles its own frame-rate)
      if (rendererRef.current) {
        if (debugPhaserSyncRef.current) {
          console.debug(
            `[StarRushPanel][PhaserSync] apply snapshot round=${phaserSnapshot.roundId} phase=${phaserSnapshot.phase} coeff=${phaserSnapshot.coefficient.toFixed(4)}`,
          );
        }
        rendererRef.current.applySnapshot(phaserSnapshot);
      }

      pendingCoeffRef.current = next.coefficient;

      const prev = lastStructRef.current;
      const structChanged = hasStructuralSnapshotChange(prev, next);

      if (structChanged) {
        // Structural change - update immediately (bets/phase changed)
        lastStructRef.current = next;
        setSnapshot(next);
        setCoefficient(next.coefficient);
      } else {
        // Coefficient-only tick - throttle to ~100ms for React UI
        if (!coeffTimerRef.current) {
          coeffTimerRef.current = setTimeout(() => {
            coeffTimerRef.current = null;
            setCoefficient(pendingCoeffRef.current);
          }, 100);
        }
      }
    });

    let cancelled = false;

    const bootstrap = async () => {
      // Adapter performs snapshot resync before ws connect.
      await adapter.start();
      if (cancelled) return;
      await refreshTonWalletBalance();
      onWalletNeedsRefreshRef.current?.();
      if (cancelled) return;

      if (!mountRef.current) return;
      const { StarRushGame } = await import("@/game/StarRushGame");
      if (cancelled || !mountRef.current) return;

      const renderer = new StarRushGame(mountRef.current, { debugSync: debugPhaserSync });
      rendererRef.current = renderer;

      // Phaser Scale.RESIZE handles initial canvas sizing via its own
      // resize event (fires inside create()). We only push later container
      // size changes through the ResizeObserver - hooked AFTER the renderer
      // exists so we never call resize() before the scene has booted.
      const initialPhaserSnapshot = cloneSnapshotForPhaser(latestPhaserSnapshotRef.current);
      latestPhaserSnapshotRef.current = initialPhaserSnapshot;
      if (debugPhaserSyncRef.current) {
        console.debug(
          `[StarRushPanel][PhaserSync] bootstrap snapshot round=${initialPhaserSnapshot.roundId} phase=${initialPhaserSnapshot.phase} coeff=${initialPhaserSnapshot.coefficient.toFixed(4)}`,
        );
      }
      renderer.applySnapshot(initialPhaserSnapshot);

      const el = mountRef.current;
      if (el && !cancelled) {
        resizeObRef.current = new ResizeObserver((entries) => {
          const e = entries[0];
          if (!e) return;
          if (!isPanelActiveRef.current) return;
          const nextWidth = e.contentRect.width;
          const nextHeight = e.contentRect.height;
          if (nextWidth < MIN_RENDER_SURFACE_PX || nextHeight < MIN_RENDER_SURFACE_PX) return;
          rendererRef.current?.resize(nextWidth, nextHeight);
        });
        resizeObRef.current.observe(el);
      }
    };

    bootstrap().catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to start renderer";
      showToast(msg);
    });

    const onVis = () => {
      const hidden = document.hidden || !isPanelActiveRef.current;
      adapter.setDocumentHidden(hidden);
      rendererRef.current?.setLowPowerMode(hidden);
    };
    document.addEventListener("visibilitychange", onVis);
    onVis();

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
      resizeObRef.current?.disconnect();
      resizeObRef.current = null;
      if (coeffTimerRef.current) { clearTimeout(coeffTimerRef.current); coeffTimerRef.current = null; }
      unsub();
      adapter.destroy();
      roundAdapterRef.current = null;
      rendererRef.current?.destroy();
      rendererRef.current = null;
      debugPhaserSyncRef.current = false;
    };
  }, [refreshTonWalletBalance, showToast]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), TOAST_VISIBLE_MS);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    onOnlineCountChangeRef.current?.(snapshot.onlineCount);
  }, [snapshot.onlineCount]);

  useEffect(() => {
    return () => {
      if (historyCopyResetTimerRef.current) {
        clearTimeout(historyCopyResetTimerRef.current);
        historyCopyResetTimerRef.current = null;
      }
      if (activationResizeRafRef.current !== null) {
        cancelAnimationFrame(activationResizeRafRef.current);
        activationResizeRafRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    isPanelActiveRef.current = isActive;
    if (activationResizeRafRef.current !== null) {
      cancelAnimationFrame(activationResizeRafRef.current);
      activationResizeRafRef.current = null;
    }
    if (typeof window === "undefined" || typeof document === "undefined") return;
    const hidden = document.hidden || !isActive;
    roundAdapterRef.current?.setDocumentHidden(hidden);
    rendererRef.current?.setLowPowerMode(hidden);
    if (!isActive) return;

    activationResizeRafRef.current = window.requestAnimationFrame(() => {
      activationResizeRafRef.current = null;
      const host = mountRef.current;
      if (!host) return;
      const rect = host.getBoundingClientRect();
      if (rect.width < MIN_RENDER_SURFACE_PX || rect.height < MIN_RENDER_SURFACE_PX) return;
      rendererRef.current?.resize(rect.width, rect.height);
    });
  }, [isActive]);

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

      const amount = Math.round(Math.max(0, rawBetAmount) * 100) / 100;
      if (!Number.isFinite(amount) || amount < MIN_BET || amount > MAX_BET) {
        showToast(`Допустимая ставка ${MIN_BET} - ${MAX_BET}`);
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
          showToast(result.message);
          return false;
        }

        await refreshTonWalletBalance();
        onWalletNeedsRefreshRef.current?.();
        return true;
      } finally {
        setBetSubmitting(false);
      }
    },
    [isBetSubmitting, isCashoutSubmitting, refreshTonWalletBalance, showToast],
  );

  const onCashOut = useCallback(async () => {
    const adapter = roundAdapterRef.current;
    if (!adapter) return;
    if (isCashoutSubmitting || isBetSubmitting) return;

    setCashoutSubmitting(true);
    try {
      const result = await adapter.cashOut();
      if (!result.ok) {
        showToast(result.message);
        return;
      }

      showToast(`Вывод ${result.payout.toFixed(2)} TON (${result.multiplier.toFixed(2)}x)`);
      await refreshTonWalletBalance();
      onWalletNeedsRefreshRef.current?.();
    } finally {
      setCashoutSubmitting(false);
    }
  }, [isBetSubmitting, isCashoutSubmitting, refreshTonWalletBalance, showToast]);

  const onPlaceFromModal = useCallback(async (payload: PlaceBetSubmitPayload) => {
    if (payload.tab === "GIFTS") {
      showToast("Инвентарь пуст");
      return;
    }

    const amount = Math.max(0, payload.amount);
    const currency: Currency = payload.tab === "STARS" ? "STARS" : "TON";
    setBetAmount(amount);

    const accepted = await placeBetAmount(amount, currency);
    if (!accepted) return;

    setPlaceModalOpen(false);
  }, [placeBetAmount, showToast]);

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
  const canPlaceInTransition =
    (snapshot.phase === RoundPhase.CRASHED || snapshot.phase === RoundPhase.RESETTING) &&
    !snapshot.queuedBet;
  const canPlaceBetNow =
    ((snapshot.phase === RoundPhase.PREPARING || snapshot.phase === RoundPhase.RUNNING) &&
      snapshot.canPlaceBet) ||
    canPlaceInTransition;
  const canCashOutNow = snapshot.phase === RoundPhase.RUNNING && snapshot.canCashOut && !!userActive;
  const isActionBusy = isBetSubmitting || isCashoutSubmitting;
  const cashoutAmount = userActive ? userActive.amount * coefficient : 0;
  const tonAvailableBalance = useMemo(
    () => Math.max(0, walletTonBalance - walletTonLocked),
    [walletTonBalance, walletTonLocked],
  );
  const starsAvailableBalance = useMemo(
    () => Math.max(0, walletStarsBalance - walletStarsLocked),
    [walletStarsBalance, walletStarsLocked],
  );
  const mainBetLabel = useMemo(() => {
    if (isCashoutSubmitting) return "Вывод...";
    if (canCashOutNow) return `Забрать ${cashoutAmount.toFixed(2)} TON`;
    if (isBetSubmitting) return "Отправка...";
    return "Сделать ставку";
  }, [canCashOutNow, cashoutAmount, isBetSubmitting, isCashoutSubmitting]);
  const isMainActionDisabled = canCashOutNow ? isActionBusy : isActionBusy || !canPlaceBetNow;
  const statusChipLabel = isRunning
    ? `x${coefficient.toFixed(2)}`
    : isSettling
      ? `x${snapshot.crashAt.toFixed(2)}`
      : "Ожидание";
  const statusChipClass = isRunning
    ? styles.historyPillLive
    : isSettling
      ? styles.historyPillSettling
      : styles.historyPillWaiting;
  const statusChipTextKey = `${snapshot.roundId}-${snapshot.phase}`;

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
      showToast("Не удалось скопировать");
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
    showToast(field === "hash" ? "Server Seed Hash скопирован" : "Server Seed скопирован");
  }, [showToast]);

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
    if (canCashOutNow) {
      void onCashOut();
      return;
    }

    if (!canPlaceBetNow || isActionBusy) return;
    setPlaceModalOpen(true);
  }, [canCashOutNow, canPlaceBetNow, isActionBusy, onCashOut]);
  const getRocketPose = useCallback(() => rendererRef.current?.getRocketPose() ?? null, []);
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

        {/* coefficient overlay (centered) */}
        <div className={styles.coeffOverlay}>
          <CoefficientDisplay
            phase={snapshot.phase}
            coefficient={coefficient}
            crashAt={snapshot.crashAt}
            countdown={snapshot.countdown}
          />
        </div>

        <div ref={historyRowRef} className={styles.historyRow}>
          <div ref={historyRailRef} className={styles.historyRail} onWheel={onHistoryWheel}>
            {hasStatusChip ? (
              <div className={styles.historyPillWrap}>
                <button
                  type="button"
                  className={styles.historyPillBtn}
                  data-history-key={currentRoundHistoryDetails.key}
                  onClick={() => onToggleHistoryDetails(currentRoundHistoryDetails.key)}
                  aria-label="Round fairness details"
                >
                  <span
                    className={`${styles.historyPill} ${styles.historyPillFirst} ${statusChipClass} ${
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
                      aria-label={`Round ${item.roundId} fairness details`}
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
          <button type="button" className={styles.settingsBtn} aria-label="Settings">
            <Settings2 size={16} strokeWidth={2.1} />
          </button>
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
                    <span className={styles.historyInfoLabel}>Server Seed Hash</span>
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
                        <span className={styles.historyInfoLabel}>Server Seed</span>
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
                        <span className={styles.historyInfoGridLabel}>Коэффициент:</span>
                        <span className={styles.historyInfoGridValue}>{`${selectedHistoryDetails.crashAt.toFixed(2)}x`}</span>
                        <span className={styles.historyInfoGridLabel}>Дата:</span>
                        <span className={styles.historyInfoGridValue}>{formatRoundDate(selectedHistoryDetails.timestamp)}</span>
                        <span className={styles.historyInfoGridLabel}>Время:</span>
                        <span className={styles.historyInfoGridValue}>{formatRoundTime(selectedHistoryDetails.timestamp)}</span>
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
          <button
            type="button"
            className={`${styles.actionButton} ${canCashOutNow ? styles.btnCashout : styles.btnBet}`}
            disabled={isMainActionDisabled}
            aria-busy={isActionBusy}
            onClick={onMainAction}
          >
            {mainBetLabel}
          </button>
        </section>
      </div>

      <PlayersBetsList
        players={snapshot.players}
        queuedBet={snapshot.queuedBet}
        phase={snapshot.phase}
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











