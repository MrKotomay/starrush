"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { FixedSizeList, ListChildComponentProps } from "react-window";

import { currencyIconPath, formatCurrencyAmount } from "@/lib/currency";
import { useI18n } from "@/lib/i18n"
import styles from "@/styles/starrush.module.css";
import { BetStatus, PlayerBetView, RoundPhase } from "@/game/types";
import { avatarPalette } from "@/theme/colors";

const ROW_HEIGHT = 68;
const MAX_LIST_HEIGHT = 340;

const AVATAR_COLORS = [...avatarPalette];

function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function getEffectiveStatus(row: PlayerBetView, phase: RoundPhase): BetStatus {
  if (
    row.status === "ACTIVE" &&
    (phase === RoundPhase.CRASHED || phase === RoundPhase.RESETTING)
  ) {
    return "LOST";
  }
  return row.status;
}

function computePayout(row: PlayerBetView, status: BetStatus, liveCoefficient: number, phase: RoundPhase): number {
  if (status === "CASHED_OUT") return row.payout ?? row.amount * (row.cashoutMultiplier ?? 1);
  if (status === "ACTIVE" && phase === RoundPhase.RUNNING) return row.amount * Math.max(1, liveCoefficient);
  if (status === "ACTIVE") return row.amount;
  if (status === "LOST") return 0;
  return row.amount;
}

function payoutClass(status: BetStatus): string {
  if (status === "CASHED_OUT") return styles.betPayoutWon;
  if (status === "LOST") return styles.betPayoutLost;
  if (status === "ACTIVE") return styles.betPayoutActive;
  return styles.betPayoutQueued;
}

function rowClass(status: BetStatus): string {
  if (status === "QUEUED") return styles.betRowQueued;
  return "";
}

function sortRowsWithCurrentUserFirst(rows: PlayerBetView[]): PlayerBetView[] {
  return [...rows].sort((a, b) => {
    if (a.isCurrentUser !== b.isCurrentUser) {
      return a.isCurrentUser ? -1 : 1;
    }
    if (a.amount !== b.amount) return b.amount - a.amount;
    if (a.placedAt !== b.placedAt) return a.placedAt - b.placedAt;
    return a.id.localeCompare(b.id);
  });
}

interface BetRowProps {
  row: PlayerBetView;
  phase: RoundPhase;
  liveCoefficient: number;
}

const BetRow = memo(
  function BetRow({ row, phase, liveCoefficient }: BetRowProps) {
    const { t } = useI18n()
    const effectiveStatus = useMemo(() => getEffectiveStatus(row, phase), [phase, row]);
    const pay = useMemo(
      () => computePayout(row, effectiveStatus, liveCoefficient, phase),
      [effectiveStatus, liveCoefficient, phase, row],
    );
    const bgColor = useMemo(() => avatarColor(row.username), [row.username]);
    const userInitials = useMemo(() => initials(row.username), [row.username]);
    const liveMultiplier = useMemo(() => {
      if (effectiveStatus === "ACTIVE" && phase === RoundPhase.RUNNING) {
        return liveCoefficient;
      }
      return row.cashoutMultiplier;
    }, [effectiveStatus, liveCoefficient, phase, row.cashoutMultiplier]);
    const currencyIcon = currencyIconPath(row.currency);
    const amountLabel = formatCurrencyAmount(row.currency, row.amount);
    const payoutLabel =
      effectiveStatus === "LOST"
        ? formatCurrencyAmount(row.currency, 0)
        : formatCurrencyAmount(row.currency, pay, { compactStars: false });
    const metaClass =
      effectiveStatus === "CASHED_OUT"
        ? styles.betMetaWon
        : effectiveStatus === "LOST"
          ? styles.betMetaLost
          : phase === RoundPhase.RUNNING && effectiveStatus === "ACTIVE"
            ? styles.betMetaLive
            : "";

    return (
      <article className={`${styles.betRow} ${row.isCurrentUser ? styles.betRowUser : ""} ${rowClass(effectiveStatus)}`}>
        <div className={styles.betAvatar} style={{ background: bgColor }}>
          {userInitials}
        </div>

        <div className={styles.betInfo}>
          <p className={styles.betName}>
            {row.isCurrentUser ? `${row.username} (${t("rush.players.you")})` : row.username}
          </p>
          <p className={`${styles.betMeta} ${metaClass}`}>
            <img src={currencyIcon} alt="" className={styles.currencyIconSmall} />
            <span>{amountLabel}</span>
            {liveMultiplier !== null ? (
              <span className={styles.betMultiplier}>{` x${liveMultiplier.toFixed(2)}`}</span>
            ) : null}
          </p>
        </div>

        <div className={`${styles.betPayout} ${payoutClass(effectiveStatus)}`}>
          <img src={currencyIcon} alt="" className={styles.currencyIconSmall} />
          <span>{payoutLabel}</span>
        </div>
      </article>
    );
  },
  (prev, next) =>
    prev.row === next.row &&
    prev.phase === next.phase &&
    Math.abs(prev.liveCoefficient - next.liveCoefficient) < 0.0001,
);

interface RowData {
  rows: PlayerBetView[];
  phase: RoundPhase;
  liveCoefficient: number;
}

function VirtualizedRow({
  index,
  style,
  data,
}: ListChildComponentProps<RowData>) {
  const row = data.rows[index];
  return (
    <div style={style}>
      <BetRow row={row} phase={data.phase} liveCoefficient={data.liveCoefficient} />
    </div>
  );
}

function itemKey(index: number, data: RowData): string {
  return data.rows[index]?.id ?? `bet-${index}`;
}

interface PlayersBetsListProps {
  players: PlayerBetView[];
  queuedBet: PlayerBetView | null;
  phase?: RoundPhase;
  getLiveCoefficient: () => number;
}

export const PlayersBetsList = memo(function PlayersBetsList({
  players,
  queuedBet,
  phase = RoundPhase.PREPARING,
  getLiveCoefficient,
}: PlayersBetsListProps) {
  const { t } = useI18n()
  const [liveCoefficient, setLiveCoefficient] = useState(() => Math.max(1, getLiveCoefficient()));
  const sortedPlayers = useMemo(() => sortRowsWithCurrentUserFirst(players), [players]);
  const allRows = useMemo(
    () => (queuedBet ? [queuedBet, ...sortedPlayers] : sortedPlayers),
    [queuedBet, sortedPlayers],
  );
  const emptyText =
    phase === RoundPhase.RUNNING
      ? t("rush.players.noneRunning")
      : phase === RoundPhase.PREPARING
        ? t("rush.players.nonePreparing")
        : t("rush.players.noneWaiting");
  const queuedHint = queuedBet
    ? phase === RoundPhase.PREPARING
      ? t("rush.players.queuedPreparing")
      : t("rush.players.queuedWaiting")
    : null;
  const listHeight = useMemo(
    () => Math.min(MAX_LIST_HEIGHT, Math.max(ROW_HEIGHT, allRows.length * ROW_HEIGHT)),
    [allRows.length],
  );
  const rowData = useMemo<RowData>(
    () => ({ rows: allRows, phase, liveCoefficient }),
    [allRows, liveCoefficient, phase],
  );
  const getItemKey = useCallback(itemKey, []);

  useEffect(() => {
    setLiveCoefficient(Math.max(1, getLiveCoefficient()));
    if (phase !== RoundPhase.RUNNING) return;

    const timer = window.setInterval(() => {
      setLiveCoefficient(Math.max(1, getLiveCoefficient()));
    }, 120);

    return () => window.clearInterval(timer);
  }, [getLiveCoefficient, phase]);

  return (
    <section className={styles.betsSection}>
      {allRows.length === 0 ? (
        <div className={styles.betsList}>
          <p
            style={{
              textAlign: "center",
              padding: "16px 12px",
              color: "hsl(var(--muted-foreground))",
              opacity: 0.7,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {emptyText}
          </p>
        </div>
      ) : (
        <FixedSizeList
          className={styles.betsList}
          height={listHeight}
          itemCount={allRows.length}
          itemData={rowData}
          itemKey={getItemKey}
          itemSize={ROW_HEIGHT}
          overscanCount={6}
          style={{ WebkitOverflowScrolling: "touch", contain: "strict" }}
          width="100%"
        >
          {VirtualizedRow}
        </FixedSizeList>
      )}
      {queuedHint ? <p className={styles.queuedRoundHint}>{queuedHint}</p> : null}
    </section>
  );
});

