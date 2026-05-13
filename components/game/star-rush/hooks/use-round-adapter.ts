"use client";

import { useEffect, useRef, useState, type MutableRefObject } from "react";

import type { StarRushGame } from "@/game/StarRushGame";
import { type RoundSnapshot } from "@/game/types";
import {
  BackendRoundStateAdapter,
  type BackendRoundConnectionState,
} from "@/lib/game/backend-round-state-adapter";

import {
  INITIAL_CONNECTION_STATE,
  INITIAL_SNAPSHOT,
  MIN_RENDER_SURFACE_PX,
  cloneSnapshotForPhaser,
  hasStructuralSnapshotChange,
} from "../helpers";

export interface UseRoundAdapterOptions {
  isActive: boolean;
  isPlaceModalOpen: boolean;
  onError: (message: string) => void;
  /** Called once after adapter.start() succeeds (e.g. to refresh wallet state). */
  onPostBootstrap?: () => Promise<void> | void;
  /** Called whenever the parent should refetch wallet data (after bet, after bootstrap). */
  onWalletNeedsRefresh?: () => void;
  onOnlineCountChange?: (count: number) => void;
}

export interface UseRoundAdapterResult {
  snapshot: RoundSnapshot;
  coefficient: number;
  connectionState: BackendRoundConnectionState;
  mountRef: MutableRefObject<HTMLDivElement | null>;
  rendererRef: MutableRefObject<StarRushGame | null>;
  adapterRef: MutableRefObject<BackendRoundStateAdapter | null>;
  getLiveCoefficient: () => number;
}

/**
 * Owns the WebSocket round adapter, the Phaser renderer lifecycle, and the
 * snapshot/coefficient/connection state. Keeps fast coefficient ticks throttled
 * for React while forwarding every tick to Phaser.
 */
export function useRoundAdapter(options: UseRoundAdapterOptions): UseRoundAdapterResult {
  const {
    isActive,
    isPlaceModalOpen,
    onError,
    onPostBootstrap,
    onWalletNeedsRefresh,
    onOnlineCountChange,
  } = options;

  const [snapshot, setSnapshot] = useState<RoundSnapshot>(INITIAL_SNAPSHOT);
  const [coefficient, setCoefficient] = useState<number>(INITIAL_SNAPSHOT.coefficient);
  const [connectionState, setConnectionState] = useState<BackendRoundConnectionState>(INITIAL_CONNECTION_STATE);

  const mountRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<StarRushGame | null>(null);
  const adapterRef = useRef<BackendRoundStateAdapter | null>(null);
  const resizeObRef = useRef<ResizeObserver | null>(null);
  const isPanelActiveRef = useRef(isActive);
  const activationResizeRafRef = useRef<number | null>(null);

  const lastStructRef = useRef<RoundSnapshot>(INITIAL_SNAPSHOT);
  const coeffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCoeffRef = useRef<number>(INITIAL_SNAPSHOT.coefficient);
  const latestPhaserSnapshotRef = useRef<RoundSnapshot>(cloneSnapshotForPhaser(INITIAL_SNAPSHOT));
  const debugPhaserSyncRef = useRef(false);

  // Stable refs for parent callbacks so bootstrap effect doesn't restart.
  const onErrorRef = useRef(onError);
  const onPostBootstrapRef = useRef(onPostBootstrap);
  const onWalletNeedsRefreshRef = useRef(onWalletNeedsRefresh);
  const onOnlineCountChangeRef = useRef(onOnlineCountChange);

  useEffect(() => { onErrorRef.current = onError; }, [onError]);
  useEffect(() => { onPostBootstrapRef.current = onPostBootstrap; }, [onPostBootstrap]);
  useEffect(() => { onWalletNeedsRefreshRef.current = onWalletNeedsRefresh; }, [onWalletNeedsRefresh]);
  useEffect(() => { onOnlineCountChangeRef.current = onOnlineCountChange; }, [onOnlineCountChange]);

  /* -- backend adapter + renderer init -- */
  useEffect(() => {
    const isDevClient = process.env.NODE_ENV !== "production" && typeof window !== "undefined";
    const params = isDevClient ? new URLSearchParams(window.location.search) : null;
    const debugRoundSync = Boolean(isDevClient && params?.has("debugRoundSync"));
    const debugPhaserSync = Boolean(isDevClient && params?.has("debugPhaserSync"));
    debugPhaserSyncRef.current = debugPhaserSync;

    const adapter = new BackendRoundStateAdapter({
      debug: debugRoundSync,
      snapshotPath: "/api/game/round/current",
    });
    adapterRef.current = adapter;

    const unsubConnection = adapter.subscribeConnection((next) => {
      setConnectionState(next);
      rendererRef.current?.setConnectionSuspended(next.status !== "connected");
    });

    const unsub = adapter.subscribe((next) => {
      const phaserSnapshot = cloneSnapshotForPhaser(next);
      latestPhaserSnapshotRef.current = phaserSnapshot;

      // Always forward to Phaser (it handles its own frame-rate)
      if (rendererRef.current) {
        if (debugPhaserSyncRef.current) {
          console.debug(
            `[useRoundAdapter][PhaserSync] apply snapshot round=${phaserSnapshot.roundId} phase=${phaserSnapshot.phase} coeff=${phaserSnapshot.coefficient.toFixed(4)}`,
          );
        }
        rendererRef.current.applySnapshot(phaserSnapshot);
      }

      pendingCoeffRef.current = next.coefficient;

      const prev = lastStructRef.current;
      const structChanged = hasStructuralSnapshotChange(prev, next);

      if (structChanged) {
        // Structural change - update immediately (bets/phase changed)
        lastStructRef.current = next;
        setSnapshot(next);
        setCoefficient(next.coefficient);
      } else {
        // Coefficient-only tick - throttle to ~100ms for React UI
        if (!coeffTimerRef.current) {
          coeffTimerRef.current = setTimeout(() => {
            coeffTimerRef.current = null;
            setCoefficient(pendingCoeffRef.current);
          }, 100);
        }
      }
    });

    let cancelled = false;

    const bootstrap = async () => {
      // Adapter performs snapshot resync before ws connect.
      await adapter.start();
      if (cancelled) return;
      await onPostBootstrapRef.current?.();
      onWalletNeedsRefreshRef.current?.();
      if (cancelled) return;

      if (!mountRef.current) return;
      const { StarRushGame } = await import("@/game/StarRushGame");
      if (cancelled || !mountRef.current) return;

      const renderer = new StarRushGame(mountRef.current, { debugSync: debugPhaserSync });
      rendererRef.current = renderer;
      renderer.setConnectionSuspended(adapter.getConnectionState().status !== "connected");

      const initialPhaserSnapshot = cloneSnapshotForPhaser(latestPhaserSnapshotRef.current);
      latestPhaserSnapshotRef.current = initialPhaserSnapshot;
      if (debugPhaserSyncRef.current) {
        console.debug(
          `[useRoundAdapter][PhaserSync] bootstrap snapshot round=${initialPhaserSnapshot.roundId} phase=${initialPhaserSnapshot.phase} coeff=${initialPhaserSnapshot.coefficient.toFixed(4)}`,
        );
      }
      renderer.applySnapshot(initialPhaserSnapshot);

      const el = mountRef.current;
      if (el && !cancelled) {
        resizeObRef.current = new ResizeObserver((entries) => {
          const e = entries[0];
          if (!e) return;
          if (!isPanelActiveRef.current) return;
          const nextWidth = e.contentRect.width;
          const nextHeight = e.contentRect.height;
          if (nextWidth < MIN_RENDER_SURFACE_PX || nextHeight < MIN_RENDER_SURFACE_PX) return;
          rendererRef.current?.resize(nextWidth, nextHeight);
        });
        resizeObRef.current.observe(el);
      }
    };

    bootstrap().catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to start renderer";
      onErrorRef.current?.(msg);
    });

    const onVis = () => {
      const hidden = document.hidden || !isPanelActiveRef.current;
      adapter.setDocumentHidden(hidden);
      rendererRef.current?.setLowPowerMode(hidden);
    };
    document.addEventListener("visibilitychange", onVis);
    onVis();

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
      resizeObRef.current?.disconnect();
      resizeObRef.current = null;
      if (coeffTimerRef.current) { clearTimeout(coeffTimerRef.current); coeffTimerRef.current = null; }
      unsub();
      unsubConnection();
      adapter.destroy();
      adapterRef.current = null;
      rendererRef.current?.destroy();
      rendererRef.current = null;
      debugPhaserSyncRef.current = false;
    };
  }, []);

  // isActive: track flag, push low-power mode, resize on activation
  useEffect(() => {
    isPanelActiveRef.current = isActive;
    if (activationResizeRafRef.current !== null) {
      cancelAnimationFrame(activationResizeRafRef.current);
      activationResizeRafRef.current = null;
    }
    if (typeof window === "undefined" || typeof document === "undefined") return;
    const hidden = document.hidden || !isActive;
    adapterRef.current?.setDocumentHidden(hidden);
    rendererRef.current?.setLowPowerMode(hidden);
    if (!isActive) return;

    activationResizeRafRef.current = window.requestAnimationFrame(() => {
      activationResizeRafRef.current = null;
      const host = mountRef.current;
      if (!host) return;
      const rect = host.getBoundingClientRect();
      if (rect.width < MIN_RENDER_SURFACE_PX || rect.height < MIN_RENDER_SURFACE_PX) return;
      rendererRef.current?.resize(rect.width, rect.height);
    });
  }, [isActive]);

  // isPlaceModalOpen: treat modal-open like low-power
  useEffect(() => {
    if (typeof document === "undefined") return;
    const hidden = document.hidden || !isPanelActiveRef.current || isPlaceModalOpen;
    adapterRef.current?.setDocumentHidden(hidden);
    rendererRef.current?.setLowPowerMode(hidden);
  }, [isPlaceModalOpen]);

  // cancel pending raf on unmount
  useEffect(() => {
    return () => {
      if (activationResizeRafRef.current !== null) {
        cancelAnimationFrame(activationResizeRafRef.current);
        activationResizeRafRef.current = null;
      }
    };
  }, []);

  // Notify parent about onlineCount changes
  useEffect(() => {
    onOnlineCountChangeRef.current?.(snapshot.onlineCount);
  }, [snapshot.onlineCount]);

  // Stable getter for the latest coefficient (used by RocketOverlay live ticks).
  const getLiveCoefficientRef = useRef(() => pendingCoeffRef.current);

  return {
    snapshot,
    coefficient,
    connectionState,
    mountRef,
    rendererRef,
    adapterRef,
    getLiveCoefficient: getLiveCoefficientRef.current,
  };
}
