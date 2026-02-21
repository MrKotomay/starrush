export type Currency = "TON" | "STARS";

export enum RoundPhase {
  PREPARING = "PREPARING",
  RUNNING = "RUNNING",
  CRASHED = "CRASHED",
  RESETTING = "RESETTING",
}

export type BetStatus = "ACTIVE" | "CASHED_OUT" | "LOST" | "QUEUED";

export interface RoundHistoryItem {
  roundId: string;
  crashAt: number;
  timestamp: number;
  serverSeedHash?: string | null;
  serverSeed?: string | null;
  fairnessVersion?: string | null;
  fairnessNonce?: number | null;
}

export interface RoundFairnessView {
  serverSeedHash: string;
  serverSeed: string | null;
  fairnessVersion: string;
  fairnessNonce: number;
}

export interface PlayerBetView {
  id: string;
  userId: string;
  username: string;
  amount: number;
  currency: Currency;
  status: BetStatus;
  isCurrentUser: boolean;
  visibleToCurrentUserOnly: boolean;
  placedAt: number;
  cashoutMultiplier: number | null;
  payout: number | null;
  autoCashoutAt: number | null;
}

export interface RoundSnapshot {
  phase: RoundPhase;
  roundId: string;
  roundIndex: number;
  onlineCount: number;
  coefficient: number;
  crashAt: number;
  countdown: number;
  runningElapsedMs: number;
  phaseElapsedMs: number;
  history: RoundHistoryItem[];
  fairness: RoundFairnessView | null;
  players: PlayerBetView[];
  queuedBet: PlayerBetView | null;
  userActiveBet: PlayerBetView | null;
  canPlaceBet: boolean;
  canCashOut: boolean;
}

export interface PlaceBetResult {
  ok: boolean;
  mode: "active" | "queued" | null;
  message: string;
  acceptedAmount: number;
  previousAmount: number;
}

export interface CashOutResult {
  ok: boolean;
  message: string;
  multiplier: number;
  payout: number;
}

export interface RoundEngineConfig {
  preparingMs: number;
  crashedMs: number;
  resettingMs: number;
  seed: number;
  emitIntervalMs: number;
  userId: string;
  username: string;
  currency: Currency;
  minBet: number;
  maxBet: number;
}
