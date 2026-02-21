import { Currency } from "@prisma/client";
import {
  BackendPlayerBetEventPayload,
  BackendPlayerCashoutEventPayload,
} from "@/lib/game/backend-round-types";
import { PublicPlayerProfile } from "@/lib/game/public-player";

function toAmount(value: string | number | null | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export type PlayerBetEventPayloadInput = {
  roundId: string;
  betAmount: string;
  currency: Currency;
  placedAt: number;
  publicPlayer: PublicPlayerProfile;
};

export type PlayerCashoutEventPayloadInput = {
  roundId: string;
  multiplier: number;
  payout: string;
  profit: string;
  betAmount: string | null;
  currency: Currency | null;
  placedAt: number | null;
  publicPlayer: PublicPlayerProfile;
};

export function createPlayerBetEventPayload(
  input: PlayerBetEventPayloadInput,
): BackendPlayerBetEventPayload {
  return {
    roundId: input.roundId,
    userId: input.publicPlayer.userId,
    displayName: input.publicPlayer.displayName,
    username: input.publicPlayer.username,
    isHidden: input.publicPlayer.isHidden,
    visibleToCurrentUserOnly: input.publicPlayer.visibleToCurrentUserOnly,
    avatarUrl: input.publicPlayer.avatarUrl,
    betAmount: input.betAmount,
    amount: toAmount(input.betAmount) ?? 0,
    currency: input.currency,
    placedAt: input.placedAt,
  };
}

export function createPlayerCashoutEventPayload(
  input: PlayerCashoutEventPayloadInput,
): BackendPlayerCashoutEventPayload {
  return {
    roundId: input.roundId,
    userId: input.publicPlayer.userId,
    displayName: input.publicPlayer.displayName,
    username: input.publicPlayer.username,
    isHidden: input.publicPlayer.isHidden,
    visibleToCurrentUserOnly: input.publicPlayer.visibleToCurrentUserOnly,
    avatarUrl: input.publicPlayer.avatarUrl,
    multiplier: input.multiplier,
    payout: input.payout,
    profit: input.profit,
    betAmount: input.betAmount,
    amount: toAmount(input.betAmount),
    currency: input.currency,
    placedAt: input.placedAt,
  };
}
