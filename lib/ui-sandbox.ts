"use client"

import { useEffect, useState, useSyncExternalStore } from "react"

import { roundCurrencyAmount } from "@/lib/currency"
import type { TelegramWebAppUser } from "@/lib/telegram-auth"

export type UiSandboxWalletCurrency = "TON" | "STARS"
export type UiSandboxLeaderboardSort = "gifts" | "ton" | "stars"

export type UiSandboxWalletView = {
  id: string
  currency: UiSandboxWalletCurrency
  balance: string
  lockedBalance: string
}

export type UiSandboxLedgerView = {
  id: string
  currency: UiSandboxWalletCurrency
  amount: string
  type: string
  status: string
  createdAt: string
}

export type UiSandboxReferralSummaryView = {
  invitedCount: number
  earnedTon: string
  earnedStars: string
  commissionRate: string
  referralLink: string
}

export type UiSandboxStakingAssetView = {
  assetId: "TON" | "STARS"
  assetType: "TON" | "STARS" | "GIFT"
  symbol: string
  icon: string
  walletBalance: string
  stakedPrincipal: string
  pendingReward: string
  claimableReward: string
  aprBps: number
  minStake: string
  canStake: boolean
  canClaim: boolean
  canUnstake: boolean
  pendingUnstake: {
    id: string
    amount: string
    status: string
    availableAt: string
    createdAt: string
  } | null
}

export type UiSandboxLeaderboardEntry = {
  rank: number
  userId: string
  username: string | null
  displayName: string
  avatarUrl: string | null
  gifts: number
  tonBalance: string
  starsBalance: string
}

type UiSandboxWalletState = {
  id: string
  currency: UiSandboxWalletCurrency
  balance: number
  lockedBalance: number
}

type UiSandboxLedgerState = {
  id: string
  currency: UiSandboxWalletCurrency
  amount: number
  type: string
  status: string
  createdAt: string
}

type UiSandboxStakingAssetState = {
  assetId: "TON" | "STARS"
  stakedPrincipal: number
  pendingReward: number
  claimableReward: number
  aprBps: number
  minStake: number
  pendingUnstake: {
    id: string
    amount: number
    status: string
    availableAt: string
    createdAt: string
  } | null
}

type UiSandboxState = {
  wallets: UiSandboxWalletState[]
  ledger: UiSandboxLedgerState[]
  referralSummary: {
    invitedCount: number
    earnedTon: number
    earnedStars: number
    commissionRate: number
    referralLink: string
  }
  stakingAssets: UiSandboxStakingAssetState[]
}

export type UiSandboxSnapshot = {
  wallets: UiSandboxWalletView[]
  ledger: UiSandboxLedgerView[]
  referralSummary: UiSandboxReferralSummaryView
  stakingAssets: UiSandboxStakingAssetView[]
  mockUser: TelegramWebAppUser
  dbUser: {
    id: string
    telegramId: string
  }
}

type UiSandboxActionResult<T> =
  | ({ ok: true } & T)
  | {
      ok: false
      error: string
    }

const UI_SANDBOX_QUERY_PARAM = "uiSandbox"
const UI_SANDBOX_ENABLED_BY_ENV = process.env.NEXT_PUBLIC_UI_SANDBOX === "1"
const UI_SANDBOX_USER_ID = "ui-sandbox-user"
const UI_SANDBOX_TELEGRAM_ID = "900000001"
const UI_SANDBOX_REFERRAL_LINK = "https://t.me/starrush_bot?startapp=ui_sandbox_preview"
const UI_SANDBOX_USER: TelegramWebAppUser = {
  id: Number(UI_SANDBOX_TELEGRAM_ID),
  username: "v0_preview",
  first_name: "V0",
  last_name: "Preview",
  language_code: "en",
}

const UI_SANDBOX_OTHER_LEADERBOARD_PLAYERS = [
  {
    userId: "leader-aurora",
    username: "aurora",
    displayName: "Aurora Lane",
    avatarUrl: null,
    gifts: 412,
    tonBalance: 54.2,
    starsBalance: 9800,
  },
  {
    userId: "leader-cosmos",
    username: "cosmos",
    displayName: "Cosmos Drift",
    avatarUrl: null,
    gifts: 295,
    tonBalance: 42.65,
    starsBalance: 12400,
  },
  {
    userId: "leader-nova",
    username: "nova",
    displayName: "Nova Vale",
    avatarUrl: null,
    gifts: 252,
    tonBalance: 31.18,
    starsBalance: 7200,
  },
  {
    userId: "leader-pulse",
    username: "pulse",
    displayName: "Pulse Orbit",
    avatarUrl: null,
    gifts: 188,
    tonBalance: 22.4,
    starsBalance: 5600,
  },
  {
    userId: "leader-zenith",
    username: "zenith",
    displayName: "Zenith Ray",
    avatarUrl: null,
    gifts: 161,
    tonBalance: 17.8,
    starsBalance: 4300,
  },
  {
    userId: "leader-comet",
    username: "comet",
    displayName: "Comet Flux",
    avatarUrl: null,
    gifts: 132,
    tonBalance: 14.9,
    starsBalance: 3800,
  },
] as const

const listeners = new Set<() => void>()
let nextIdCounter = 100

function formatAmount(currency: UiSandboxWalletCurrency, amount: number): string {
  const safeAmount = Math.max(0, amount)
  if (currency === "STARS") {
    return String(Math.floor(safeAmount))
  }
  return safeAmount.toFixed(2).replace(/\.?0+$/, "")
}

function createId(prefix: string) {
  nextIdCounter += 1
  return `${prefix}-${nextIdCounter}`
}

function getWalletStateByCurrency(currency: UiSandboxWalletCurrency, targetState = state) {
  const wallet = targetState.wallets.find((item) => item.currency === currency)
  if (!wallet) {
    throw new Error(`Missing sandbox wallet for currency ${currency}`)
  }
  return wallet
}

function buildStakingAssetView(
  asset: UiSandboxStakingAssetState,
  wallet: UiSandboxWalletState,
): UiSandboxStakingAssetView {
  return {
    assetId: asset.assetId,
    assetType: asset.assetId,
    symbol: asset.assetId === "TON" ? "TON" : "Stars",
    icon: asset.assetId === "TON" ? "/ton.svg" : "/stars.svg",
    walletBalance: formatAmount(asset.assetId, wallet.balance),
    stakedPrincipal: formatAmount(asset.assetId, asset.stakedPrincipal),
    pendingReward: formatAmount(asset.assetId, asset.pendingReward),
    claimableReward: formatAmount(asset.assetId, asset.claimableReward),
    aprBps: asset.aprBps,
    minStake: formatAmount(asset.assetId, asset.minStake),
    canStake: wallet.balance >= asset.minStake,
    canClaim: asset.claimableReward > 0,
    canUnstake: asset.stakedPrincipal > 0,
    pendingUnstake: asset.pendingUnstake
      ? {
          id: asset.pendingUnstake.id,
          amount: formatAmount(asset.assetId, asset.pendingUnstake.amount),
          status: asset.pendingUnstake.status,
          availableAt: asset.pendingUnstake.availableAt,
          createdAt: asset.pendingUnstake.createdAt,
        }
      : null,
  }
}

function buildSnapshot(source: UiSandboxState): UiSandboxSnapshot {
  return {
    wallets: source.wallets.map((wallet) => ({
      id: wallet.id,
      currency: wallet.currency,
      balance: formatAmount(wallet.currency, wallet.balance),
      lockedBalance: formatAmount(wallet.currency, wallet.lockedBalance),
    })),
    ledger: source.ledger.map((entry) => ({
      id: entry.id,
      currency: entry.currency,
      amount: formatAmount(entry.currency, entry.amount),
      type: entry.type,
      status: entry.status,
      createdAt: entry.createdAt,
    })),
    referralSummary: {
      invitedCount: source.referralSummary.invitedCount,
      earnedTon: formatAmount("TON", source.referralSummary.earnedTon),
      earnedStars: formatAmount("STARS", source.referralSummary.earnedStars),
      commissionRate: source.referralSummary.commissionRate.toFixed(2),
      referralLink: source.referralSummary.referralLink,
    },
    stakingAssets: source.stakingAssets.map((asset) =>
      buildStakingAssetView(asset, getWalletStateByCurrency(asset.assetId, source)),
    ),
    mockUser: UI_SANDBOX_USER,
    dbUser: {
      id: UI_SANDBOX_USER_ID,
      telegramId: UI_SANDBOX_TELEGRAM_ID,
    },
  }
}

function createInitialState(): UiSandboxState {
  return {
    wallets: [
      {
        id: "wallet-ton-sandbox",
        currency: "TON",
        balance: 24.75,
        lockedBalance: 0,
      },
      {
        id: "wallet-stars-sandbox",
        currency: "STARS",
        balance: 3200,
        lockedBalance: 0,
      },
    ],
    ledger: [
      {
        id: "ledger-1",
        currency: "TON",
        amount: 12.5,
        type: "DEPOSIT",
        status: "COMPLETED",
        createdAt: new Date(Date.now() - 1000 * 60 * 55).toISOString(),
      },
      {
        id: "ledger-2",
        currency: "STARS",
        amount: 450,
        type: "REFERRAL_BONUS",
        status: "COMPLETED",
        createdAt: new Date(Date.now() - 1000 * 60 * 140).toISOString(),
      },
      {
        id: "ledger-3",
        currency: "TON",
        amount: 3.2,
        type: "GAME_CASHOUT",
        status: "COMPLETED",
        createdAt: new Date(Date.now() - 1000 * 60 * 210).toISOString(),
      },
    ],
    referralSummary: {
      invitedCount: 12,
      earnedTon: 1.24,
      earnedStars: 380,
      commissionRate: 0.1,
      referralLink: UI_SANDBOX_REFERRAL_LINK,
    },
    stakingAssets: [
      {
        assetId: "TON",
        stakedPrincipal: 6.5,
        pendingReward: 0.38,
        claimableReward: 0.32,
        aprBps: 1420,
        minStake: 0.25,
        pendingUnstake: null,
      },
      {
        assetId: "STARS",
        stakedPrincipal: 850,
        pendingReward: 46,
        claimableReward: 38,
        aprBps: 1760,
        minStake: 50,
        pendingUnstake: null,
      },
    ],
  }
}

const state = createInitialState()
let snapshot = buildSnapshot(state)

function emitChange() {
  snapshot = buildSnapshot(state)
  listeners.forEach((listener) => listener())
}

function addLedgerEntry(currency: UiSandboxWalletCurrency, amount: number, type: string) {
  state.ledger = [
    {
      id: createId("ledger"),
      currency,
      amount: roundCurrencyAmount(currency, amount),
      type,
      status: "COMPLETED",
      createdAt: new Date().toISOString(),
    },
    ...state.ledger,
  ].slice(0, 20)
}

function sortLeaderboardEntries(
  entries: Array<Omit<UiSandboxLeaderboardEntry, "rank">>,
  sortBy: UiSandboxLeaderboardSort,
) {
  const metric = (entry: Omit<UiSandboxLeaderboardEntry, "rank">) => {
    if (sortBy === "gifts") return entry.gifts
    if (sortBy === "ton") return Number.parseFloat(entry.tonBalance)
    return Number.parseFloat(entry.starsBalance)
  }

  return [...entries]
    .sort((a, b) => {
      const metricDiff = metric(b) - metric(a)
      if (metricDiff !== 0) return metricDiff
      return a.displayName.localeCompare(b.displayName)
    })
    .map((entry, index) => ({
      ...entry,
      rank: index + 1,
    }))
}

function buildCurrentUserLeaderboardEntry(currentSnapshot: UiSandboxSnapshot): Omit<UiSandboxLeaderboardEntry, "rank"> {
  const tonWallet = currentSnapshot.wallets.find((wallet) => wallet.currency === "TON")
  const starsWallet = currentSnapshot.wallets.find((wallet) => wallet.currency === "STARS")
  const tonStaked = currentSnapshot.stakingAssets.find((asset) => asset.assetId === "TON")
  const starsStaked = currentSnapshot.stakingAssets.find((asset) => asset.assetId === "STARS")

  const tonValue =
    Number.parseFloat(tonWallet?.balance ?? "0") +
    Number.parseFloat(tonStaked?.stakedPrincipal ?? "0") +
    Number.parseFloat(tonStaked?.claimableReward ?? "0")
  const starsValue =
    Number.parseFloat(starsWallet?.balance ?? "0") +
    Number.parseFloat(starsStaked?.stakedPrincipal ?? "0") +
    Number.parseFloat(starsStaked?.claimableReward ?? "0")

  return {
    userId: currentSnapshot.dbUser.id,
    username: currentSnapshot.mockUser.username ?? null,
    displayName: `${currentSnapshot.mockUser.first_name ?? "V0"} ${currentSnapshot.mockUser.last_name ?? "Preview"}`.trim(),
    avatarUrl: null,
    gifts: currentSnapshot.referralSummary.invitedCount * 14 + 80,
    tonBalance: formatAmount("TON", tonValue),
    starsBalance: formatAmount("STARS", starsValue),
  }
}

function readUiSandboxQueryFlag(): boolean {
  if (typeof window === "undefined") return false
  const params = new URLSearchParams(window.location.search)
  const rawValue = params.get(UI_SANDBOX_QUERY_PARAM)?.trim().toLowerCase()
  return rawValue === "1" || rawValue === "true"
}

export function isUiSandboxEnabled(): boolean {
  if (UI_SANDBOX_ENABLED_BY_ENV) return true
  return readUiSandboxQueryFlag()
}

export function useUiSandboxMode() {
  const [enabled, setEnabled] = useState(() => isUiSandboxEnabled())

  useEffect(() => {
    if (typeof window === "undefined") return undefined

    const sync = () => setEnabled(isUiSandboxEnabled())

    sync()
    window.addEventListener("popstate", sync)
    return () => window.removeEventListener("popstate", sync)
  }, [])

  return enabled
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot() {
  return snapshot
}

export function useUiSandboxSnapshot() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function getUiSandboxSnapshot() {
  return snapshot
}

export function getUiSandboxAuthPayload() {
  return {
    user: snapshot.mockUser,
    dbUser: snapshot.dbUser,
    wallets: snapshot.wallets,
  }
}

export function getUiSandboxWarmData() {
  return {
    wallets: snapshot.wallets,
    referralSummary: snapshot.referralSummary,
  }
}

export function getUiSandboxLeaderboard(sortBy: UiSandboxLeaderboardSort, limit = 50) {
  const currentUserEntry = buildCurrentUserLeaderboardEntry(snapshot)
  const baseEntries: Array<Omit<UiSandboxLeaderboardEntry, "rank">> = [
    currentUserEntry,
    ...UI_SANDBOX_OTHER_LEADERBOARD_PLAYERS.map((entry) => ({
      userId: entry.userId,
      username: entry.username,
      displayName: entry.displayName,
      avatarUrl: entry.avatarUrl,
      gifts: entry.gifts,
      tonBalance: formatAmount("TON", entry.tonBalance),
      starsBalance: formatAmount("STARS", entry.starsBalance),
    })),
  ]

  const ranked = sortLeaderboardEntries(baseEntries, sortBy)
  const items = ranked.slice(0, limit)
  const yourEntry = ranked.find((entry) => entry.userId === snapshot.dbUser.id) ?? null

  return {
    sortBy,
    totalPlayers: ranked.length,
    yourRank: yourEntry?.rank ?? null,
    yourEntry,
    items,
  }
}

export function refreshUiSandboxSnapshot() {
  emitChange()
}

export function depositUiSandboxWallet(input: {
  amount: number
  currency: UiSandboxWalletCurrency
  type?: string
}) {
  const amount = roundCurrencyAmount(input.currency, input.amount)
  if (amount <= 0) {
    return { ok: false, error: "INVALID_AMOUNT" } as const
  }

  const wallet = getWalletStateByCurrency(input.currency)
  wallet.balance = roundCurrencyAmount(input.currency, wallet.balance + amount)
  addLedgerEntry(input.currency, amount, input.type ?? "DEPOSIT")
  emitChange()

  return {
    ok: true,
    wallet: snapshot.wallets.find((entry) => entry.currency === input.currency) ?? null,
  } as const
}

export function withdrawUiSandboxWallet(input: {
  amount: number
  currency: UiSandboxWalletCurrency
}) {
  const amount = roundCurrencyAmount(input.currency, input.amount)
  if (amount <= 0) {
    return { ok: false, error: "INVALID_AMOUNT" } as const
  }

  const wallet = getWalletStateByCurrency(input.currency)
  if (wallet.balance < amount) {
    return { ok: false, error: "INSUFFICIENT_BALANCE" } as const
  }

  wallet.balance = roundCurrencyAmount(input.currency, wallet.balance - amount)
  addLedgerEntry(input.currency, amount, "WITHDRAW")
  emitChange()

  return {
    ok: true,
    wallet: snapshot.wallets.find((entry) => entry.currency === input.currency) ?? null,
  } as const
}

function getStakingAssetState(assetId: "TON" | "STARS") {
  const asset = state.stakingAssets.find((entry) => entry.assetId === assetId)
  if (!asset) {
    throw new Error(`Missing sandbox staking asset ${assetId}`)
  }
  return asset
}

export function claimUiSandboxStake(assetId: "TON" | "STARS"): UiSandboxActionResult<{
  claimedAmount: string
  asset: UiSandboxStakingAssetView
}> {
  const asset = getStakingAssetState(assetId)
  const amount = roundCurrencyAmount(assetId, asset.claimableReward)

  if (amount > 0) {
    const wallet = getWalletStateByCurrency(assetId)
    wallet.balance = roundCurrencyAmount(assetId, wallet.balance + amount)
    asset.claimableReward = 0
    asset.pendingReward = roundCurrencyAmount(assetId, Math.max(0, asset.pendingReward - amount))
    addLedgerEntry(assetId, amount, "STAKING_CLAIM")
  }

  emitChange()

  return {
    ok: true,
    claimedAmount: formatAmount(assetId, amount),
    asset: snapshot.stakingAssets.find((entry) => entry.assetId === assetId)!,
  }
}

export function stakeUiSandboxAsset(input: {
  assetId: "TON" | "STARS"
  amount: number
}): UiSandboxActionResult<{
  asset: UiSandboxStakingAssetView
}> {
  const amount = roundCurrencyAmount(input.assetId, input.amount)
  const asset = getStakingAssetState(input.assetId)
  const wallet = getWalletStateByCurrency(input.assetId)

  if (amount <= 0) {
    return { ok: false, error: "INVALID_AMOUNT" }
  }
  if (input.assetId === "STARS" && !Number.isInteger(input.amount)) {
    return { ok: false, error: "INTEGER_AMOUNT_REQUIRED" }
  }
  if (amount < asset.minStake) {
    return { ok: false, error: "MIN_STAKE_NOT_REACHED" }
  }
  if (wallet.balance < amount) {
    return { ok: false, error: "INSUFFICIENT_BALANCE" }
  }

  wallet.balance = roundCurrencyAmount(input.assetId, wallet.balance - amount)
  asset.stakedPrincipal = roundCurrencyAmount(input.assetId, asset.stakedPrincipal + amount)
  asset.pendingReward = roundCurrencyAmount(input.assetId, asset.pendingReward + amount * 0.02)
  asset.claimableReward = roundCurrencyAmount(input.assetId, asset.claimableReward + amount * 0.01)
  addLedgerEntry(input.assetId, amount, "STAKING_STAKE")
  emitChange()

  return {
    ok: true,
    asset: snapshot.stakingAssets.find((entry) => entry.assetId === input.assetId)!,
  }
}

export function unstakeUiSandboxAsset(input: {
  assetId: "TON" | "STARS"
  amount: number
}): UiSandboxActionResult<{
  asset: UiSandboxStakingAssetView
}> {
  const amount = roundCurrencyAmount(input.assetId, input.amount)
  const asset = getStakingAssetState(input.assetId)
  const wallet = getWalletStateByCurrency(input.assetId)

  if (amount <= 0) {
    return { ok: false, error: "INVALID_AMOUNT" }
  }
  if (input.assetId === "STARS" && !Number.isInteger(input.amount)) {
    return { ok: false, error: "INTEGER_AMOUNT_REQUIRED" }
  }
  if (asset.stakedPrincipal < amount) {
    return { ok: false, error: "INSUFFICIENT_STAKED_BALANCE" }
  }

  asset.stakedPrincipal = roundCurrencyAmount(input.assetId, asset.stakedPrincipal - amount)
  wallet.balance = roundCurrencyAmount(input.assetId, wallet.balance + amount)
  asset.pendingUnstake = null
  addLedgerEntry(input.assetId, amount, "STAKING_UNSTAKE")
  emitChange()

  return {
    ok: true,
    asset: snapshot.stakingAssets.find((entry) => entry.assetId === input.assetId)!,
  }
}

export function placeUiSandboxRushBet(input: {
  amount: number
  currency: UiSandboxWalletCurrency
}) {
  const amount = roundCurrencyAmount(input.currency, input.amount)
  if (amount <= 0) {
    return { ok: false, error: "INVALID_AMOUNT" } as const
  }

  const wallet = getWalletStateByCurrency(input.currency)
  if (wallet.balance < amount) {
    return { ok: false, error: "INSUFFICIENT_BALANCE" } as const
  }

  wallet.balance = roundCurrencyAmount(input.currency, wallet.balance - amount)
  addLedgerEntry(input.currency, amount, "GAME_BET")
  emitChange()

  return { ok: true } as const
}

export function cashOutUiSandboxRushBet(input: {
  payout: number
  currency: UiSandboxWalletCurrency
}) {
  const payout = roundCurrencyAmount(input.currency, input.payout)
  if (payout <= 0) {
    return { ok: false, error: "INVALID_AMOUNT" } as const
  }

  const wallet = getWalletStateByCurrency(input.currency)
  wallet.balance = roundCurrencyAmount(input.currency, wallet.balance + payout)
  addLedgerEntry(input.currency, payout, "GAME_CASHOUT")
  emitChange()

  return { ok: true } as const
}
