import {
  RoundEventType,
  RoundPlayerStatus,
  RoundStatus,
} from "@prisma/client";
import { db } from "@/lib/db";
import { gameConfig } from "@/lib/game-config";
import { buildPublicPlayerProfile } from "@/lib/game/public-player";
import { redis } from "@/lib/redis";
import {
  BACKEND_ROUND_STATUSES,
  BackendMyBetState,
  BackendPlayerBetStatus,
  CurrentRoundSnapshotResponse,
} from "@/lib/game/backend-round-types";
import { DEFAULT_CLIENT_SEED } from "@/services/game-fairness.service";
import { REDIS_KEYS } from "@/services/game-round.service";
import { computeRoundMultiplier } from "@/lib/round-multiplier";

const WAITING_PHASE_MS = Number(process.env.ROUND_WAITING_MS ?? 5000);
const COOLDOWN_PHASE_MS = Number(process.env.ROUND_COOLDOWN_MS ?? 3000);
const HISTORY_LIMIT = 14;
const PLAYERS_LIMIT = 300;

function toNumber(value: { toString(): string } | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const asNumber = typeof value === "number" ? value : Number.parseFloat(value.toString());
  if (!Number.isFinite(asNumber)) return null;
  return asNumber;
}

function roundTo2(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeRoundStatus(value: string): CurrentRoundSnapshotResponse["status"] {
  if (BACKEND_ROUND_STATUSES.includes(value as CurrentRoundSnapshotResponse["status"])) {
    return value as CurrentRoundSnapshotResponse["status"];
  }
  return "WAITING";
}

function mapPlayerStatus(
  roundStatus: RoundStatus,
  playerStatus: RoundPlayerStatus,
): BackendPlayerBetStatus {
  if (playerStatus === RoundPlayerStatus.CASHED_OUT) return "CASHED_OUT";
  if (playerStatus === RoundPlayerStatus.LOST) return "LOST";
  if (roundStatus === RoundStatus.CRASHED || roundStatus === RoundStatus.FINISHED) return "LOST";
  return "ACTIVE";
}

async function resolveCurrentRound() {
  if (redis) {
    const currentRoundId = await redis.get(REDIS_KEYS.currentRound);
    if (currentRoundId) {
      const roundById = await db.round.findUnique({ where: { id: currentRoundId } });
      if (roundById) return roundById;
    }
  }

  const activeRound = await db.round.findFirst({
    where: { status: { in: [RoundStatus.WAITING, RoundStatus.RUNNING, RoundStatus.CRASHED] } },
    orderBy: { createdAt: "desc" },
  });
  if (activeRound) return activeRound;

  return db.round.findFirst({
    orderBy: { createdAt: "desc" },
  });
}

async function resolveCurrentMultiplier(
  roundId: string,
  status: RoundStatus,
  startedAt: Date | null,
  crashMultiplier: number | null,
) {
  if (status === RoundStatus.RUNNING) {
    if (redis) {
      const fromRedis = await redis.get(REDIS_KEYS.multiplier(roundId));
      const parsed = fromRedis ? Number.parseFloat(fromRedis) : Number.NaN;
      if (Number.isFinite(parsed)) {
        return Math.max(1, parsed);
      }
    }

    if (startedAt) {
      const elapsedSeconds = Math.max(0, (Date.now() - startedAt.getTime()) / 1000);
      return computeRoundMultiplier(elapsedSeconds);
    }
  }

  if ((status === RoundStatus.CRASHED || status === RoundStatus.FINISHED) && crashMultiplier !== null) {
    return Math.max(1, crashMultiplier);
  }

  return 1;
}

async function resolveCrashAt(roundId: string, status: RoundStatus): Promise<number | null> {
  if (status !== RoundStatus.CRASHED && status !== RoundStatus.FINISHED) {
    return null;
  }

  const crashEvent = await db.roundEventLog.findFirst({
    where: { roundId, eventType: RoundEventType.ROUND_CRASHED },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  return crashEvent?.createdAt.getTime() ?? null;
}

export async function getCurrentRoundSnapshot(
  userId: string,
): Promise<CurrentRoundSnapshotResponse | null> {
  const round = await resolveCurrentRound();
  if (!round) return null;

  const crashMultiplier = toNumber(round.crashMultiplier);
  const [crashAt, players, history, currentMultiplier, queuedBet] = await Promise.all([
    resolveCrashAt(round.id, round.status),
    db.roundPlayer.findMany({
      where: { roundId: round.id },
      include: {
        user: {
          select: {
            username: true,
            firstName: true,
            lastName: true,
            photoUrl: true,
          },
        },
      },
      orderBy: [{ betAmount: "desc" }, { createdAt: "asc" }],
      take: PLAYERS_LIMIT,
    }),
    db.round.findMany({
      where: {
        status: { in: [RoundStatus.CRASHED, RoundStatus.FINISHED] },
        crashMultiplier: { not: null },
      },
      orderBy: { createdAt: "desc" },
      take: HISTORY_LIMIT,
      select: {
        id: true,
        crashMultiplier: true,
        finishedAt: true,
        createdAt: true,
        serverSeedHash: true,
        serverSeed: true,
        fairnessVersion: true,
        fairnessNonce: true,
      },
    }),
    resolveCurrentMultiplier(round.id, round.status, round.startedAt, crashMultiplier),
    db.roundQueuedBet.findUnique({
      where: { userId },
      select: {
        id: true,
        userId: true,
        currency: true,
        betAmount: true,
        createdAt: true,
        user: {
          select: {
            username: true,
            firstName: true,
            lastName: true,
            photoUrl: true,
          },
        },
      },
    }),
  ]);

  const serverTime = Date.now();
  const waitingEndsAt =
    round.status === RoundStatus.WAITING
      ? round.createdAt.getTime() + WAITING_PHASE_MS
      : null;
  const endsAt =
    round.status === RoundStatus.WAITING
      ? waitingEndsAt
      : round.status === RoundStatus.CRASHED
        ? crashAt !== null
          ? crashAt + COOLDOWN_PHASE_MS
          : null
        : round.status === RoundStatus.FINISHED
          ? round.finishedAt?.getTime() ?? null
          : null;
  const shouldRevealServerSeed =
    round.status === RoundStatus.CRASHED || round.status === RoundStatus.FINISHED;

  const mappedPlayers = players.map((player) => {
    const publicPlayer = buildPublicPlayerProfile({
      userId: player.userId,
      username: player.user.username,
      firstName: player.user.firstName,
      lastName: player.user.lastName,
      avatarUrl: player.user.photoUrl,
    });
    const amount = toNumber(player.betAmount) ?? 0;
    const cashoutMultiplier = toNumber(player.cashoutMultiplier);
    const mappedStatus = mapPlayerStatus(round.status, player.status);
    const payout =
      mappedStatus === "CASHED_OUT" && cashoutMultiplier !== null
        ? roundTo2(amount * cashoutMultiplier)
        : null;

    return {
      id: player.id,
      userId: player.userId,
      displayName: publicPlayer.displayName,
      username: publicPlayer.username,
      isHidden: publicPlayer.isHidden,
      visibleToCurrentUserOnly: publicPlayer.visibleToCurrentUserOnly,
      avatarUrl: publicPlayer.avatarUrl,
      amount,
      currency: player.currency,
      status: mappedStatus,
      isCurrentUser: player.userId === userId,
      placedAt: player.createdAt.getTime(),
      cashoutMultiplier,
      payout,
      autoCashoutAt: null,
    };
  });

  const myPlayer = mappedPlayers.find((entry) => entry.userId === userId) ?? null;
  const myBet: BackendMyBetState | null = myPlayer
    ? {
        userId,
        roundId: round.id,
        amount: myPlayer.amount,
        currency: myPlayer.currency,
        status: myPlayer.status,
        placedAt: myPlayer.placedAt,
        cashoutMultiplier: myPlayer.cashoutMultiplier,
        payout: myPlayer.payout,
        lockedStake: myPlayer.status === "ACTIVE" ? myPlayer.amount : 0,
      }
    : null;
  const mappedQueuedBet = queuedBet
    ? (() => {
        const publicPlayer = buildPublicPlayerProfile({
          userId: queuedBet.userId,
          username: queuedBet.user.username,
          firstName: queuedBet.user.firstName,
          lastName: queuedBet.user.lastName,
          avatarUrl: queuedBet.user.photoUrl,
        });
        return {
          id: queuedBet.id,
          userId: queuedBet.userId,
          displayName: publicPlayer.displayName,
          username: publicPlayer.username,
          isHidden: publicPlayer.isHidden,
          visibleToCurrentUserOnly: publicPlayer.visibleToCurrentUserOnly,
          avatarUrl: publicPlayer.avatarUrl,
          amount: toNumber(queuedBet.betAmount) ?? 0,
          currency: queuedBet.currency,
          placedAt: queuedBet.createdAt.getTime(),
        };
      })()
    : null;
  const canPlaceBet =
    round.status === RoundStatus.WAITING
      ? myPlayer?.status !== "ACTIVE"
      : round.status === RoundStatus.RUNNING
        ? mappedQueuedBet === null
        : false;

  return {
    version: 1,
    serverTime,
    roundId: round.id,
    status: normalizeRoundStatus(round.status),
    currentMultiplier,
    startedAt: round.startedAt?.getTime() ?? null,
    crashAt,
    endsAt,
    waitingEndsAt,
    crashMultiplier,
    fairness: {
      serverSeedHash: round.serverSeedHash,
      fairnessVersion: round.fairnessVersion,
      fairnessNonce: round.fairnessNonce,
      clientSeed: round.clientSeed,
      effectiveClientSeed: round.clientSeed ?? DEFAULT_CLIENT_SEED,
      serverSeed: shouldRevealServerSeed ? round.serverSeed ?? null : null,
      houseEdge: toNumber(round.houseEdge) ?? gameConfig.houseEdge,
      maxCrash: toNumber(round.maxCrash) ?? gameConfig.maxCrash,
    },
    players: mappedPlayers,
    queuedBet: mappedQueuedBet,
    history: history.map((entry) => ({
      roundId: entry.id,
      crashAt: toNumber(entry.crashMultiplier) ?? 1,
      timestamp: (entry.finishedAt ?? entry.createdAt).getTime(),
      serverSeedHash: entry.serverSeedHash,
      serverSeed: entry.serverSeed ?? null,
      fairnessVersion: entry.fairnessVersion ?? null,
      fairnessNonce: entry.fairnessNonce ?? null,
    })),
    myBet,
    canPlaceBet,
    canCashOut: round.status === RoundStatus.RUNNING && myPlayer?.status === "ACTIVE",
  };
}
