import styles from "@/styles/starrush.module.css";
import { PlayerBetView, RoundPhase } from "@/game/types";

const QUICK = [0.1, 0.5, 1, 2, 5, 10];

interface BetControlsProps {
  phase: RoundPhase;
  coefficient: number;
  betAmount: number;
  balance: number;
  minBet: number;
  maxBet: number;
  userActiveBet: PlayerBetView | null;
  queuedBet: PlayerBetView | null;
  onBetAmountChange: (v: number) => void;
  onPlaceOrQueue: () => void;
  onCashOut: () => void;
}

function hasActive(bet: PlayerBetView | null): bet is PlayerBetView {
  return !!bet && bet.status === "ACTIVE";
}

export function BetControls({
  phase,
  coefficient,
  betAmount,
  balance,
  minBet,
  maxBet,
  userActiveBet,
  queuedBet,
  onBetAmountChange,
  onPlaceOrQueue,
  onCashOut,
}: BetControlsProps) {
  const active = hasActive(userActiveBet);
  const canCash = phase === RoundPhase.RUNNING && active;

  const prev =
    phase === RoundPhase.PREPARING
      ? active ? userActiveBet.amount : 0
      : queuedBet?.amount ?? 0;
  const needed = Math.max(0, betAmount - prev);

  const validAmt = Number.isFinite(betAmount) && betAmount >= minBet && betAmount <= maxBet;
  const canAfford = balance + 1e-9 >= needed;

  const cashAmt = active ? userActiveBet.amount * coefficient : 0;

  /* ── button label + style ─────────────────────────────── */
  let btnLabel: string;
  let btnClass: string;
  let btnAction: () => void;
  let btnDisabled: boolean;

  if (canCash) {
    btnLabel = `Забрать ${cashAmt.toFixed(2)} TON`;
    btnClass = `${styles.actionButton} ${styles.btnCashout}`;
    btnAction = onCashOut;
    btnDisabled = false;
  } else if (phase === RoundPhase.RUNNING || phase === RoundPhase.CRASHED || phase === RoundPhase.RESETTING) {
    btnLabel = queuedBet
      ? `Ставка на след. раунд: ${queuedBet.amount.toFixed(2)} TON`
      : "Сделать ставку на след. раунд";
    btnClass = `${styles.actionButton} ${styles.btnQueue}`;
    btnAction = onPlaceOrQueue;
    btnDisabled = !validAmt || !canAfford;
  } else {
    btnLabel = active ? `Обновить ставку` : "Сделать ставку";
    btnClass = `${styles.actionButton} ${styles.btnBet}`;
    btnAction = onPlaceOrQueue;
    btnDisabled = !validAmt || !canAfford;
  }

  return (
    <section className={styles.betSection}>
      {/* amount input + quick chips — hide during cashout */}
      {!canCash && (
        <>
          <div className={styles.betAmountRow}>
            <div className={styles.amountInputWrap}>
              <input
                className={styles.amountInput}
                type="number"
                min={minBet}
                max={maxBet}
                step={0.1}
                inputMode="decimal"
                placeholder="Сумма"
                value={Number.isFinite(betAmount) ? betAmount : 0}
                onChange={(e) => {
                  const v = Number.parseFloat(e.target.value);
                  onBetAmountChange(Number.isFinite(v) ? v : 0);
                }}
              />
              <span className={styles.amountSuffix}>TON</span>
            </div>
          </div>

          <div className={styles.quickChips}>
            {QUICK.map((a) => (
              <button
                key={a}
                type="button"
                className={styles.quickChip}
                onClick={() => onBetAmountChange(a)}
              >
                {a}
              </button>
            ))}
          </div>
        </>
      )}

      {/* action button */}
      <button
        type="button"
        className={btnClass}
        disabled={btnDisabled}
        onClick={btnAction}
      >
        {btnLabel}
      </button>

      {/* queued hint */}
      {queuedBet && phase === RoundPhase.RUNNING && (
        <p className={styles.queueHint}>
          {queuedBet.amount.toFixed(2)} TON в очереди на след. раунд
        </p>
      )}
    </section>
  );
}
