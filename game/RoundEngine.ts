import {
  CashOutResult,
  Currency,
  PlaceBetResult,
  PlayerBetView,
  RoundEngineConfig,
  RoundHistoryItem,
  RoundPhase,
  RoundSnapshot,
} from "@/game/types";

type Listener = (snapshot: RoundSnapshot) => void;
type ActiveRoundStatus = "ACTIVE" | "CASHED_OUT" | "LOST";

interface EngineBet extends Omit<PlayerBetView, "status"> {
  status: ActiveRoundStatus;
}

const DEFAULT_CONFIG: RoundEngineConfig = {
  preparingMs: 5000,
  crashedMs: 1600,
  resettingMs: 900,
  seed: 742901,
  emitIntervalMs: 66,
  userId: "self",
  username: "You",
  currency: "TON",
  minBet: 0.1,
  maxBet: 1000,
};

const BOT_NAMES = [
  "NovaPilot",
  "NebulaX",
  "OrbitFox",
  "LunaByte",
  "VoidArc",
  "Starling",
  "PixelRay",
  "CometKid",
  "HyperIon",
  "PlasmaZen",
  "QuarkRush",
  "SolarMint",
  "AstraLink",
  "VegaPulse",
  "EchoWarp",
  "AstroM8",
  "DustRider",
  "HyperNova",
  "CrimsonSky",
  "IonMuse",
  "SonicDrift",
  "NightOrion",
  "ZeroGravity",
  "FlareWing",
  "DarkNebula",
  "JetStream",
  "OrbitHack",
  "ArcRunner",
  "MeteorKid",
  "CosmoDrip",
  "PhotonLoop",
  "CloudRift",
  "AetherPilot",
  "ZenithFly",
  "MoonMint",
  "TurboAster",
  "PulseRay",
  "OrbitGem",
  "CometFlow",
  "SkyCipher",
  "QuasarKit",
  "RocketBoy",
  "StellarBit",
  "WarpByte",
  "AstraNova",
];

export class RoundEngine {
  private readonly config: RoundEngineConfig;
  private readonly listeners = new Set<Listener>();

  private running = false;
  private frameId: number | null = null;
  private lastTickMs = 0;
  private lastEmitMs = 0;
  private documentHidden = false;

  private phase: RoundPhase = RoundPhase.PREPARING;
  private phaseElapsedMs = 0;
  private runningElapsedMs = 0;

  private roundIndex = 0;
  private roundId = "round-0";
  private countdown = 5;
  private coefficient = 1;
  private crashAt = 2;

  private players: EngineBet[] = [];
  private userActiveBetId: string | null = null;
  private queuedBet: PlayerBetView | null = null;
  private history: RoundHistoryItem[] = [];

  constructor(config: Partial<RoundEngineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.prepareNextRound();
  }

  start(): void {
    if (this.running) {
      return;
    }

    this.running = true;
    this.lastTickMs = 0;
    this.lastEmitMs = 0;
    this.scheduleNextFrame();
    this.emitSnapshot(true);
  }

  stop(): void {
    this.running = false;
    if (this.frameId !== null) {
      this.cancelFrame(this.frameId);
      this.frameId = null;
    }
  }

  destroy(): void {
    this.stop();
    this.listeners.clear();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());

    return () => {
      this.listeners.delete(listener);
    };
  }

  setDocumentHidden(hidden: boolean): void {
    this.documentHidden = hidden;
  }

  getSnapshot(): RoundSnapshot {
    const playerPriority = (player: EngineBet): number => {
      if (player.isCurrentUser) return 0;
      if (player.status === "ACTIVE") return 1;
      if (player.status === "CASHED_OUT") return 2;
      return 3;
    };

    const players = [...this.players]
      .sort((a, b) => {
        const priorityDiff = playerPriority(a) - playerPriority(b);
        if (priorityDiff !== 0) return priorityDiff;
        return b.amount - a.amount;
      })
      .map((entry) => this.toPlayerView(entry));

    const userActiveBet = players.find(
      (entry) => entry.isCurrentUser && entry.status === "ACTIVE",
    ) ?? null;
    const onlineCount = new Set(players.map((entry) => entry.userId)).size;

    return {
      phase: this.phase,
      roundId: this.roundId,
      roundIndex: this.roundIndex,
      onlineCount,
      coefficient: this.coefficient,
      crashAt: this.crashAt,
      countdown: this.countdown,
      runningElapsedMs: this.runningElapsedMs,
      phaseElapsedMs: this.phaseElapsedMs,
      history: this.history.map((item) => ({ ...item })),
      fairness: null,
      players,
      queuedBet: this.queuedBet ? { ...this.queuedBet } : null,
      userActiveBet,
      canPlaceBet:
        this.phase === RoundPhase.PREPARING || this.phase === RoundPhase.RUNNING,
      canCashOut:
        this.phase === RoundPhase.RUNNING &&
        userActiveBet !== null &&
        userActiveBet.status === "ACTIVE",
    };
  }

  placeBet(rawAmount: number, currency: Currency = this.config.currency): PlaceBetResult {
    if (!Number.isFinite(rawAmount)) {
      return {
        ok: false,
        mode: null,
        message: "Invalid amount",
        acceptedAmount: 0,
        previousAmount: 0,
      };
    }

    const amount = this.roundTo2(rawAmount);
    if (amount < this.config.minBet || amount > this.config.maxBet) {
      return {
        ok: false,
        mode: null,
        message: `Bet must be between ${this.config.minBet} and ${this.config.maxBet}`,
        acceptedAmount: amount,
        previousAmount: 0,
      };
    }

    if (this.phase === RoundPhase.PREPARING) {
      const existing = this.getUserRoundBet();
      const previousAmount = existing?.amount ?? 0;

      if (existing) {
        existing.amount = amount;
        existing.currency = currency;
        existing.status = "ACTIVE";
        existing.placedAt = Date.now();
        existing.cashoutMultiplier = null;
        existing.payout = null;
      } else {
        const newBet = this.createUserRoundBet(amount, currency);
        this.players.unshift(newBet);
        this.userActiveBetId = newBet.id;
      }

      this.emitSnapshot(true);
      return {
        ok: true,
        mode: "active",
        message: previousAmount > 0 ? "Bet updated for this round" : "Bet placed",
        acceptedAmount: amount,
        previousAmount,
      };
    }

    if (
      this.phase === RoundPhase.RUNNING ||
      this.phase === RoundPhase.CRASHED ||
      this.phase === RoundPhase.RESETTING
    ) {
      const previousAmount = this.queuedBet?.amount ?? 0;

      this.queuedBet = {
        id: `queued-${this.roundIndex + 1}`,
        userId: this.config.userId,
        username: this.config.username,
        amount,
        currency,
        status: "QUEUED",
        isCurrentUser: true,
        visibleToCurrentUserOnly: true,
        placedAt: Date.now(),
        cashoutMultiplier: null,
        payout: null,
        autoCashoutAt: null,
      };

      this.emitSnapshot(true);
      return {
        ok: true,
        mode: "queued",
        message:
          previousAmount > 0
            ? "Queued bet updated for next round"
            : "Bet queued for next round",
        acceptedAmount: amount,
        previousAmount,
      };
    }

    return {
      ok: false,
      mode: null,
      message: "Bet is currently unavailable",
      acceptedAmount: amount,
      previousAmount: 0,
    };
  }

  cashOut(): CashOutResult {
    const userBet = this.getUserRoundBet();
    if (this.phase !== RoundPhase.RUNNING || !userBet || userBet.status !== "ACTIVE") {
      return {
        ok: false,
        message: "Cash out unavailable",
        multiplier: 0,
        payout: 0,
      };
    }

    const multiplier = this.roundTo2(this.coefficient);
    const payout = this.roundTo2(userBet.amount * multiplier);

    userBet.status = "CASHED_OUT";
    userBet.cashoutMultiplier = multiplier;
    userBet.payout = payout;

    this.emitSnapshot(true);
    return {
      ok: true,
      message: `Cashed out at ${multiplier.toFixed(2)}x`,
      multiplier,
      payout,
    };
  }

  private scheduleNextFrame(): void {
    this.frameId = this.requestFrame(this.tick);
  }

  private readonly tick = (timestamp: number): void => {
    if (!this.running) {
      return;
    }

    if (this.lastTickMs === 0) {
      this.lastTickMs = timestamp;
    }

    const deltaMs = Math.min(timestamp - this.lastTickMs, 80);
    this.lastTickMs = timestamp;
    this.advance(deltaMs);
    this.emitSnapshot(false);
    this.scheduleNextFrame();
  };

  private advance(deltaMs: number): void {
    this.phaseElapsedMs += deltaMs;

    if (this.phase === RoundPhase.PREPARING) {
      const remainingMs = Math.max(0, this.config.preparingMs - this.phaseElapsedMs);
      this.countdown = Math.ceil(remainingMs / 1000);
      this.coefficient = 1;

      if (this.phaseElapsedMs >= this.config.preparingMs) {
        this.startRunningPhase();
      }
      return;
    }

    if (this.phase === RoundPhase.RUNNING) {
      this.runningElapsedMs += deltaMs;
      const elapsedSeconds = this.runningElapsedMs / 1000;
      this.coefficient = this.computeCoefficient(elapsedSeconds);

      this.resolveMockCashouts();

      if (this.coefficient >= this.crashAt) {
        this.coefficient = this.crashAt;
        this.startCrashedPhase();
      }
      return;
    }

    if (this.phase === RoundPhase.CRASHED) {
      if (this.phaseElapsedMs >= this.config.crashedMs) {
        this.startResettingPhase();
      }
      return;
    }

    if (this.phase === RoundPhase.RESETTING) {
      if (this.phaseElapsedMs >= this.config.resettingMs) {
        this.prepareNextRound();
      }
    }
  }

  private prepareNextRound(): void {
    this.roundIndex += 1;
    this.roundId = `round-${this.roundIndex}`;
    this.phase = RoundPhase.PREPARING;
    this.phaseElapsedMs = 0;
    this.runningElapsedMs = 0;
    this.coefficient = 1;
    this.countdown = Math.ceil(this.config.preparingMs / 1000);
    this.crashAt = this.generateCrashAt(this.roundIndex);
    this.players = this.generateMockPlayers(this.roundIndex, this.crashAt);
    this.userActiveBetId = null;

    if (this.queuedBet) {
      const movedBet = this.createUserRoundBet(
        this.queuedBet.amount,
        this.queuedBet.currency,
      );
      this.players.unshift(movedBet);
      this.userActiveBetId = movedBet.id;
      this.queuedBet = null;
    }

    this.emitSnapshot(true);
  }

  private startRunningPhase(): void {
    this.phase = RoundPhase.RUNNING;
    this.phaseElapsedMs = 0;
    this.runningElapsedMs = 0;
    this.coefficient = 1;
    this.countdown = 0;
    this.emitSnapshot(true);
  }

  private startCrashedPhase(): void {
    this.phase = RoundPhase.CRASHED;
    this.phaseElapsedMs = 0;

    for (const player of this.players) {
      if (player.status === "ACTIVE") {
        player.status = "LOST";
        player.cashoutMultiplier = null;
        player.payout = 0;
      }
    }

    this.history.unshift({
      roundId: this.roundId,
      crashAt: this.crashAt,
      timestamp: Date.now(),
    });

    if (this.history.length > 20) {
      this.history = this.history.slice(0, 20);
    }

    this.emitSnapshot(true);
  }

  private startResettingPhase(): void {
    this.phase = RoundPhase.RESETTING;
    this.phaseElapsedMs = 0;
    this.emitSnapshot(true);
  }

  private resolveMockCashouts(): void {
    for (const player of this.players) {
      if (player.isCurrentUser) {
        continue;
      }

      if (player.status !== "ACTIVE" || player.autoCashoutAt === null) {
        continue;
      }

      if (this.coefficient >= player.autoCashoutAt) {
        const cashoutMultiplier = player.autoCashoutAt;
        player.status = "CASHED_OUT";
        player.cashoutMultiplier = cashoutMultiplier;
        player.payout = this.roundTo2(player.amount * cashoutMultiplier);
      }
    }
  }

  private generateMockPlayers(roundIndex: number, crashAt: number): EngineBet[] {
    const rng = this.createRng(this.roundSeed(roundIndex));
    const count = 15 + Math.floor(rng() * 26);
    const players: EngineBet[] = [];

    for (let i = 0; i < count; i += 1) {
      const nameOffset = Math.floor(rng() * BOT_NAMES.length);
      const username = BOT_NAMES[(nameOffset + i * 3) % BOT_NAMES.length];
      const amount = this.randomBetAmount(rng);

      let autoCashoutAt: number | null = null;
      const maxCashout = crashAt - 0.02;
      if (maxCashout > 1.08 && rng() > 0.3) {
        const upper = Math.min(maxCashout, 12 + rng() * 8);
        const shaped = Math.pow(rng(), 1.75);
        autoCashoutAt = this.roundTo2(1.05 + shaped * (upper - 1.05));
        if (autoCashoutAt >= maxCashout) {
          autoCashoutAt = this.roundTo2(maxCashout - 0.01);
        }
        if (autoCashoutAt <= 1.01) {
          autoCashoutAt = null;
        }
      }

      players.push({
        id: `bot-${roundIndex}-${i}`,
        userId: `bot-${roundIndex}-${i}`,
        username,
        amount,
        currency: "TON",
        status: "ACTIVE",
        isCurrentUser: false,
        visibleToCurrentUserOnly: false,
        placedAt: Date.now(),
        cashoutMultiplier: null,
        payout: null,
        autoCashoutAt,
      });
    }

    return players;
  }

  private createUserRoundBet(amount: number, currency: Currency): EngineBet {
    return {
      id: `user-${this.roundId}`,
      userId: this.config.userId,
      username: this.config.username,
      amount,
      currency,
      status: "ACTIVE",
      isCurrentUser: true,
      visibleToCurrentUserOnly: false,
      placedAt: Date.now(),
      cashoutMultiplier: null,
      payout: null,
      autoCashoutAt: null,
    };
  }

  private getUserRoundBet(): EngineBet | null {
    if (!this.userActiveBetId) {
      return null;
    }

    return this.players.find((entry) => entry.id === this.userActiveBetId) ?? null;
  }

  private toPlayerView(entry: EngineBet): PlayerBetView {
    return {
      ...entry,
      status: entry.status,
    };
  }

  private generateCrashAt(roundIndex: number): number {
    const rng = this.createRng(this.roundSeed(roundIndex) ^ 0x9e3779b9);

    if (rng() < 0.045) {
      return 1;
    }

    const u = 1 - rng();
    const raw = 0.99 / Math.max(u, 1e-6);
    const shaped = Math.pow(raw, 0.58);
    const jitter = 0.96 + rng() * 0.08;
    const crashAt = shaped * jitter;
    return this.roundTo2(this.clamp(crashAt, 1.05, 24));
  }

  private computeCoefficient(elapsedSeconds: number): number {
    // Must match server formula: Math.exp(growthRate * elapsed)
    // Server default growthRate = 0.09 (see lib/round-multiplier.ts)
    const growthRate = 0.09;
    const rawMultiplier = Math.exp(growthRate * elapsedSeconds);
    return Math.max(1, Number(rawMultiplier.toFixed(4)));
  }

  private randomBetAmount(rng: () => number): number {
    const roll = rng();
    if (roll < 0.55) {
      return this.roundTo2(0.2 + rng() * 2.8);
    }
    if (roll < 0.86) {
      return this.roundTo2(3 + rng() * 8);
    }
    return this.roundTo2(11 + rng() * 24);
  }

  private emitSnapshot(force: boolean): void {
    const now = this.nowMs();
    const interval = this.documentHidden
      ? Math.max(this.config.emitIntervalMs * 3, 180)
      : this.config.emitIntervalMs;

    if (!force && this.lastEmitMs !== 0 && now - this.lastEmitMs < interval) {
      return;
    }

    this.lastEmitMs = now;
    const snapshot = this.getSnapshot();

    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  private requestFrame(callback: (timestamp: number) => void): number {
    if (
      typeof window !== "undefined" &&
      typeof window.requestAnimationFrame === "function"
    ) {
      return window.requestAnimationFrame(callback);
    }

    return setTimeout(() => callback(this.nowMs()), 16) as unknown as number;
  }

  private cancelFrame(id: number): void {
    if (
      typeof window !== "undefined" &&
      typeof window.cancelAnimationFrame === "function"
    ) {
      window.cancelAnimationFrame(id);
      return;
    }

    clearTimeout(id);
  }

  private nowMs(): number {
    if (typeof performance !== "undefined" && typeof performance.now === "function") {
      return performance.now();
    }
    return Date.now();
  }

  private roundTo2(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  private roundSeed(roundIndex: number): number {
    return (this.config.seed ^ Math.imul(roundIndex + 1, 0x9e3779b1)) >>> 0;
  }

  private createRng(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
}
