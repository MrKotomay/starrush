"use client";

import { memo, useCallback, useMemo } from "react";
import { FixedSizeList, ListChildComponentProps } from "react-window";
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

function computePayout(row: PlayerBetView): number {
  if (row.status === "CASHED_OUT") return row.payout ?? row.amount * (row.cashoutMultiplier ?? 1);
  if (row.status === "ACTIVE") return row.amount;
  if (row.status === "LOST") return 0;
  return row.amount;
}

function payoutClass(status: BetStatus): string {
  if (status === "CASHED_OUT") return "";
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
}

const BetRow = memo(
  function BetRow({ row }: BetRowProps) {
    const pay = useMemo(() => computePayout(row), [row]);
    const bgColor = useMemo(() => avatarColor(row.username), [row.username]);
    const userInitials = useMemo(() => initials(row.username), [row.username]);
    const cashMult = row.cashoutMultiplier;

    return (
      <article className={`${styles.betRow} ${row.isCurrentUser ? styles.betRowUser : ""} ${rowClass(row.status)}`}>
        <div className={styles.betAvatar} style={{ background: bgColor }}>
          {userInitials}
        </div>

        <div className={styles.betInfo}>
          <p className={styles.betName}>
            {row.isCurrentUser ? `${row.username} (\u0412\u044b)` : row.username}
          </p>
          <p className={styles.betMeta}>
            <img src="/ton.svg" alt="" className={styles.tonIconSmall} />
            <span>{row.amount.toFixed(2)}</span>
            {cashMult !== null && <span className={styles.betMultiplier}> x{cashMult.toFixed(2)}</span>}
          </p>
        </div>

        <div className={`${styles.betPayout} ${payoutClass(row.status)}`}>
          <img src="/ton.svg" alt="" className={styles.tonIconSmall} />
          <span>{row.status === "LOST" ? "0.00" : pay.toFixed(2)}</span>
        </div>
      </article>
    );
  },
  (prev, next) => prev.row === next.row,
);

interface RowData {
  rows: PlayerBetView[];
}

function VirtualizedRow({
  index,
  style,
  data,
}: ListChildComponentProps<RowData>) {
  const row = data.rows[index];
  return (
    <div style={style}>
      <BetRow row={row} />
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
}

export const PlayersBetsList = memo(function PlayersBetsList({
  players,
  queuedBet,
  phase = RoundPhase.PREPARING,
}: PlayersBetsListProps) {
  const sortedPlayers = useMemo(() => sortRowsWithCurrentUserFirst(players), [players]);
  const allRows = useMemo(
    () => (queuedBet ? [queuedBet, ...sortedPlayers] : sortedPlayers),
    [queuedBet, sortedPlayers],
  );
  const emptyText =
    phase === RoundPhase.RUNNING
      ? "\u0421\u0442\u0430\u0432\u043e\u043a \u043f\u043e\u043a\u0430 \u043d\u0435\u0442"
      : phase === RoundPhase.PREPARING
        ? "\u041f\u043e\u0434\u0433\u043e\u0442\u043e\u0432\u043a\u0430 \u043a \u0440\u0430\u0443\u043d\u0434\u0443"
        : "\u041e\u0436\u0438\u0434\u0430\u043d\u0438\u0435 \u0441\u043b\u0435\u0434\u0443\u044e\u0449\u0435\u0433\u043e \u0440\u0430\u0443\u043d\u0434\u0430";
  const queuedHint = queuedBet
    ? phase === RoundPhase.PREPARING
      ? "\u0421\u0442\u0430\u0432\u043a\u0430 \u043f\u043e\u0441\u0442\u0430\u0432\u043b\u0435\u043d\u0430 \u043d\u0430 \u0441\u043b\u0435\u0434\u0443\u044e\u0449\u0438\u0439 \u0440\u0430\u0443\u043d\u0434"
      : "\u0421\u0442\u0430\u0432\u043a\u0430 \u043e\u0436\u0438\u0434\u0430\u0435\u0442 \u0441\u043b\u0435\u0434\u0443\u044e\u0449\u0438\u0439 \u0440\u0430\u0443\u043d\u0434"
    : null;
  const listHeight = useMemo(
    () => Math.min(MAX_LIST_HEIGHT, Math.max(ROW_HEIGHT, allRows.length * ROW_HEIGHT)),
    [allRows.length],
  );
  const rowData = useMemo<RowData>(() => ({ rows: allRows }), [allRows]);
  const getItemKey = useCallback(itemKey, []);

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

