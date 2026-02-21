"use client";

import { StarRushPanel } from "@/components/game/StarRushPanel";

interface CrashGameProps {
  wsUrl?: string;
  onError?: (code: string, message: string) => void;
  demoMode?: boolean;
  tonBalance?: number;
  starsBalance?: number;
  isActive?: boolean;
  onOnlineCountChange?: (count: number) => void;
  onWalletNeedsRefresh?: () => void;
}

export function CrashGame({
  tonBalance = 0,
  starsBalance = 0,
  isActive = true,
  onOnlineCountChange,
  onWalletNeedsRefresh,
}: CrashGameProps) {
  return (
    <StarRushPanel
      initialTonBalance={tonBalance}
      initialStarsBalance={starsBalance}
      isActive={isActive}
      onOnlineCountChange={onOnlineCountChange}
      onWalletNeedsRefresh={onWalletNeedsRefresh}
    />
  );
}

export default CrashGame;
