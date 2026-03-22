"use client";

import { StarRushPanel } from "@/components/game/StarRushPanel";
import { StarRushSandboxPanel } from "@/components/game/StarRushSandboxPanel";

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
  demoMode = false,
  tonBalance = 0,
  starsBalance = 0,
  isActive = true,
  onOnlineCountChange,
  onWalletNeedsRefresh,
}: CrashGameProps) {
  if (demoMode) {
    return (
      <StarRushSandboxPanel
        initialTonBalance={tonBalance}
        initialStarsBalance={starsBalance}
        isActive={isActive}
        onOnlineCountChange={onOnlineCountChange}
        onWalletNeedsRefresh={onWalletNeedsRefresh}
      />
    );
  }

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
