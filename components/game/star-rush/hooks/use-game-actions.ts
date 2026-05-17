"use client";

import { useCallback, useState, type MutableRefObject } from "react";

import { Currency, RoundPhase } from "@/game/types";
import { formatCurrencyAmount, isIntegerCurrency } from "@/lib/currency";
import type { useHaptics } from "@/lib/haptics";
import type { BackendRoundStateAdapter } from "@/lib/game/backend-round-state-adapter";

import {
  MAX_BET_BY_CURRENCY,
  MIN_BET_BY_CURRENCY,
  ROUND_SWITCH_RETRY_STEP_MS,
  ROUND_SWITCH_RETRY_WINDOW_MS,
  isRoundSwitchErrorMessage,
  localizeAdapterMessage,
} from "../helpers";

type Translator = (key: string, vars?: Record<string, string | number>) => string;
type HapticsApi = ReturnType<typeof useHaptics>;

export interface UseGameActionsOptions {
  adapterRef: MutableRefObject<BackendRoundStateAdapter | null>;
  haptics: HapticsApi;
  t: Translator;
  showToast: (message: string) => void;
  refreshWalletBalances: () => Promise<void>;
  onWalletNeedsRefresh?: () => void;
}

export interface UseGameActionsResult {
  isBetSubmitting: boolean;
  isCashoutSubmitting: boolean;
  isActionBusy: boolean;
  placeBet: (rawBetAmount: number, currency: Currency) => Promise<boolean>;
  cashOut: () => Promise<void>;
}

/**
 * Encapsulates the bet/cashout REST commands against the round adapter,
 * including the round-switch retry window and the post-success refresh +
 * haptic feedback. Error toasts are routed through the parent `showToast`
 * so the panel stays in control of UX placement.
 */
export function useGameActions(options: UseGameActionsOptions): UseGameActionsResult {
  const {
    adapterRef,
    haptics,
    t,
    showToast,
    refreshWalletBalances,
    onWalletNeedsRefresh,
  } = options;

  const [isBetSubmitting, setBetSubmitting] = useState(false);
  const [isCashoutSubmitting, setCashoutSubmitting] = useState(false);

  const placeBet = useCallback(
    async (rawBetAmount: number, currency: Currency): Promise<boolean> => {
      const adapter = adapterRef.current;
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
        onWalletNeedsRefresh?.();
        haptics.betPlaced();
        return true;
      } finally {
        setBetSubmitting(false);
      }
    },
    [adapterRef, haptics, isBetSubmitting, isCashoutSubmitting, onWalletNeedsRefresh, refreshWalletBalances, showToast, t],
  );

  const cashOut = useCallback(async () => {
    const adapter = adapterRef.current;
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
      onWalletNeedsRefresh?.();
    } finally {
      setCashoutSubmitting(false);
    }
  }, [adapterRef, haptics, isBetSubmitting, isCashoutSubmitting, onWalletNeedsRefresh, refreshWalletBalances, showToast, t]);

  return {
    isBetSubmitting,
    isCashoutSubmitting,
    isActionBusy: isBetSubmitting || isCashoutSubmitting,
    placeBet,
    cashOut,
  };
}
