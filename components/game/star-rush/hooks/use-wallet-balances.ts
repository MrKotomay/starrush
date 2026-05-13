"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { toFiniteNumber, type WalletsApiResponse } from "../helpers";

export interface UseWalletBalancesOptions {
  initialTonBalance?: number;
  initialStarsBalance?: number;
}

export interface UseWalletBalancesResult {
  walletTonBalance: number;
  walletTonLocked: number;
  walletStarsBalance: number;
  walletStarsLocked: number;
  tonAvailableBalance: number;
  starsAvailableBalance: number;
  refreshWalletBalances: () => Promise<void>;
}

/**
 * Owns TON/STARS wallet balance state for the game panel. Refresh is a single
 * GET to /api/wallets and is called after place-bet, after cashout, and as
 * part of bootstrap.
 */
export function useWalletBalances({
  initialTonBalance = 0,
  initialStarsBalance = 0,
}: UseWalletBalancesOptions): UseWalletBalancesResult {
  const [walletTonBalance, setWalletTonBalance] = useState<number>(Math.max(0, initialTonBalance));
  const [walletTonLocked, setWalletTonLocked] = useState<number>(0);
  const [walletStarsBalance, setWalletStarsBalance] = useState<number>(Math.max(0, initialStarsBalance));
  const [walletStarsLocked, setWalletStarsLocked] = useState<number>(0);

  useEffect(() => {
    setWalletTonBalance(Math.max(0, initialTonBalance));
  }, [initialTonBalance]);

  useEffect(() => {
    setWalletStarsBalance(Math.max(0, initialStarsBalance));
  }, [initialStarsBalance]);

  const refreshWalletBalances = useCallback(async () => {
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

  const tonAvailableBalance = useMemo(
    () => Math.max(0, walletTonBalance - walletTonLocked),
    [walletTonBalance, walletTonLocked],
  );
  const starsAvailableBalance = useMemo(
    () => Math.max(0, walletStarsBalance - walletStarsLocked),
    [walletStarsBalance, walletStarsLocked],
  );

  return {
    walletTonBalance,
    walletTonLocked,
    walletStarsBalance,
    walletStarsLocked,
    tonAvailableBalance,
    starsAvailableBalance,
    refreshWalletBalances,
  };
}
