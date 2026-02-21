"use client";

import { z } from "zod";
import type { BackendRoundPlayerState, CurrentRoundSnapshotResponse } from "@/lib/game/backend-round-types";
import { buildPublicPlayerProfile } from "@/lib/game/public-player";

const BACKEND_STATUS_SCHEMA = z.enum(["WAITING", "RUNNING", "CRASHED", "FINISHED"]);

const SNAPSHOT_PLAYER_SCHEMA = z
  .object({
    id: z.string(),
    userId: z.string(),
    displayName: z.string().optional(),
    username: z.string().nullable().optional(),
    isHidden: z.boolean().optional(),
    visibleToCurrentUserOnly: z.boolean().optional(),
    avatarUrl: z.string().nullable().optional(),
    amount: z.number().finite(),
    currency: z.enum(["TON", "STARS"]),
    status: z.enum(["ACTIVE", "CASHED_OUT", "LOST"]),
    isCurrentUser: z.boolean(),
    placedAt: z.number().finite(),
    cashoutMultiplier: z.number().nullable(),
    payout: z.number().nullable(),
    autoCashoutAt: z.number().nullable(),
  })
  .passthrough();

const SNAPSHOT_SCHEMA = z.object({
  version: z.literal(1),
  serverTime: z.number().finite(),
  roundId: z.string().min(1),
  status: BACKEND_STATUS_SCHEMA,
  onlineCount: z.number().int().nonnegative().optional(),
  currentMultiplier: z.number().finite(),
  startedAt: z.number().nullable(),
  crashAt: z.number().nullable(),
  endsAt: z.number().nullable(),
  waitingEndsAt: z.number().nullable(),
  crashMultiplier: z.number().nullable(),
  fairness: z.object({
    serverSeedHash: z.string(),
    fairnessVersion: z.string(),
    fairnessNonce: z.number().finite(),
    clientSeed: z.string().nullable(),
    effectiveClientSeed: z.string(),
    serverSeed: z.string().nullable(),
    houseEdge: z.number().finite().optional().default(0.01),
    maxCrash: z.number().finite().optional().default(1000),
  }),
  players: z.array(SNAPSHOT_PLAYER_SCHEMA),
  queuedBet: z
    .object({
      id: z.string(),
      userId: z.string(),
      displayName: z.string().optional(),
      username: z.string().nullable().optional(),
      isHidden: z.boolean().optional(),
      visibleToCurrentUserOnly: z.boolean().optional(),
      avatarUrl: z.string().nullable().optional(),
      amount: z.number().finite(),
      currency: z.enum(["TON", "STARS"]),
      placedAt: z.number().finite(),
    })
    .nullable()
    .optional()
    .default(null),
  history: z.array(
    z.object({
      roundId: z.string(),
      crashAt: z.number().finite(),
      timestamp: z.number().finite(),
      serverSeedHash: z.string().nullable().optional(),
      serverSeed: z.string().nullable().optional(),
      fairnessVersion: z.string().nullable().optional(),
      fairnessNonce: z.number().finite().nullable().optional(),
    }),
  ),
  myBet: z
    .object({
      userId: z.string(),
      roundId: z.string(),
      amount: z.number().finite(),
      currency: z.enum(["TON", "STARS"]),
      status: z.enum(["ACTIVE", "CASHED_OUT", "LOST"]),
      placedAt: z.number().finite(),
      cashoutMultiplier: z.number().nullable(),
      payout: z.number().nullable(),
      lockedStake: z.number().finite(),
    })
    .nullable(),
  canPlaceBet: z.boolean(),
  canCashOut: z.boolean(),
});

const ROUND_STATE_PAYLOAD_SCHEMA = z
  .object({
    roundId: z.string().min(1),
    eventType: z.string().optional(),
    status: z.string().optional(),
    state: z.string().optional(),
    onlineCount: z.number().int().nonnegative().optional(),
    serverTime: z.number().finite().optional(),
    currentMultiplier: z.number().finite().optional(),
    startedAt: z.number().nullable().optional(),
    crashAt: z.number().nullable().optional(),
    endsAt: z.number().nullable().optional(),
    waitingEndsAt: z.number().nullable().optional(),
    crashMultiplier: z.number().nullable().optional(),
    serverSeedHash: z.string().optional(),
    fairnessVersion: z.string().optional(),
    fairnessNonce: z.number().finite().optional(),
    clientSeed: z.string().nullable().optional(),
    effectiveClientSeed: z.string().optional(),
    serverSeed: z.string().optional(),
    houseEdge: z.number().finite().optional(),
    maxCrash: z.number().finite().optional(),
  })
  .passthrough();

const MULTIPLIER_PAYLOAD_SCHEMA = z
  .object({
    roundId: z.string().min(1),
    multiplier: z.number().finite(),
    serverTs: z.number().finite().optional(),
  })
  .passthrough();

const ONLINE_COUNT_PAYLOAD_SCHEMA = z
  .object({
    roundId: z.string().min(1),
    onlineCount: z.number().int().nonnegative(),
  })
  .passthrough();

const PLAYER_BET_PAYLOAD_SCHEMA = z
  .object({
    roundId: z.string().min(1).optional(),
    userId: z.string().min(1).optional(),
    betAmount: z.union([z.number().finite(), z.string()]).optional(),
    amount: z.number().finite().optional(),
    currency: z.enum(["TON", "STARS"]).optional(),
    displayName: z.string().optional(),
    username: z.string().nullable().optional(),
    isHidden: z.boolean().optional(),
    visibleToCurrentUserOnly: z.boolean().optional(),
    avatarUrl: z.string().nullable().optional(),
    isCurrentUser: z.boolean().optional(),
    placedAt: z.number().finite().optional(),
    player: z.record(z.unknown()).optional(),
  })
  .passthrough();

const PLAYER_CASHOUT_PAYLOAD_SCHEMA = z
  .object({
    roundId: z.string().min(1).optional(),
    userId: z.string().min(1).optional(),
    multiplier: z.union([z.number().finite(), z.string()]).optional(),
    payout: z.union([z.number().finite(), z.string()]).optional(),
    profit: z.union([z.number().finite(), z.string()]).optional(),
    betAmount: z.union([z.number().finite(), z.string()]).optional(),
    amount: z.union([z.number().finite(), z.string()]).optional(),
    currency: z.enum(["TON", "STARS"]).optional(),
    displayName: z.string().optional(),
    username: z.string().nullable().optional(),
    isHidden: z.boolean().optional(),
    visibleToCurrentUserOnly: z.boolean().optional(),
    avatarUrl: z.string().nullable().optional(),
    isCurrentUser: z.boolean().optional(),
    placedAt: z.union([z.number().finite(), z.string()]).optional(),
    player: z.record(z.unknown()).optional(),
  })
  .passthrough();

const WS_MESSAGE_SCHEMA = z.discriminatedUnion("type", [
  z.object({ type: z.literal("round_state"), payload: ROUND_STATE_PAYLOAD_SCHEMA }),
  z.object({ type: z.literal("multiplier_update"), payload: MULTIPLIER_PAYLOAD_SCHEMA }),
  z.object({ type: z.literal("online_count"), payload: ONLINE_COUNT_PAYLOAD_SCHEMA }),
  z.object({ type: z.literal("round_crashed"), payload: z.record(z.unknown()) }),
  z.object({ type: z.literal("round_finished"), payload: z.record(z.unknown()) }),
  z.object({ type: z.literal("player_bet"), payload: PLAYER_BET_PAYLOAD_SCHEMA }),
  z.object({ type: z.literal("player_cashout"), payload: PLAYER_CASHOUT_PAYLOAD_SCHEMA }),
  z.object({
    type: z.literal("error"),
    payload: z.object({ code: z.string(), message: z.string() }),
  }),
  z.object({
    type: z.literal("pong"),
    payload: z.object({ timestamp: z.number().finite() }),
  }),
]);

export type GameWsRoundStatePayload = z.infer<typeof ROUND_STATE_PAYLOAD_SCHEMA>;
export type GameWsMultiplierPayload = z.infer<typeof MULTIPLIER_PAYLOAD_SCHEMA>;
export type GameWsOnlineCountPayload = z.infer<typeof ONLINE_COUNT_PAYLOAD_SCHEMA>;
export type GameWsPlayerBetPayload = z.infer<typeof PLAYER_BET_PAYLOAD_SCHEMA>;
export type GameWsPlayerCashoutPayload = z.infer<typeof PLAYER_CASHOUT_PAYLOAD_SCHEMA>;
export type SnapshotSyncReason = "initial" | "open" | "reconnect" | "event_resync";

type SnapshotPlayerPayload = z.infer<typeof SNAPSHOT_PLAYER_SCHEMA>;

function normalizeSnapshotPlayerPayload(player: SnapshotPlayerPayload): BackendRoundPlayerState {
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
    displayName: publicPlayer.displayName,
    username: publicPlayer.username,
    isHidden: publicPlayer.isHidden,
    visibleToCurrentUserOnly: publicPlayer.visibleToCurrentUserOnly,
    avatarUrl: publicPlayer.avatarUrl,
    amount: player.amount,
    currency: player.currency,
    status: player.status,
    isCurrentUser: player.isCurrentUser,
    placedAt: player.placedAt,
    cashoutMultiplier: player.cashoutMultiplier,
    payout: player.payout,
    autoCashoutAt: player.autoCashoutAt,
  };
}

export function parseCurrentRoundSnapshotPayload(payload: unknown): CurrentRoundSnapshotResponse | null {
  const parsed = SNAPSHOT_SCHEMA.safeParse(payload);
  if (!parsed.success) return null;

  const queuedRaw = parsed.data.queuedBet;
  const queuedBet = queuedRaw
    ? (() => {
        const publicPlayer = buildPublicPlayerProfile({
          userId: queuedRaw.userId,
          displayName: queuedRaw.displayName,
          username: queuedRaw.username,
          isHidden: queuedRaw.isHidden,
          visibleToCurrentUserOnly: queuedRaw.visibleToCurrentUserOnly,
          avatarUrl: queuedRaw.avatarUrl,
        });
        return {
          id: queuedRaw.id,
          userId: queuedRaw.userId,
          displayName: publicPlayer.displayName,
          username: publicPlayer.username,
          isHidden: publicPlayer.isHidden,
          visibleToCurrentUserOnly: publicPlayer.visibleToCurrentUserOnly,
          avatarUrl: publicPlayer.avatarUrl,
          amount: queuedRaw.amount,
          currency: queuedRaw.currency,
          placedAt: queuedRaw.placedAt,
        };
      })()
    : null;

  return {
    ...parsed.data,
    players: parsed.data.players.map(normalizeSnapshotPlayerPayload),
    queuedBet,
  } as CurrentRoundSnapshotResponse;
}

type GameWsClientCallbacks = {
  onSnapshot: (snapshot: CurrentRoundSnapshotResponse, reason: SnapshotSyncReason) => void;
  onRoundState: (payload: GameWsRoundStatePayload) => void;
  onMultiplierUpdate: (payload: GameWsMultiplierPayload) => void;
  onOnlineCount: (payload: GameWsOnlineCountPayload) => void;
  onRoundCrashed: (payload: Record<string, unknown>) => void;
  onRoundFinished: (payload: Record<string, unknown>) => void;
  onPlayerBet: (payload: GameWsPlayerBetPayload) => void;
  onPlayerCashout: (payload: GameWsPlayerCashoutPayload) => void;
  onWsError: (code: string, message: string) => void;
  onReconnectScheduled: (attempt: number, delayMs: number) => void;
};

type GameWsClientOptions = {
  wsUrl?: string;
  snapshotPath?: string;
  debug?: boolean;
  callbacks: Partial<GameWsClientCallbacks>;
};

function toWsUrl(rawUrl: string, fallbackPort: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return trimmed;

  const fromHttp = (protocol: string) => (protocol === "https:" ? "wss:" : "ws:");

  try {
    if (trimmed.startsWith("ws://") || trimmed.startsWith("wss://")) {
      const wsUrl = new URL(trimmed);
      if (!wsUrl.port && fallbackPort) {
        wsUrl.port = fallbackPort;
      }
      return wsUrl.toString();
    }

    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      const httpUrl = new URL(trimmed);
      httpUrl.protocol = fromHttp(httpUrl.protocol);
      if (!httpUrl.port && fallbackPort) {
        httpUrl.port = fallbackPort;
      }
      return httpUrl.toString();
    }
  } catch {
    return trimmed;
  }

  return trimmed;
}

function isLocalHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "[::1]"
  );
}

function buildSameHostProxyWsUrl(): string | null {
  if (typeof window === "undefined") return null;
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}

function shouldRewriteLocalWsToSameHostProxy(resolvedWsUrl: string): boolean {
  if (typeof window === "undefined") return false;
  const pageHostname = window.location.hostname;
  if (isLocalHostname(pageHostname)) return false;

  try {
    const parsed = new URL(resolvedWsUrl);
    return isLocalHostname(parsed.hostname);
  } catch {
    return false;
  }
}

export class GameWsClient {
  private readonly callbacks: Partial<GameWsClientCallbacks>;
  private readonly snapshotPath: string;
  private readonly debug: boolean;
  private readonly explicitWsUrl?: string;
  private readonly reconnectBaseMs = 500;
  private readonly reconnectMaxMs = 5000;

  private running = false;
  private socket: WebSocket | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private hasConnectedAtLeastOnce = false;

  constructor(options: GameWsClientOptions) {
    this.explicitWsUrl = options.wsUrl;
    this.snapshotPath = options.snapshotPath ?? "/api/game/round/current";
    this.debug = Boolean(options.debug);
    this.callbacks = options.callbacks;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    await this.refreshSnapshot("initial");
    this.openSocket();
  }

  stop(): void {
    this.running = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket) {
      const socket = this.socket;
      this.socket = null;
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close(1000, "CLIENT_STOP");
      }
    }
  }

  async refreshSnapshot(reason: SnapshotSyncReason): Promise<void> {
    if (typeof window === "undefined") return;

    try {
      const response = await fetch(this.snapshotPath, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        this.debugLog(`snapshot request failed: status=${response.status}`);
        return;
      }

      const payload: unknown = await response.json();
      const parsed = parseCurrentRoundSnapshotPayload(payload);
      if (!parsed) {
        this.debugLog("snapshot validation failed");
        return;
      }

      this.callbacks.onSnapshot?.(parsed, reason);
    } catch (error) {
      this.debugLog(`snapshot request error: ${error instanceof Error ? error.message : "unknown"}`);
    }
  }

  private openSocket(): void {
    if (!this.running || typeof window === "undefined") return;

    const wsUrl = this.resolveWsUrl();
    if (!wsUrl) {
      this.debugLog("ws url is empty, skip connect");
      return;
    }

    this.debugLog(`connecting ${wsUrl}`);
    const socket = new WebSocket(wsUrl);
    this.socket = socket;

    socket.addEventListener("open", () => {
      this.reconnectAttempt = 0;
      const reason: SnapshotSyncReason = this.hasConnectedAtLeastOnce ? "reconnect" : "open";
      this.hasConnectedAtLeastOnce = true;
      this.debugLog("connected");
      void this.refreshSnapshot(reason);
    });

    socket.addEventListener("close", (event) => {
      if (this.socket === socket) {
        this.socket = null;
      }

      this.debugLog(`disconnected code=${event.code} reason=${event.reason || "n/a"}`);
      if (!this.running) return;
      this.scheduleReconnect();
    });

    socket.addEventListener("error", () => {
      this.debugLog("socket error");
    });

    socket.addEventListener("message", (event) => {
      const rawMessage = typeof event.data === "string" ? event.data : "";
      if (!rawMessage) return;

      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(rawMessage);
      } catch {
        this.debugLog("received invalid JSON message");
        return;
      }

      const parsed = WS_MESSAGE_SCHEMA.safeParse(parsedJson);
      if (!parsed.success) {
        this.debugLog("received unsupported ws message");
        return;
      }

      switch (parsed.data.type) {
        case "round_state":
          this.callbacks.onRoundState?.(parsed.data.payload);
          return;
        case "multiplier_update":
          this.callbacks.onMultiplierUpdate?.(parsed.data.payload);
          return;
        case "online_count":
          this.callbacks.onOnlineCount?.(parsed.data.payload);
          return;
        case "round_crashed":
          this.callbacks.onRoundCrashed?.(parsed.data.payload);
          return;
        case "round_finished":
          this.callbacks.onRoundFinished?.(parsed.data.payload);
          return;
        case "player_bet":
          this.callbacks.onPlayerBet?.(parsed.data.payload);
          return;
        case "player_cashout":
          this.callbacks.onPlayerCashout?.(parsed.data.payload);
          return;
        case "error":
          this.callbacks.onWsError?.(parsed.data.payload.code, parsed.data.payload.message);
          return;
        case "pong":
          return;
        default:
          return;
      }
    });
  }

  private scheduleReconnect(): void {
    if (!this.running) return;
    if (this.reconnectTimer) return;

    const expDelay = this.reconnectBaseMs * Math.pow(2, this.reconnectAttempt);
    const delayMs = Math.min(expDelay, this.reconnectMaxMs) + Math.floor(Math.random() * 200);
    this.reconnectAttempt += 1;

    this.callbacks.onReconnectScheduled?.(this.reconnectAttempt, delayMs);
    this.debugLog(`reconnect scheduled attempt=${this.reconnectAttempt} delayMs=${delayMs}`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket();
    }, delayMs);
  }

  private resolveWsUrl(): string | null {
    const fallbackPort = process.env.NEXT_PUBLIC_GATEWAY_PORT?.trim() || "8081";
    if (this.explicitWsUrl) {
      const resolved = toWsUrl(this.explicitWsUrl, fallbackPort);
      if (shouldRewriteLocalWsToSameHostProxy(resolved)) {
        const proxied = buildSameHostProxyWsUrl();
        if (proxied) {
          this.debugLog(`resolved ws url source=options.wsUrl->same-host-proxy value=${proxied}`);
          return proxied;
        }
      }
      this.debugLog(`resolved ws url source=options.wsUrl value=${resolved}`);
      return resolved;
    }

    const envWsUrl = process.env.NEXT_PUBLIC_WS_URL?.trim();
    if (envWsUrl) {
      const resolved = toWsUrl(envWsUrl, fallbackPort);
      if (shouldRewriteLocalWsToSameHostProxy(resolved)) {
        const proxied = buildSameHostProxyWsUrl();
        if (proxied) {
          this.debugLog(`resolved ws url source=NEXT_PUBLIC_WS_URL->same-host-proxy value=${proxied}`);
          return proxied;
        }
      }
      this.debugLog(`resolved ws url source=NEXT_PUBLIC_WS_URL value=${resolved}`);
      return resolved;
    }

    if (typeof window === "undefined") return null;

    const hostname = window.location.hostname;
    if (isLocalHostname(hostname)) {
      const resolved = `ws://localhost:${fallbackPort}`;
      this.debugLog(`resolved ws url source=localhost-fallback value=${resolved}`);
      return resolved;
    }

    const envGatewayUrl = process.env.NEXT_PUBLIC_GATEWAY_URL?.trim();
    if (envGatewayUrl) {
      const resolved = toWsUrl(envGatewayUrl, fallbackPort);
      if (shouldRewriteLocalWsToSameHostProxy(resolved)) {
        const proxied = buildSameHostProxyWsUrl();
        if (proxied) {
          this.debugLog(`resolved ws url source=NEXT_PUBLIC_GATEWAY_URL->same-host-proxy value=${proxied}`);
          return proxied;
        }
      }
      this.debugLog(`resolved ws url source=NEXT_PUBLIC_GATEWAY_URL value=${resolved}`);
      return resolved;
    }

    const proxied = buildSameHostProxyWsUrl();
    if (proxied) {
      this.debugLog(`resolved ws url source=window.location->same-host-proxy value=${proxied}`);
      return proxied;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const resolved = `${protocol}//${hostname}:${fallbackPort}`;
    this.debugLog(`resolved ws url source=window.location:fallback value=${resolved}`);
    return resolved;
  }

  private debugLog(message: string): void {
    if (!this.debug) return;
    console.debug(`[GameWsClient] ${message}`);
  }
}
