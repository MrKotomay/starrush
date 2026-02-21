export const BACKEND_ROUND_STATUSES = [
  "WAITING",
  "RUNNING",
  "CRASHED",
  "FINISHED",
] as const;

export type BackendRoundStatus = (typeof BACKEND_ROUND_STATUSES)[number];

export type BackendPlayerBetStatus = "ACTIVE" | "CASHED_OUT" | "LOST";

export interface BackendPublicPlayerProfile {
  userId: string;
  displayName: string;
  username: string | null;
  isHidden: boolean;
  visibleToCurrentUserOnly: boolean;
  avatarUrl: string | null;
}

export interface BackendRoundHistoryItem {
  roundId: string;
  crashAt: number;
  timestamp: number;
  serverSeedHash?: string | null;
  serverSeed?: string | null;
  fairnessVersion?: string | null;
  fairnessNonce?: number | null;
}

export interface BackendRoundPlayerState extends BackendPublicPlayerProfile {
  id: string;
  amount: number;
  currency: "TON" | "STARS";
  status: BackendPlayerBetStatus;
  isCurrentUser: boolean;
  placedAt: number;
  cashoutMultiplier: number | null;
  payout: number | null;
  autoCashoutAt: number | null;
}

export interface BackendQueuedBetState extends BackendPublicPlayerProfile {
  id: string;
  amount: number;
  currency: "TON" | "STARS";
  placedAt: number;
}

export interface BackendFairnessState {
  serverSeedHash: string;
  fairnessVersion: string;
  fairnessNonce: number;
  clientSeed: string | null;
  effectiveClientSeed: string;
  serverSeed: string | null;
  houseEdge: number;
  maxCrash: number;
}

export interface BackendMyBetState {
  userId: string;
  roundId: string;
  amount: number;
  currency: "TON" | "STARS";
  status: BackendPlayerBetStatus;
  placedAt: number;
  cashoutMultiplier: number | null;
  payout: number | null;
  lockedStake: number;
}

export interface CurrentRoundSnapshotResponse {
  version: 1;
  serverTime: number;
  roundId: string;
  status: BackendRoundStatus;
  onlineCount?: number;
  currentMultiplier: number;
  startedAt: number | null;
  crashAt: number | null;
  endsAt: number | null;
  waitingEndsAt: number | null;
  crashMultiplier: number | null;
  fairness: BackendFairnessState;
  players: BackendRoundPlayerState[];
  queuedBet: BackendQueuedBetState | null;
  history: BackendRoundHistoryItem[];
  myBet: BackendMyBetState | null;
  canPlaceBet: boolean;
  canCashOut: boolean;
}

export type RoundLifecycleEventType =
  | "ROUND_WAITING"
  | "ROUND_STARTED"
  | "ROUND_CRASHED"
  | "ROUND_FINISHED";

export interface RoundStateEventPayload {
  roundId: string;
  eventType: RoundLifecycleEventType;
  status: BackendRoundStatus;
  onlineCount?: number;
  serverTime: number;
  currentMultiplier: number;
  startedAt: number | null;
  crashAt: number | null;
  endsAt: number | null;
  waitingEndsAt: number | null;
  crashMultiplier: number | null;
  serverSeedHash?: string;
  fairnessVersion?: string;
  fairnessNonce?: number;
  clientSeed?: string | null;
  effectiveClientSeed?: string;
  serverSeed?: string;
  houseEdge?: number;
  maxCrash?: number;
}

export interface MultiplierUpdateEventPayload {
  roundId: string;
  multiplier: number;
  serverTs: number;
}

export interface OnlineCountEventPayload {
  roundId: string;
  onlineCount: number;
}

export interface BackendPlayerBetEventPayload
  extends BackendPublicPlayerProfile,
    Record<string, unknown> {
  roundId: string;
  betAmount: string;
  amount: number;
  currency: "TON" | "STARS";
  placedAt: number;
}

export interface BackendPlayerCashoutEventPayload
  extends BackendPublicPlayerProfile,
    Record<string, unknown> {
  roundId: string;
  multiplier: number;
  payout: string;
  profit: string;
  betAmount: string | null;
  amount: number | null;
  currency: "TON" | "STARS" | null;
  placedAt: number | null;
}
