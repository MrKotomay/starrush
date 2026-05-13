import styles from "@/styles/starrush.module.css";

import {
  Currency,
  PlayerBetView,
  RoundPhase,
  RoundSnapshot,
} from "@/game/types";
import type { BackendRoundConnectionState } from "@/lib/game/backend-round-state-adapter";

/* ── Constants ─────────────────────────────────────── */

export const MIN_BET_BY_CURRENCY: Record<Currency, number> = {
  TON: 0.1,
  STARS: 1,
};

export const MAX_BET_BY_CURRENCY: Record<Currency, number> = {
  TON: 1000,
  STARS: 1000,
};

export const TOAST_VISIBLE_MS = 4800;
export const TOAST_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
export const ROUND_SWITCH_RETRY_WINDOW_MS = 3200;
export const ROUND_SWITCH_RETRY_STEP_MS = 180;
export const MIN_RENDER_SURFACE_PX = 24;
export const HISTORY_POPOVER_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
export const HISTORY_POPOVER_SIDE_GAP_PX = 22;
export const HISTORY_POPOVER_MAX_WIDTH_PX = 250;

export const INITIAL_SNAPSHOT: RoundSnapshot = {
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

export const INITIAL_CONNECTION_STATE: BackendRoundConnectionState = {
  status: "connected",
  reconnectAttempt: 0,
  nextRetryAt: null,
};

/* ── Local types ───────────────────────────────────── */

export type ToastState = {
  id: number;
  message: string;
};

export type HistoryDetailsState = {
  key: string;
  isCurrentRound: boolean;
  roundId: string;
  crashAt: number;
  timestamp: number | null;
  serverSeedHash: string | null;
  serverSeed: string | null;
};

export type HistoryPopoverPosition = {
  left: number;
  top: number;
};

export type MainCtaState = "bet-ready" | "cashout-ready" | "submitting" | "connection-lost";

export type WalletsApiResponse = {
  ok?: boolean;
  wallets?: Array<{
    currency?: string;
    balance?: string;
    lockedBalance?: string;
  }>;
};

/* ── Number / date formatters ──────────────────────── */

export function toFiniteNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function formatRoundDate(
  timestamp: number | null,
  formatter: (value: number | string | Date, options?: Intl.DateTimeFormatOptions) => string,
): string {
  if (!timestamp || !Number.isFinite(timestamp)) return "--.--.----";
  return formatter(timestamp);
}

export function formatRoundTime(
  timestamp: number | null,
  formatter: (value: number | string | Date, options?: Intl.DateTimeFormatOptions) => string,
): string {
  if (!timestamp || !Number.isFinite(timestamp)) return "--:--:--";
  return formatter(timestamp);
}

/* ── Round-switch detection ────────────────────────── */

export function isRoundSwitchErrorMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("round is not accepting bets") ||
    normalized.includes("betting closed") ||
    normalized.includes("раунд сейчас не принимает ставки")
  );
}

/* ── Adapter / connection-status localisation ──────── */

export function formatConnectionHint(
  attempt: number,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  if (attempt > 0) {
    return t("rush.connectionRetry", { attempt });
  }
  return t("rush.connectionLost");
}

export function localizeAdapterMessage(
  message: string,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  const normalized = message.trim().toLowerCase();

  if (
    normalized.includes("per-bet risk cap exceeded") ||
    normalized.includes("queued per-bet risk cap exceeded") ||
    normalized.includes("ставка слишком большая для текущих лимитов")
  ) {
    return t("rush.error.betTooLarge");
  }

  if (
    normalized.includes("round exposure cap exceeded") ||
    normalized.includes("queued round exposure cap exceeded") ||
    normalized.includes("лимит нагрузки на раунд достигнут")
  ) {
    return t("rush.error.roundExposureCap");
  }

  if (normalized.includes("queue risk buffer depleted") || normalized.includes("ставка на следующий раунд временно недоступна")) {
    return t("rush.error.queueUnavailable");
  }

  if (
    normalized.includes("risk-active state") ||
    normalized.includes("not running for queue acceptance") ||
    normalized.includes("раунд сейчас не принимает эту ставку")
  ) {
    return t("rush.error.roundNotAcceptingThisBet");
  }

  if (normalized.includes("ставка отклонена по лимиту риска")) {
    return t("rush.error.riskRejected");
  }

  if (
    normalized.includes("round is not accepting bets") ||
    normalized.includes("betting closed") ||
    normalized.includes("раунд сейчас не принимает ставки")
  ) {
    return t("rush.error.roundNotAccepting");
  }

  if (
    normalized.includes("нет соединения") ||
    normalized.includes("trying to reconnect") ||
    normalized.includes("пытаемся переподключиться")
  ) {
    return t("rush.connectionLost");
  }

  if (normalized.includes("вы уже поставили ставку") || normalized.includes("already placed a bet")) {
    return t("rush.error.alreadyBet");
  }

  if (normalized.includes("следующий раунд") && normalized.includes("у вас уже есть")) {
    return t("rush.error.queuedBetExists");
  }

  if (normalized.includes("недостаточно средств") || normalized.includes("insufficient balance")) {
    return t("rush.error.insufficientBalance");
  }

  if (normalized.includes("некорректная сумма ставки") || normalized.includes("invalid bet amount")) {
    return t("rush.error.invalidBetAmount");
  }

  if (normalized.includes("ошибка сервера при размещении ставки") || normalized.includes("server error while placing the bet")) {
    return t("rush.error.betServer");
  }

  if (normalized.includes("требуется авторизация") || normalized.includes("authorization required")) {
    return t("rush.error.authRequired");
  }

  if (normalized.includes("не удалось поставить ставку") || normalized.includes("could not place the bet")) {
    return t("rush.error.betFailed");
  }

  if (normalized.includes("round is not running")) {
    return t("rush.error.roundNotRunning");
  }

  if (normalized.includes("bet already cashed out")) {
    return t("rush.error.alreadyCashedOut");
  }

  if (normalized.includes("active bet not found")) {
    return t("rush.error.activeBetNotFound");
  }

  if (normalized.includes("server error while cashing out")) {
    return t("rush.error.cashoutServer");
  }

  if (normalized.includes("cashout failed")) {
    return t("rush.error.cashoutFailed");
  }

  return message;
}

/* ── History-pill style picker ─────────────────────── */

export function historyPillClass(crashAt: number, isFirst: boolean): string {
  if (isFirst) return `${styles.historyPill} ${styles.historyPillFirst}`;
  if (crashAt < 1.6) return `${styles.historyPill} ${styles.historyLow}`;
  if (crashAt < 3.2) return `${styles.historyPill} ${styles.historyMid}`;
  return `${styles.historyPill} ${styles.historyHigh}`;
}

/* ── Snapshot diff / cloning ───────────────────────── */

export function isSameBet(a: PlayerBetView | null, b: PlayerBetView | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.id === b.id &&
    a.status === b.status &&
    a.amount === b.amount &&
    a.currency === b.currency &&
    a.payout === b.payout &&
    a.cashoutMultiplier === b.cashoutMultiplier &&
    a.visibleToCurrentUserOnly === b.visibleToCurrentUserOnly
  );
}

export function isSamePlayers(a: PlayerBetView[], b: PlayerBetView[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;

  for (let i = 0; i < a.length; i += 1) {
    const p = a[i];
    const n = b[i];
    if (
      p.id !== n.id ||
      p.status !== n.status ||
      p.amount !== n.amount ||
      p.currency !== n.currency ||
      p.payout !== n.payout ||
      p.cashoutMultiplier !== n.cashoutMultiplier ||
      p.visibleToCurrentUserOnly !== n.visibleToCurrentUserOnly
    ) {
      return false;
    }
  }

  return true;
}

export function hasStructuralSnapshotChange(prev: RoundSnapshot, next: RoundSnapshot): boolean {
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

export function cloneSnapshotForPhaser(snapshot: RoundSnapshot): RoundSnapshot {
  return {
    ...snapshot,
    history: snapshot.history.map((item) => ({ ...item })),
    players: snapshot.players.map((player) => ({ ...player })),
    queuedBet: snapshot.queuedBet ? { ...snapshot.queuedBet } : null,
    userActiveBet: snapshot.userActiveBet ? { ...snapshot.userActiveBet } : null,
  };
}
