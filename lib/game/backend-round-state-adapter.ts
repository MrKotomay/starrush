"use client";

import {
  CashOutResult,
  Currency,
  PlaceBetResult,
  PlayerBetView,
  RoundPhase,
  RoundSnapshot,
} from "@/game/types";
import type {
  BackendRoundStatus,
  BackendRoundPlayerState,
  CurrentRoundSnapshotResponse,
} from "@/lib/game/backend-round-types";
import { buildPublicPlayerProfile } from "@/lib/game/public-player";
import {
  GameWsClient,
  GameWsMultiplierPayload,
  GameWsOnlineCountPayload,
  GameWsPlayerBetPayload,
  GameWsPlayerCashoutPayload,
  GameWsRoundStatePayload,
  SnapshotSyncReason,
} from "@/lib/ws/game-ws-client";

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

const STATUS_BY_EVENT: Record<string, BackendRoundStatus> = {
  ROUND_WAITING: "WAITING",
  ROUND_STARTED: "RUNNING",
  ROUND_CRASHED: "CRASHED",
  ROUND_FINISHED: "FINISHED",
};

const PLAYERS_LIMIT = 300;
const PENDING_PLAYER_EVENT_LIMIT = 64;
const SELF_EVENT_MATCH_WINDOW_MS = 5000;

type Listener = (snapshot: RoundSnapshot) => void;
type ConnectionListener = (state: BackendRoundConnectionState) => void;

type MultiplierSample = {
  value: number;
  serverTs: number;
  receivedAt: number;
};

type BackendRoundStateAdapterOptions = {
  wsUrl?: string;
  snapshotPath?: string;
  debug?: boolean;
};

type CommandApiErrorPayload = {
  ok?: false;
  error?: string;
  message?: string;
};

type BetApiSuccessPayload = {
  ok: true;
  bet?: {
    mode?: "active" | "queued";
    roundId?: string;
    betAmount?: string | number;
    currency?: Currency;
  };
};

type CashoutApiSuccessPayload = {
  ok: true;
  cashout?: {
    multiplier?: number | string;
    payout?: number | string;
    profit?: number | string;
    currency?: Currency;
  };
};

type PendingSelfBet = {
  roundId: string;
  amount: number;
  currency: Currency;
  createdAt: number;
};

type PendingSelfCashout = {
  roundId: string;
  createdAt: number;
};

type PendingPlayerEvent =
  | { type: "player_bet"; payload: GameWsPlayerBetPayload }
  | { type: "player_cashout"; payload: GameWsPlayerCashoutPayload };

export type BackendRoundConnectionStatus = "connected" | "reconnecting";

export type BackendRoundConnectionState = {
  status: BackendRoundConnectionStatus;
  reconnectAttempt: number;
  nextRetryAt: number | null;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function computeExponentialMultiplier(elapsedSeconds: number, growthRatePerSecond: number): number {
  const safeElapsedSeconds = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0;
  const safeGrowthRate = Number.isFinite(growthRatePerSecond) ? Math.max(0, growthRatePerSecond) : 0;
  const rawMultiplier = Math.exp(safeGrowthRate * safeElapsedSeconds);
  return Math.max(1, Number(rawMultiplier.toFixed(4)));
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function normalizeCurrency(value: unknown): Currency | null {
  if (value === "TON" || value === "STARS") return value;
  return null;
}

function normalizeTimestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const asNumber = Number.parseFloat(value);
    if (Number.isFinite(asNumber)) return asNumber;
    const fromDate = Date.parse(value);
    if (Number.isFinite(fromDate)) return fromDate;
  }
  return null;
}

function toOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function toOptionalNullableString(value: unknown): string | null | undefined {
  if (value === null) return null;
  return toOptionalString(value);
}

function toOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function mergeFairnessState(
  prev: RoundSnapshot["fairness"],
  incoming: {
    serverSeedHash?: unknown;
    serverSeed?: unknown;
    fairnessVersion?: unknown;
    fairnessNonce?: unknown;
  },
): RoundSnapshot["fairness"] {
  const nextServerSeedHash = toOptionalString(incoming.serverSeedHash) ?? prev?.serverSeedHash ?? null;
  const nextFairnessVersion = toOptionalString(incoming.fairnessVersion) ?? prev?.fairnessVersion ?? null;
  const nextFairnessNonce =
    typeof incoming.fairnessNonce === "number" && Number.isFinite(incoming.fairnessNonce)
      ? incoming.fairnessNonce
      : prev?.fairnessNonce ?? null;
  const nextServerSeed =
    typeof incoming.serverSeed === "string"
      ? incoming.serverSeed
      : incoming.serverSeed === null
        ? null
        : prev?.serverSeed ?? null;

  if (!nextServerSeedHash || !nextFairnessVersion || nextFairnessNonce === null) {
    if (!prev) return null;
    return {
      ...prev,
      serverSeed: nextServerSeed,
    };
  }

  return {
    serverSeedHash: nextServerSeedHash,
    serverSeed: nextServerSeed,
    fairnessVersion: nextFairnessVersion,
    fairnessNonce: nextFairnessNonce,
  };
}

function normalizePlayersList(players: PlayerBetView[]): PlayerBetView[] {
  const sorted = [...players].sort((a, b) => {
    if (a.amount !== b.amount) return b.amount - a.amount;
    if (a.placedAt !== b.placedAt) return a.placedAt - b.placedAt;
    return a.id.localeCompare(b.id);
  });
  const seenUserIds = new Set<string>();
  const seenIds = new Set<string>();
  const normalized: PlayerBetView[] = [];
  for (const entry of sorted) {
    if (seenUserIds.has(entry.userId)) continue;
    if (seenIds.has(entry.id)) continue;
    seenUserIds.add(entry.userId);
    seenIds.add(entry.id);
    normalized.push(entry);
    if (normalized.length >= PLAYERS_LIMIT) break;
  }
  return normalized;
}

function arePlayersEquivalent(a: PlayerBetView, b: PlayerBetView): boolean {
  return (
    a.id === b.id &&
    a.userId === b.userId &&
    a.username === b.username &&
    a.amount === b.amount &&
    a.currency === b.currency &&
    a.status === b.status &&
    a.isCurrentUser === b.isCurrentUser &&
    a.visibleToCurrentUserOnly === b.visibleToCurrentUserOnly &&
    a.placedAt === b.placedAt &&
    a.cashoutMultiplier === b.cashoutMultiplier &&
    a.payout === b.payout &&
    a.autoCashoutAt === b.autoCashoutAt
  );
}

function arePlayerListsEquivalent(a: PlayerBetView[], b: PlayerBetView[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (!arePlayersEquivalent(a[i], b[i])) return false;
  }
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function resolveEventPublicProfile(args: {
  payload: Record<string, unknown>;
  fallbackUserId: string;
  existingPlayer?: PlayerBetView | null;
}) {
  const nestedPlayer = isRecord(args.payload.player) ? args.payload.player : null;
  return buildPublicPlayerProfile({
    userId:
      toOptionalString(args.payload.userId) ??
      toOptionalString(nestedPlayer?.userId) ??
      args.existingPlayer?.userId ??
      args.fallbackUserId,
    displayName: toOptionalString(args.payload.displayName) ?? toOptionalString(nestedPlayer?.displayName),
    username:
      toOptionalNullableString(args.payload.username) ??
      toOptionalNullableString(nestedPlayer?.username) ??
      args.existingPlayer?.username,
    isHidden: toOptionalBoolean(args.payload.isHidden) ?? toOptionalBoolean(nestedPlayer?.isHidden),
    visibleToCurrentUserOnly:
      toOptionalBoolean(args.payload.visibleToCurrentUserOnly) ??
      toOptionalBoolean(nestedPlayer?.visibleToCurrentUserOnly) ??
      args.existingPlayer?.visibleToCurrentUserOnly,
    avatarUrl: toOptionalNullableString(args.payload.avatarUrl) ?? toOptionalNullableString(nestedPlayer?.avatarUrl),
  });
}

function mapBackendPlayerToView(player: BackendRoundPlayerState): PlayerBetView {
  const publicPlayer = buildPublicPlayerProfile({
    userId: player.userId,
    displayName: player.displayName,
    username: player.username,
    isHidden: player.isHidden,
    visibleToCurrentUserOnly: player.visibleToCurrentUserOnly,
    avatarUrl: player.avatarUrl,
  });

  return {
    id: player.id,
    userId: player.userId,
    username: publicPlayer.displayName,
    amount: player.amount,
    currency: player.currency,
    status: player.status,
    isCurrentUser: player.isCurrentUser,
    visibleToCurrentUserOnly: publicPlayer.visibleToCurrentUserOnly,
    placedAt: player.placedAt,
    cashoutMultiplier: player.cashoutMultiplier,
    payout: player.payout,
    autoCashoutAt: player.autoCashoutAt,
  };
}

function statusToPhase(status: BackendRoundStatus): RoundPhase {
  switch (status) {
    case "WAITING":
      return RoundPhase.PREPARING;
    case "RUNNING":
      return RoundPhase.RUNNING;
    case "CRASHED":
      return RoundPhase.CRASHED;
    case "FINISHED":
      return RoundPhase.RESETTING;
    default:
      return RoundPhase.PREPARING;
  }
}

function normalizeStatus(value: string | undefined): BackendRoundStatus | null {
  if (!value) return null;
  if (value === "WAITING" || value === "RUNNING" || value === "CRASHED" || value === "FINISHED") {
    return value;
  }
  return STATUS_BY_EVENT[value] ?? null;
}

function nowPerf(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

export class BackendRoundStateAdapter {
  private readonly listeners = new Set<Listener>();
  private readonly connectionListeners = new Set<ConnectionListener>();
  private readonly wsClient: GameWsClient;
  private readonly debug: boolean;

  private snapshot: RoundSnapshot = { ...INITIAL_SNAPSHOT };
  private started = false;
  private documentHidden = false;
  private frameId: number | null = null;
  private roundIndexSeq = 1;
  private roundIndexes = new Map<string, number>();

  private serverTimeOffsetMs = 0;
  private backendStatus: BackendRoundStatus = "WAITING";
  private startedAtMs: number | null = null;
  private crashAtMs: number | null = null;
  private endsAtMs: number | null = null;
  private waitingEndsAtMs: number | null = null;
  private latestCrashMultiplier: number | null = null;

  private previousSample: MultiplierSample | null = null;
  private latestSample: MultiplierSample | null = null;
  private interpolationStartAt = 0;
  private interpolationDurationMs = 120;

  private resyncInFlight = false;
  private multiplierEventsSinceLog = 0;
  private multiplierRateTimer: ReturnType<typeof setInterval> | null = null;

  private hasAppliedSnapshot = false;
  private knownCurrentUserId: string | null = null;
  private pendingSelfBet: PendingSelfBet | null = null;
  private pendingSelfCashout: PendingSelfCashout | null = null;
  private pendingPlayerEvents: PendingPlayerEvent[] = [];
  private connectionState: BackendRoundConnectionState = {
    status: "connected",
    reconnectAttempt: 0,
    nextRetryAt: null,
  };

  constructor(options: BackendRoundStateAdapterOptions = {}) {
    this.debug = Boolean(options.debug);
    this.wsClient = new GameWsClient({
      wsUrl: options.wsUrl,
      snapshotPath: options.snapshotPath,
      debug: this.debug,
      callbacks: {
        onSnapshot: (incoming, reason) => {
          this.applySnapshot(incoming, reason);
        },
        onRoundState: (payload) => {
          this.applyRoundStateEvent(payload);
        },
        onMultiplierUpdate: (payload) => {
          this.applyMultiplierEvent(payload);
        },
        onOnlineCount: (payload) => {
          this.applyOnlineCountEvent(payload);
        },
        onRoundCrashed: (payload) => {
          this.applyRoundCrashedEvent(payload);
        },
        onRoundFinished: (payload) => {
          this.applyRoundFinishedEvent(payload);
        },
        onPlayerBet: (payload) => {
          this.applyPlayerBetEvent(payload);
        },
        onPlayerCashout: (payload) => {
          this.applyPlayerCashoutEvent(payload);
        },
        onSocketOpen: () => {
          this.setConnectionState({
            status: "connected",
            reconnectAttempt: 0,
            nextRetryAt: null,
          });
        },
        onSocketClosed: () => {
          this.setConnectionState({
            status: "reconnecting",
            reconnectAttempt: Math.max(1, this.connectionState.reconnectAttempt),
            nextRetryAt: this.connectionState.nextRetryAt,
          });
        },
        onReconnectScheduled: (attempt, delayMs) => {
          this.setConnectionState({
            status: "reconnecting",
            reconnectAttempt: attempt,
            nextRetryAt: Date.now() + delayMs,
          });
        },
        onWsError: (_code, message) => {
          this.debugLog(`ws error: ${message}`);
        },
      },
    });
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    this.startTicker();
    this.startMultiplierRateLogs();
    await this.wsClient.start();
  }

  destroy(): void {
    this.started = false;
    this.listeners.clear();
    this.connectionListeners.clear();
    this.wsClient.stop();

    if (this.frameId !== null) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }

    if (this.multiplierRateTimer) {
      clearInterval(this.multiplierRateTimer);
      this.multiplierRateTimer = null;
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): RoundSnapshot {
    return this.snapshot;
  }

  subscribeConnection(listener: ConnectionListener): () => void {
    this.connectionListeners.add(listener);
    listener(this.connectionState);
    return () => {
      this.connectionListeners.delete(listener);
    };
  }

  getConnectionState(): BackendRoundConnectionState {
    return this.connectionState;
  }

  setDocumentHidden(hidden: boolean): void {
    this.documentHidden = hidden;
  }

  async placeBet(rawAmount: number, currency: Currency): Promise<PlaceBetResult> {
    if (this.connectionState.status !== "connected") {
      return {
        ok: false,
        mode: null,
        message: "Нет соединения. Пытаемся переподключиться.",
        acceptedAmount: rawAmount,
        previousAmount: 0,
      };
    }
    const amount = Number.isFinite(rawAmount) ? Math.max(0, Math.round(rawAmount * 100) / 100) : 0;
    this.pendingSelfBet = {
      roundId: this.snapshot.roundId,
      amount,
      currency,
      createdAt: Date.now(),
    };
    try {
      const response = await fetch("/api/game/bet", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ amount, currency }),
      });

      const payload = (await response.json().catch(() => ({}))) as
        | BetApiSuccessPayload
        | CommandApiErrorPayload;

      if (!response.ok || !payload || payload.ok !== true) {
        const errorPayload = payload as CommandApiErrorPayload;
        const code =
          errorPayload && typeof errorPayload.error === "string"
            ? errorPayload.error
            : "BET_FAILED";
        const backendMessage =
          errorPayload && typeof errorPayload.message === "string"
            ? errorPayload.message
            : undefined;
        if (
          code === "ROUND_NOT_ACCEPTING_BETS" ||
          code === "BETTING_CLOSED" ||
          code === "DUPLICATE_BET" ||
          code === "QUEUED_BET_EXISTS" ||
          code === "ALREADY_BET" ||
          code === "NOT_WAITING" ||
          code === "ROUND_NOT_WAITING" ||
          code === "RISK_LIMIT_EXCEEDED"
        ) {
          void this.requestResync("event_resync");
        }
        this.pendingSelfBet = null;
        return {
          ok: false,
          mode: null,
          message: this.mapBetError(code, backendMessage),
          acceptedAmount: amount,
          previousAmount: 0,
        };
      }

      const acceptedAmount = toNumber(payload.bet?.betAmount) ?? amount;
      const mode = payload.bet?.mode === "queued" ? "queued" : "active";
      if (mode === "active") {
        this.pendingSelfBet = {
          roundId: payload.bet?.roundId ?? this.snapshot.roundId,
          amount: acceptedAmount,
          currency: payload.bet?.currency ?? currency,
          createdAt: Date.now(),
        };
      } else {
        this.pendingSelfBet = null;
      }
      await this.requestResync("event_resync");

      return {
        ok: true,
        mode,
        message: mode === "queued" ? "Bet queued for next round" : "Bet placed",
        acceptedAmount,
        previousAmount: 0,
      };
    } catch {
      this.pendingSelfBet = null;
      return {
        ok: false,
        mode: null,
        message: "Network error while placing bet",
        acceptedAmount: amount,
        previousAmount: 0,
      };
    } finally {
      if (this.pendingSelfBet && Date.now() - this.pendingSelfBet.createdAt > SELF_EVENT_MATCH_WINDOW_MS) {
        this.pendingSelfBet = null;
      }
    }
  }

  async cashOut(): Promise<CashOutResult> {
    const fallbackCurrency = this.snapshot.userActiveBet?.currency ?? "TON";
    if (this.connectionState.status !== "connected") {
      return {
        ok: false,
        message: "Нет соединения. Пытаемся переподключиться.",
        multiplier: 0,
        payout: 0,
        currency: fallbackCurrency,
      };
    }
    this.pendingSelfCashout = {
      roundId: this.snapshot.roundId,
      createdAt: Date.now(),
    };
    try {
      const response = await fetch("/api/game/cashout", {
        method: "POST",
        credentials: "include",
        headers: { Accept: "application/json" },
      });

      const payload = (await response.json().catch(() => ({}))) as
        | CashoutApiSuccessPayload
        | CommandApiErrorPayload;

      if (!response.ok || !payload || payload.ok !== true) {
        const errorPayload = payload as CommandApiErrorPayload;
        const code =
          errorPayload && typeof errorPayload.error === "string"
            ? errorPayload.error
            : "CASHOUT_FAILED";
        const backendMessage =
          errorPayload && typeof errorPayload.message === "string"
            ? errorPayload.message
            : undefined;
        if (
          code === "ROUND_NOT_RUNNING" ||
          code === "NOT_RUNNING" ||
          code === "ALREADY_CASHED_OUT" ||
          code === "BET_NOT_FOUND" ||
          code === "CASHOUT_CLOSED" ||
          code === "HOUSE_INSUFFICIENT_BANKROLL"
        ) {
          void this.requestResync("event_resync");
        }
        this.pendingSelfCashout = null;
        return {
          ok: false,
          message: this.mapCashoutError(code, backendMessage),
          multiplier: 0,
          payout: 0,
          currency: fallbackCurrency,
        };
      }

      const payout = toNumber(payload.cashout?.payout) ?? 0;
      const multiplier = toNumber(payload.cashout?.multiplier) ?? 0;
      const currency = payload.cashout?.currency ?? fallbackCurrency;
      await this.requestResync("event_resync");
      this.pendingSelfCashout = null;

      return {
        ok: true,
        message: "Cashout completed",
        multiplier,
        payout,
        currency,
      };
    } catch {
      this.pendingSelfCashout = null;
      return {
        ok: false,
        message: "Network error while cashing out",
        multiplier: 0,
        payout: 0,
        currency: fallbackCurrency,
      };
    } finally {
      if (
        this.pendingSelfCashout &&
        this.pendingSelfCashout.roundId !== this.snapshot.roundId
      ) {
        this.pendingSelfCashout = null;
      }
    }
  }

  async refreshFromServer(reason: SnapshotSyncReason = "event_resync"): Promise<void> {
    await this.requestResync(reason);
  }

  private applySnapshot(incoming: CurrentRoundSnapshotResponse, reason: SnapshotSyncReason): void {
    const roundIndex = this.getRoundIndex(incoming.roundId);
    this.serverTimeOffsetMs = incoming.serverTime - Date.now();

    this.backendStatus = incoming.status;
    this.startedAtMs = incoming.startedAt;
    this.crashAtMs = incoming.crashAt;
    this.endsAtMs = incoming.endsAt;
    this.waitingEndsAtMs = incoming.waitingEndsAt;
    this.latestCrashMultiplier = incoming.crashMultiplier;

    this.setMultiplierSample(incoming.currentMultiplier, incoming.serverTime, true);

    const mappedPlayers = incoming.players.map((entry) => mapBackendPlayerToView(entry));
    const queuedBet = incoming.queuedBet
      ? {
          id: incoming.queuedBet.id,
          userId: incoming.queuedBet.userId,
          username: incoming.queuedBet.displayName,
          amount: incoming.queuedBet.amount,
          currency: incoming.queuedBet.currency,
          status: "QUEUED" as const,
          isCurrentUser: true,
          visibleToCurrentUserOnly: incoming.queuedBet.visibleToCurrentUserOnly,
          placedAt: incoming.queuedBet.placedAt,
          cashoutMultiplier: null,
          payout: null,
          autoCashoutAt: null,
        }
      : null;
    const userActiveBet =
      mappedPlayers.find((entry) => entry.isCurrentUser && entry.status === "ACTIVE") ?? null;
    const currentUserFromSnapshot =
      incoming.myBet?.userId ??
      incoming.queuedBet?.userId ??
      mappedPlayers.find((entry) => entry.isCurrentUser)?.userId ??
      null;
    if (currentUserFromSnapshot) {
      this.knownCurrentUserId = currentUserFromSnapshot;
    }
    const countdown = this.computeCountdown();
    const runningElapsedMs = this.computeRunningElapsedMs();

    this.snapshot = {
      phase: statusToPhase(incoming.status),
      roundId: incoming.roundId,
      roundIndex,
      onlineCount:
        typeof incoming.onlineCount === "number" && Number.isFinite(incoming.onlineCount)
          ? Math.max(0, Math.floor(incoming.onlineCount))
          : this.snapshot.onlineCount,
      coefficient: this.computeSmoothedMultiplier(nowPerf()),
      crashAt:
        incoming.crashMultiplier !== null
          ? incoming.crashMultiplier
          : Math.max(1, incoming.currentMultiplier),
      countdown,
      runningElapsedMs,
      phaseElapsedMs: runningElapsedMs,
      history: incoming.history,
      fairness: {
        serverSeedHash: incoming.fairness.serverSeedHash,
        serverSeed: incoming.fairness.serverSeed,
        fairnessVersion: incoming.fairness.fairnessVersion,
        fairnessNonce: incoming.fairness.fairnessNonce,
      },
      players: mappedPlayers,
      queuedBet,
      userActiveBet,
      canPlaceBet: incoming.canPlaceBet,
      canCashOut: incoming.canCashOut,
    };

    this.debugLog(
      `snapshot applied (${reason}) roundId=${incoming.roundId} status=${incoming.status} multiplier=${incoming.currentMultiplier.toFixed(4)}`,
    );
    this.hasAppliedSnapshot = true;
    this.flushPendingPlayerEvents();
    this.emitSnapshot();
  }

  private applyRoundStateEvent(payload: GameWsRoundStatePayload): void {
    const eventStatus = normalizeStatus(payload.status ?? payload.state ?? payload.eventType);
    if (!eventStatus) return;

    const roundId = payload.roundId;
    const roundChanged = this.snapshot.roundId !== roundId;
    if (roundChanged) {
      this.getRoundIndex(roundId);
    }

    this.backendStatus = eventStatus;
    if (typeof payload.serverTime === "number") {
      this.serverTimeOffsetMs = payload.serverTime - Date.now();
    }

    this.startedAtMs = payload.startedAt ?? this.startedAtMs;
    this.crashAtMs = payload.crashAt ?? this.crashAtMs;
    this.endsAtMs = payload.endsAt ?? this.endsAtMs;
    this.waitingEndsAtMs = payload.waitingEndsAt ?? this.waitingEndsAtMs;
    this.latestCrashMultiplier =
      payload.crashMultiplier !== undefined ? payload.crashMultiplier : this.latestCrashMultiplier;

    if (typeof payload.currentMultiplier === "number") {
      this.setMultiplierSample(
        payload.currentMultiplier,
        payload.serverTime ?? this.currentServerTime(),
        true,
      );
    }

    const phase = statusToPhase(eventStatus);
    const nextCountdown = this.computeCountdown();
    const nextElapsedMs = this.computeRunningElapsedMs();
    const nextCoefficient =
      eventStatus === "RUNNING"
        ? this.computeSmoothedMultiplier(nowPerf())
        : this.latestCrashMultiplier ?? this.snapshot.coefficient;
    const crashAt =
      this.latestCrashMultiplier ??
      payload.crashMultiplier ??
      (phase === RoundPhase.CRASHED || phase === RoundPhase.RESETTING
        ? Math.max(1, nextCoefficient)
        : this.snapshot.crashAt);
    const onlineCountFromPayload =
      typeof payload.onlineCount === "number" && Number.isFinite(payload.onlineCount)
        ? Math.max(0, Math.floor(payload.onlineCount))
        : undefined;
    const carryQueuedBetIntoRunning =
      roundChanged &&
      eventStatus === "RUNNING" &&
      this.snapshot.queuedBet?.isCurrentUser === true &&
      this.snapshot.userActiveBet === null;
    const queuedBetToActivate = carryQueuedBetIntoRunning ? this.snapshot.queuedBet : null;
    const transitionActiveBet = queuedBetToActivate
      ? {
          ...queuedBetToActivate,
          id: `queued:${roundId}:${queuedBetToActivate.userId}`,
          status: "ACTIVE" as const,
          placedAt: Date.now(),
        }
      : null;
    if (transitionActiveBet) {
      this.knownCurrentUserId = transitionActiveBet.userId;
    }
    const nextPlayers = roundChanged
      ? transitionActiveBet
        ? [transitionActiveBet]
        : []
      : this.snapshot.players;
    const nextQueuedBet = roundChanged ? null : this.snapshot.queuedBet;
    const nextUserActiveBet = roundChanged
      ? transitionActiveBet
      : this.snapshot.userActiveBet;

    this.snapshot = {
      ...this.snapshot,
      phase,
      roundId,
      roundIndex: this.getRoundIndex(roundId),
      onlineCount: onlineCountFromPayload ?? (roundChanged ? 0 : this.snapshot.onlineCount),
      coefficient: nextCoefficient,
      crashAt,
      countdown: nextCountdown,
      runningElapsedMs: nextElapsedMs,
      phaseElapsedMs: nextElapsedMs,
      fairness: mergeFairnessState(this.snapshot.fairness, payload),
      players: nextPlayers,
      queuedBet: nextQueuedBet,
      userActiveBet: nextUserActiveBet,
      canPlaceBet: eventStatus === "WAITING",
      canCashOut: eventStatus === "RUNNING" && nextUserActiveBet?.status === "ACTIVE",
    };

    this.emitSnapshot();
    void this.requestResync("event_resync");
  }

  private applyMultiplierEvent(payload: GameWsMultiplierPayload): void {
    if (!this.started) return;
    if (payload.roundId !== this.snapshot.roundId) {
      void this.requestResync("event_resync");
      return;
    }

    this.backendStatus = "RUNNING";
    const serverTs = payload.serverTs ?? this.currentServerTime();
    if (typeof payload.serverTs === "number" && Number.isFinite(payload.serverTs)) {
      this.serverTimeOffsetMs = payload.serverTs - Date.now();
    }
    this.setMultiplierSample(payload.multiplier, serverTs, false);
    this.multiplierEventsSinceLog += 1;
  }

  private applyOnlineCountEvent(payload: GameWsOnlineCountPayload): void {
    if (!this.started) return;
    if (payload.roundId !== this.snapshot.roundId) return;
    const nextOnlineCount =
      typeof payload.onlineCount === "number" && Number.isFinite(payload.onlineCount)
        ? Math.max(0, Math.floor(payload.onlineCount))
        : this.snapshot.onlineCount;
    if (nextOnlineCount === this.snapshot.onlineCount) return;
    this.snapshot = {
      ...this.snapshot,
      onlineCount: nextOnlineCount,
    };
    this.emitSnapshot();
  }

  private applyRoundCrashedEvent(payload: Record<string, unknown>): void {
    const roundId = typeof payload.roundId === "string" ? payload.roundId : this.snapshot.roundId;
    const crashMultiplier = toNumber(payload.crashMultiplier) ?? this.latestSample?.value ?? this.snapshot.coefficient;
    const crashAt = toNumber(payload.crashAt);
    const endsAt = toNumber(payload.endsAt);
    const serverTime = toNumber(payload.serverTime) ?? Date.now();

    this.backendStatus = "CRASHED";
    this.serverTimeOffsetMs = serverTime - Date.now();
    this.latestCrashMultiplier = crashMultiplier;
    this.crashAtMs = crashAt ?? this.crashAtMs;
    this.endsAtMs = endsAt ?? this.endsAtMs;
    this.waitingEndsAtMs = null;

    this.setMultiplierSample(crashMultiplier, serverTime, true);

    this.snapshot = {
      ...this.snapshot,
      roundId,
      roundIndex: this.getRoundIndex(roundId),
      phase: RoundPhase.CRASHED,
      coefficient: crashMultiplier,
      crashAt: crashMultiplier,
      fairness: mergeFairnessState(this.snapshot.fairness, payload),
      canPlaceBet: false,
      canCashOut: false,
    };

    this.emitSnapshot();
    void this.requestResync("event_resync");
  }

  private applyRoundFinishedEvent(payload: Record<string, unknown>): void {
    const roundId = typeof payload.roundId === "string" ? payload.roundId : this.snapshot.roundId;
    const serverTime = toNumber(payload.serverTime) ?? Date.now();
    const finishedAt = toNumber(payload.finishedAt);

    this.backendStatus = "FINISHED";
    this.serverTimeOffsetMs = serverTime - Date.now();
    this.endsAtMs = finishedAt ?? this.endsAtMs;
    this.waitingEndsAtMs = null;

    this.snapshot = {
      ...this.snapshot,
      roundId,
      roundIndex: this.getRoundIndex(roundId),
      phase: RoundPhase.RESETTING,
      fairness: mergeFairnessState(this.snapshot.fairness, payload),
      canPlaceBet: false,
      canCashOut: false,
    };

    this.emitSnapshot();
    void this.requestResync("event_resync");
  }

  private applyPlayerBetEvent(payload: GameWsPlayerBetPayload): void {
    if (!this.started) return;

    if (!this.hasAppliedSnapshot) {
      this.enqueuePendingPlayerEvent({ type: "player_bet", payload });
      return;
    }

    const roundId = typeof payload.roundId === "string" ? payload.roundId : null;
    if (!roundId) {
      void this.requestResync("event_resync");
      return;
    }
    if (roundId !== this.snapshot.roundId) {
      void this.requestResync("event_resync");
      return;
    }

    const payloadRecord = payload as Record<string, unknown>;
    const nestedPlayer = isRecord(payload.player) ? payload.player : null;
    const userId = toOptionalString(payload.userId) ?? toOptionalString(nestedPlayer?.userId) ?? null;
    const amount = toNumber(
      payload.betAmount ?? payload.amount ?? nestedPlayer?.betAmount ?? nestedPlayer?.amount,
    );
    const currency = normalizeCurrency(payload.currency ?? nestedPlayer?.currency);
    const explicitCurrentUser =
      payload.isCurrentUser === true ||
      (nestedPlayer ? nestedPlayer.isCurrentUser === true : false);
    const isCurrentUser = this.resolveIsCurrentUserForBet({
      roundId,
      userId,
      amount,
      currency,
      explicitCurrentUser,
    });

    const existingPlayer = this.findPlayerByIdentity(userId);
    if (!existingPlayer && !isCurrentUser && !userId) {
      void this.requestResync("event_resync");
      return;
    }

    const nextAmount = amount ?? existingPlayer?.amount ?? 0;
    if (!Number.isFinite(nextAmount) || nextAmount <= 0) {
      void this.requestResync("event_resync");
      return;
    }

    const resolvedUserId =
      userId ??
      existingPlayer?.userId ??
      (isCurrentUser ? this.knownCurrentUserId : null);
    if (!resolvedUserId) {
      void this.requestResync("event_resync");
      return;
    }

    const publicProfile = resolveEventPublicProfile({
      payload: payloadRecord,
      fallbackUserId: resolvedUserId,
      existingPlayer,
    });
    const username = publicProfile.displayName;
    const placedAt =
      normalizeTimestamp(payload.placedAt ?? nestedPlayer?.placedAt) ??
      existingPlayer?.placedAt ??
      Date.now();
    const nextPlayer: PlayerBetView = {
      id: existingPlayer?.id ?? `ws:${roundId}:${resolvedUserId}`,
      userId: resolvedUserId,
      username,
      amount: nextAmount,
      currency: currency ?? existingPlayer?.currency ?? "TON",
      status: "ACTIVE",
      isCurrentUser: isCurrentUser || existingPlayer?.isCurrentUser === true,
      visibleToCurrentUserOnly: publicProfile.visibleToCurrentUserOnly,
      placedAt,
      cashoutMultiplier: null,
      payout: null,
      autoCashoutAt: null,
    };

    if (nextPlayer.isCurrentUser) {
      this.knownCurrentUserId = nextPlayer.userId;
      this.pendingSelfBet = null;
    }

    const nextPlayers = this.upsertPlayer(nextPlayer);
    const nextUserActiveBet = nextPlayers.find(
      (entry) => entry.isCurrentUser && entry.status === "ACTIVE",
    ) ?? null;
    const nextCanPlaceBet =
      nextUserActiveBet && nextUserActiveBet.userId === nextPlayer.userId
        ? false
        : this.snapshot.canPlaceBet;
    const nextCanCashOut =
      this.snapshot.phase === RoundPhase.RUNNING && Boolean(nextUserActiveBet);

    const playersChanged = !arePlayerListsEquivalent(this.snapshot.players, nextPlayers);
    const userBetChanged = !this.areOptionalPlayersEquivalent(this.snapshot.userActiveBet, nextUserActiveBet);
    if (!playersChanged && !userBetChanged && nextCanPlaceBet === this.snapshot.canPlaceBet && nextCanCashOut === this.snapshot.canCashOut) {
      return;
    }

    this.snapshot = {
      ...this.snapshot,
      players: nextPlayers,
      userActiveBet: nextUserActiveBet,
      canPlaceBet: nextCanPlaceBet,
      canCashOut: nextCanCashOut,
    };

    this.emitSnapshot();
  }

  private applyPlayerCashoutEvent(payload: GameWsPlayerCashoutPayload): void {
    if (!this.started) return;

    if (!this.hasAppliedSnapshot) {
      this.enqueuePendingPlayerEvent({ type: "player_cashout", payload });
      return;
    }

    const payloadRecord = payload as Record<string, unknown>;
    const nestedPlayer = isRecord(payload.player) ? payload.player : null;
    const roundId =
      (typeof payload.roundId === "string" ? payload.roundId : null) ??
      (nestedPlayer && typeof nestedPlayer.roundId === "string" ? nestedPlayer.roundId : null);
    if (!roundId) {
      void this.requestResync("event_resync");
      return;
    }
    if (roundId !== this.snapshot.roundId) {
      void this.requestResync("event_resync");
      return;
    }

    const userId =
      toOptionalString(payload.userId) ??
      toOptionalString(nestedPlayer?.userId) ??
      null;
    const explicitCurrentUser =
      payload.isCurrentUser === true ||
      (nestedPlayer ? nestedPlayer.isCurrentUser === true : false);
    const isCurrentUser = this.resolveIsCurrentUserForCashout({
      roundId,
      userId,
      explicitCurrentUser,
    });

    const existingPlayer = this.findPlayerByIdentity(userId);
    const resolvedUserId =
      userId ??
      existingPlayer?.userId ??
      (isCurrentUser ? this.knownCurrentUserId : null);
    const fallbackAmount = toNumber(
      payload.betAmount ?? payload.amount ?? nestedPlayer?.betAmount ?? nestedPlayer?.amount,
    );
    const fallbackCurrency = normalizeCurrency(payload.currency ?? nestedPlayer?.currency);
    const fallbackPlacedAt = normalizeTimestamp(payload.placedAt ?? nestedPlayer?.placedAt);
    const publicProfile = resolveEventPublicProfile({
      payload: payloadRecord,
      fallbackUserId: resolvedUserId ?? `unknown-${roundId.slice(0, 6)}`,
      existingPlayer,
    });

    const synthesizedBasePlayer: PlayerBetView | null =
      resolvedUserId &&
      fallbackAmount !== null &&
      fallbackAmount > 0 &&
      fallbackCurrency !== null
        ? {
            id: `ws:${roundId}:${resolvedUserId}`,
            userId: resolvedUserId,
            username: publicProfile.displayName,
            amount: fallbackAmount,
            currency: fallbackCurrency,
            status: "ACTIVE",
            isCurrentUser: isCurrentUser,
            visibleToCurrentUserOnly: publicProfile.visibleToCurrentUserOnly,
            placedAt: fallbackPlacedAt ?? Date.now(),
            cashoutMultiplier: null,
            payout: null,
            autoCashoutAt: null,
          }
        : null;

    const basePlayer =
      existingPlayer ??
      (isCurrentUser ? this.snapshot.userActiveBet : null) ??
      synthesizedBasePlayer;
    if (!basePlayer) {
      void this.requestResync("event_resync");
      return;
    }

    const amount = fallbackAmount ?? basePlayer.amount;
    const currency = fallbackCurrency ?? basePlayer.currency;

    const rawMultiplier = toNumber(payload.multiplier ?? nestedPlayer?.cashoutMultiplier);
    const rawProfit = toNumber(payload.profit ?? nestedPlayer?.profit);
    let payout = toNumber(payload.payout ?? nestedPlayer?.payout);
    if (payout === null && rawProfit !== null) {
      payout = amount + rawProfit;
    }
    if (payout === null && rawMultiplier !== null) {
      payout = amount * rawMultiplier;
    }

    const cashoutMultiplier =
      rawMultiplier ??
      (payout !== null && amount > 0 ? payout / amount : basePlayer.cashoutMultiplier);
    const roundedMultiplier =
      cashoutMultiplier !== null ? Number(cashoutMultiplier.toFixed(4)) : null;
    const roundedPayout = payout !== null ? Number(payout.toFixed(2)) : basePlayer.payout;

    const nextPlayer: PlayerBetView = {
      ...basePlayer,
      id:
        basePlayer.id ??
        (nestedPlayer && typeof nestedPlayer.id === "string"
          ? nestedPlayer.id
          : `ws:${roundId}:${basePlayer.userId}`),
      userId: resolvedUserId ?? basePlayer.userId,
      username: publicProfile.displayName,
      amount,
      currency,
      status: "CASHED_OUT",
      isCurrentUser: isCurrentUser || basePlayer.isCurrentUser,
      visibleToCurrentUserOnly: publicProfile.visibleToCurrentUserOnly,
      cashoutMultiplier: roundedMultiplier,
      payout: roundedPayout,
      autoCashoutAt: null,
    };

    if (nextPlayer.isCurrentUser) {
      this.knownCurrentUserId = nextPlayer.userId;
      this.pendingSelfCashout = null;
    }

    const nextPlayers = this.upsertPlayer(nextPlayer);
    const shouldClearCurrentUserBet =
      nextPlayer.isCurrentUser ||
      (this.snapshot.userActiveBet !== null &&
        this.snapshot.userActiveBet.userId === nextPlayer.userId);
    const nextUserActiveBet = shouldClearCurrentUserBet ? null : this.snapshot.userActiveBet;
    const nextCanCashOut = shouldClearCurrentUserBet ? false : this.snapshot.canCashOut;

    const playersChanged = !arePlayerListsEquivalent(this.snapshot.players, nextPlayers);
    const userBetChanged = !this.areOptionalPlayersEquivalent(this.snapshot.userActiveBet, nextUserActiveBet);
    if (!playersChanged && !userBetChanged && nextCanCashOut === this.snapshot.canCashOut) {
      return;
    }

    this.snapshot = {
      ...this.snapshot,
      players: nextPlayers,
      userActiveBet: nextUserActiveBet,
      canCashOut: nextCanCashOut,
    };

    this.emitSnapshot();
  }

  private resolveIsCurrentUserForBet(args: {
    roundId: string;
    userId: string | null;
    amount: number | null;
    currency: Currency | null;
    explicitCurrentUser: boolean;
  }): boolean {
    if (args.explicitCurrentUser) return true;
    if (args.userId && this.knownCurrentUserId && args.userId === this.knownCurrentUserId) {
      return true;
    }

    if (!this.pendingSelfBet) return false;
    const ageMs = Date.now() - this.pendingSelfBet.createdAt;
    if (ageMs > SELF_EVENT_MATCH_WINDOW_MS) {
      this.pendingSelfBet = null;
      return false;
    }

    if (this.pendingSelfBet.roundId !== args.roundId) return false;
    if (args.userId === null && args.amount === null) return false;
    if (args.currency && this.pendingSelfBet.currency !== args.currency) return false;
    if (args.amount !== null && Math.abs(this.pendingSelfBet.amount - args.amount) > 0.000001) {
      return false;
    }

    if (args.userId) {
      this.knownCurrentUserId = args.userId;
    }
    return true;
  }

  private resolveIsCurrentUserForCashout(args: {
    roundId: string;
    userId: string | null;
    explicitCurrentUser: boolean;
  }): boolean {
    if (args.explicitCurrentUser) return true;
    if (args.userId && this.knownCurrentUserId && args.userId === this.knownCurrentUserId) {
      return true;
    }
    if (!this.pendingSelfCashout) return false;
    const ageMs = Date.now() - this.pendingSelfCashout.createdAt;
    if (ageMs > SELF_EVENT_MATCH_WINDOW_MS) {
      this.pendingSelfCashout = null;
      return false;
    }
    if (args.userId && !this.knownCurrentUserId) return false;
    if (args.userId && this.knownCurrentUserId && args.userId !== this.knownCurrentUserId) {
      return false;
    }
    if (this.pendingSelfCashout.roundId === args.roundId) {
      if (args.userId) {
        this.knownCurrentUserId = args.userId;
      }
      return true;
    }
    return false;
  }

  private enqueuePendingPlayerEvent(event: PendingPlayerEvent): void {
    this.pendingPlayerEvents.push(event);
    if (this.pendingPlayerEvents.length > PENDING_PLAYER_EVENT_LIMIT) {
      this.pendingPlayerEvents.shift();
    }
  }

  private flushPendingPlayerEvents(): void {
    if (!this.hasAppliedSnapshot || this.pendingPlayerEvents.length === 0) return;
    const queued = [...this.pendingPlayerEvents];
    this.pendingPlayerEvents = [];
    for (const event of queued) {
      if (event.type === "player_bet") {
        this.applyPlayerBetEvent(event.payload);
      } else {
        this.applyPlayerCashoutEvent(event.payload);
      }
    }
  }

  private findPlayerByIdentity(userId: string | null): PlayerBetView | null {
    if (!userId) return null;
    return this.snapshot.players.find((entry) => entry.userId === userId) ?? null;
  }

  private upsertPlayer(nextPlayer: PlayerBetView): PlayerBetView[] {
    const withoutPlayer = this.snapshot.players.filter(
      (entry) => entry.userId !== nextPlayer.userId && entry.id !== nextPlayer.id,
    );
    return normalizePlayersList([...withoutPlayer, nextPlayer]);
  }

  private areOptionalPlayersEquivalent(a: PlayerBetView | null, b: PlayerBetView | null): boolean {
    if (a === b) return true;
    if (!a || !b) return false;
    return arePlayersEquivalent(a, b);
  }

  private async requestResync(reason: SnapshotSyncReason): Promise<void> {
    if (this.resyncInFlight) return;
    this.resyncInFlight = true;
    try {
      await this.wsClient.refreshSnapshot(reason);
    } finally {
      this.resyncInFlight = false;
    }
  }

  private setMultiplierSample(multiplier: number, serverTs: number, forceSnap: boolean): void {
    const sample: MultiplierSample = {
      value: Math.max(1, multiplier),
      serverTs,
      receivedAt: nowPerf(),
    };

    if (!this.latestSample || forceSnap) {
      this.previousSample = sample;
      this.latestSample = sample;
      this.interpolationStartAt = sample.receivedAt;
      this.interpolationDurationMs = 120;
      return;
    }

    const prev = this.latestSample;
    this.previousSample = prev;
    this.latestSample = sample;
    this.interpolationStartAt = sample.receivedAt;

    const serverDelta = sample.serverTs - prev.serverTs;
    this.interpolationDurationMs = clamp(Number.isFinite(serverDelta) ? serverDelta : 120, 50, 260);
  }

  private computeSmoothedMultiplier(currentPerfTs: number): number {
    const estimatedGrowthRate = this.estimateRoundGrowthRate();
    if (this.startedAtMs !== null && estimatedGrowthRate !== null) {
      const liveElapsedSeconds = Math.max(0, (this.currentServerTime() - this.startedAtMs) / 1000);
      const computed = computeExponentialMultiplier(liveElapsedSeconds, estimatedGrowthRate);
      const floor = this.latestSample?.value ?? this.snapshot.coefficient;
      return Math.max(floor, computed);
    }

    if (!this.latestSample) return this.snapshot.coefficient;
    if (!this.previousSample) return this.latestSample.value;
    if (this.interpolationDurationMs <= 0) return this.latestSample.value;

    const progress = clamp(
      (currentPerfTs - this.interpolationStartAt) / this.interpolationDurationMs,
      0,
      1,
    );
    const start = this.previousSample.value;
    const end = this.latestSample.value;
    const raw = start + (end - start) * progress;

    if (end >= start) {
      return clamp(raw, start, end);
    }
    return clamp(raw, end, start);
  }

  private estimateRoundGrowthRate(): number | null {
    if (this.startedAtMs === null || !this.latestSample) return null;

    const elapsedMs = this.latestSample.serverTs - this.startedAtMs;
    if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return null;

    const latestValue = this.latestSample.value;
    if (!Number.isFinite(latestValue) || latestValue <= 1) return null;

    const estimated = Math.log(latestValue) / (elapsedMs / 1000);
    if (!Number.isFinite(estimated) || estimated <= 0) return null;

    return estimated;
  }

  private computeCountdown(): number {
    if (this.backendStatus !== "WAITING" || this.waitingEndsAtMs === null) return 0;
    const remainingMs = Math.max(0, this.waitingEndsAtMs - this.currentServerTime());
    return Math.ceil(remainingMs / 1000);
  }

  private computeRunningElapsedMs(): number {
    if (this.startedAtMs === null) return 0;
    if (this.backendStatus !== "RUNNING") return 0;
    return Math.max(0, this.currentServerTime() - this.startedAtMs);
  }

  private currentServerTime(): number {
    return Date.now() + this.serverTimeOffsetMs;
  }

  private getRoundIndex(roundId: string): number {
    const existing = this.roundIndexes.get(roundId);
    if (existing !== undefined) return existing;
    const next = this.roundIndexSeq++;
    this.roundIndexes.set(roundId, next);
    return next;
  }

  private emitSnapshot(): void {
    for (const listener of this.listeners) {
      listener(this.snapshot);
    }
  }

  private emitConnectionState(): void {
    for (const listener of this.connectionListeners) {
      listener(this.connectionState);
    }
  }

  private setConnectionState(next: BackendRoundConnectionState): void {
    if (
      this.connectionState.status === next.status &&
      this.connectionState.reconnectAttempt === next.reconnectAttempt &&
      this.connectionState.nextRetryAt === next.nextRetryAt
    ) {
      return;
    }
    this.connectionState = next;
    this.emitConnectionState();
  }

  private startTicker(): void {
    const tick = () => {
      if (!this.started) return;
      if (this.connectionState.status !== "connected") {
        this.frameId = requestAnimationFrame(tick);
        return;
      }

      let changed = false;
      const currentPerfTs = nowPerf();
      const nextCountdown = this.computeCountdown();
      const nextRunningElapsedMs = this.computeRunningElapsedMs();

      if (nextCountdown !== this.snapshot.countdown) {
        this.snapshot = { ...this.snapshot, countdown: nextCountdown };
        changed = true;
      }

      if (nextRunningElapsedMs !== this.snapshot.runningElapsedMs) {
        this.snapshot = {
          ...this.snapshot,
          runningElapsedMs: nextRunningElapsedMs,
          phaseElapsedMs: nextRunningElapsedMs,
        };
        changed = true;
      }

      if (this.backendStatus === "RUNNING") {
        const nextCoeff = this.computeSmoothedMultiplier(currentPerfTs);
        if (Math.abs(nextCoeff - this.snapshot.coefficient) > 0.0001) {
          this.snapshot = { ...this.snapshot, coefficient: nextCoeff };
          changed = true;
        }
      } else if (
        (this.backendStatus === "CRASHED" || this.backendStatus === "FINISHED") &&
        this.latestCrashMultiplier !== null &&
        Math.abs(this.snapshot.coefficient - this.latestCrashMultiplier) > 0.0001
      ) {
        this.snapshot = {
          ...this.snapshot,
          coefficient: this.latestCrashMultiplier,
          crashAt: this.latestCrashMultiplier,
        };
        changed = true;
      }

      if (changed) {
        this.emitSnapshot();
      }

      this.frameId = requestAnimationFrame(tick);
    };

    this.frameId = requestAnimationFrame(tick);
  }

  private startMultiplierRateLogs(): void {
    if (!this.debug || this.multiplierRateTimer) return;
    this.multiplierRateTimer = setInterval(() => {
      this.debugLog(`multiplier updates: ${this.multiplierEventsSinceLog}/2s`);
      this.multiplierEventsSinceLog = 0;
    }, 2000);
  }

  private debugLog(message: string): void {
    if (!this.debug) return;
    console.debug(`[BackendRoundStateAdapter] ${message}`);
  }

  private mapRiskLimitMessage(backendMessage?: string): string {
    const normalized = (backendMessage ?? "").toLowerCase();

    if (
      normalized.includes("per-bet risk cap exceeded") ||
      normalized.includes("queued per-bet risk cap exceeded")
    ) {
      return "Ставка слишком большая для текущих лимитов. Уменьшите сумму.";
    }

    if (
      normalized.includes("round exposure cap exceeded") ||
      normalized.includes("queued round exposure cap exceeded")
    ) {
      return "Лимит нагрузки на раунд достигнут. Попробуйте чуть позже.";
    }

    if (normalized.includes("queue risk buffer depleted")) {
      return "Ставка на следующий раунд временно недоступна. Попробуйте позже.";
    }

    if (
      normalized.includes("risk-active state") ||
      normalized.includes("not running for queue acceptance")
    ) {
      return "Раунд сейчас не принимает эту ставку.";
    }

    return "Ставка отклонена по лимиту риска. Уменьшите сумму или подождите.";
  }

  private mapBetError(code: string, backendMessage?: string): string {
    switch (code) {
      case "RISK_LIMIT_EXCEEDED":
        return this.mapRiskLimitMessage(backendMessage);
      case "ROUND_NOT_ACCEPTING_BETS":
      case "BETTING_CLOSED":
      case "ROUND_NOT_WAITING":
      case "NOT_WAITING":
        return "Раунд сейчас не принимает ставки";
      case "DUPLICATE_BET":
      case "ALREADY_BET":
        return "Вы уже поставили ставку на этот раунд";
      case "QUEUED_BET_EXISTS":
        return "У вас уже есть ставка на следующий раунд";
      case "INSUFFICIENT_BALANCE":
        return "Недостаточно средств";
      case "INVALID_BET_AMOUNT":
      case "INVALID_INPUT":
        return "Некорректная сумма ставки";
      case "SERVER_ERROR":
        return backendMessage ?? "Ошибка сервера при размещении ставки";
      case "UNAUTHORIZED":
        return "Требуется авторизация";
      default:
        return backendMessage ?? "Не удалось поставить ставку";
    }
  }

  private mapCashoutError(code: string, backendMessage?: string): string {
    switch (code) {
      case "HOUSE_INSUFFICIENT_BANKROLL":
        return backendMessage ?? "House bankroll is currently insufficient";
      case "ROUND_NOT_RUNNING":
      case "NOT_RUNNING":
      case "CASHOUT_CLOSED":
        return "Round is not running";
      case "ALREADY_CASHED_OUT":
        return "Bet already cashed out";
      case "BET_NOT_FOUND":
        return "Active bet not found";
      case "SERVER_ERROR":
        return backendMessage ?? "Server error while cashing out";
      case "UNAUTHORIZED":
        return "Authorization required";
      default:
        return backendMessage ?? "Cashout failed";
    }
  }
}
