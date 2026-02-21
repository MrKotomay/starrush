"use client";

import { useCallback, useEffect, useRef } from "react";
import type { RocketPose } from "@/game/StarRushGame";
import type { AnimationItem } from "lottie-web";

interface RocketOverlayProps {
  getPose: () => RocketPose | null;
}

interface LottieAnimProp {
  k?: unknown;
  s?: unknown;
}

interface LottieShapeItem {
  ty?: string;
  nm?: string;
  it?: LottieShapeItem[];
  s?: LottieAnimProp;
  c?: LottieAnimProp;
  o?: LottieAnimProp;
}

interface LottieLayer {
  ty?: number;
  nm?: string;
  cl?: string;
  ln?: string;
  ks?: {
    o?: LottieAnimProp;
    s?: LottieAnimProp;
  };
  shapes?: LottieShapeItem[];
  [key: string]: unknown;
}

interface LottieAsset {
  w?: number;
  h?: number;
  layers?: LottieLayer[];
  [key: string]: unknown;
}

interface LottieAnimationData {
  w?: number;
  h?: number;
  layers?: LottieLayer[];
  assets?: LottieAsset[];
  [key: string]: unknown;
}

interface LayerShapeStats {
  maxRectW: number;
  maxRectH: number;
  hasNearBlackFill: boolean;
  hasLowOpacityFill: boolean;
}

const BG_LAYER_NAME_RE = /(bg|background|shape|shadow|aura|glow|plate|base)/i;

function extractNumberArray(value: unknown): number[] | null {
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    if (value.every((entry) => typeof entry === "number")) {
      return value as number[];
    }
    const first = value[0];
    if (first && typeof first === "object") {
      const firstObj = first as { k?: unknown; s?: unknown };
      return extractNumberArray(firstObj.s ?? firstObj.k ?? first);
    }
    return null;
  }

  if (value && typeof value === "object") {
    const obj = value as { k?: unknown; s?: unknown };
    return extractNumberArray(obj.k ?? obj.s);
  }

  return null;
}

function extractStaticNumber(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    const first = value[0];
    if (typeof first === "number") return first;
    return extractStaticNumber(first);
  }
  if (value && typeof value === "object") {
    const obj = value as { k?: unknown; s?: unknown };
    if (typeof obj.k === "number") return obj.k;
    if (typeof obj.s === "number") return obj.s;
    if (obj.k !== undefined) return extractStaticNumber(obj.k);
    if (obj.s !== undefined) return extractStaticNumber(obj.s);
  }
  const arr = extractNumberArray(value);
  if (!arr || arr.length === 0 || typeof arr[0] !== "number") return null;
  return arr[0];
}

function normalizeColorChannel(value: number): number {
  return value > 1 ? value / 255 : value;
}

function collectShapeStats(shapes: LottieShapeItem[] | undefined): LayerShapeStats {
  const stats: LayerShapeStats = {
    maxRectW: 0,
    maxRectH: 0,
    hasNearBlackFill: false,
    hasLowOpacityFill: false,
  };

  const walk = (items: LottieShapeItem[] | undefined) => {
    if (!Array.isArray(items)) return;
    for (const item of items) {
      if (!item || typeof item !== "object") continue;

      if (item.ty === "gr") {
        walk(item.it);
        continue;
      }

      if (item.ty === "rc" || item.ty === "el") {
        const size = extractNumberArray(item.s);
        if (size && size.length >= 2) {
          stats.maxRectW = Math.max(stats.maxRectW, Math.abs(size[0]));
          stats.maxRectH = Math.max(stats.maxRectH, Math.abs(size[1]));
        }
        continue;
      }

      if (item.ty === "fl") {
        const color = extractNumberArray(item.c);
        if (color && color.length >= 3) {
          const r = normalizeColorChannel(color[0]);
          const g = normalizeColorChannel(color[1]);
          const b = normalizeColorChannel(color[2]);
          if (r <= 0.16 && g <= 0.16 && b <= 0.16) {
            stats.hasNearBlackFill = true;
          }
        }

        const opacity = extractStaticNumber(item.o);
        if (opacity !== null && opacity <= 35) {
          stats.hasLowOpacityFill = true;
        }
      }
    }
  };

  walk(shapes);
  return stats;
}

function isLikelyBackgroundLayer(layer: LottieLayer, compW: number, compH: number): boolean {
  const stats = collectShapeStats(layer.shapes);
  if (stats.maxRectW <= 0 || stats.maxRectH <= 0) return false;

  const layerScale = extractNumberArray(layer.ks?.s);
  const scaleX = layerScale && layerScale.length >= 1 ? Math.abs(layerScale[0]) / 100 : 1;
  const scaleY = layerScale && layerScale.length >= 2 ? Math.abs(layerScale[1]) / 100 : 1;
  const rectW = stats.maxRectW * scaleX;
  const rectH = stats.maxRectH * scaleY;
  const largeCoverage = rectW >= compW * 0.7 && rectH >= compH * 0.7;
  if (!largeCoverage) return false;

  const layerOpacity = extractStaticNumber(layer.ks?.o);
  const hasLowLayerOpacity = layerOpacity !== null && layerOpacity <= 40;
  const name = `${layer.nm ?? ""} ${layer.cl ?? ""} ${layer.ln ?? ""}`;
  const hasBgName = BG_LAYER_NAME_RE.test(name);

  const darkLargePlate =
    stats.hasNearBlackFill && (stats.hasLowOpacityFill || hasLowLayerOpacity);
  if (darkLargePlate) return true;

  return hasBgName && (stats.hasNearBlackFill || stats.hasLowOpacityFill || hasLowLayerOpacity);
}

function sanitizeAnimationData(data: LottieAnimationData): LottieAnimationData {
  const rootW = typeof data.w === "number" ? data.w : 512;
  const rootH = typeof data.h === "number" ? data.h : 512;

  if (Array.isArray(data.layers)) {
    data.layers = data.layers.filter(
      (layer) => !isLikelyBackgroundLayer(layer, rootW, rootH),
    );
  }

  if (Array.isArray(data.assets)) {
    data.assets = data.assets.map((asset) => {
      if (!Array.isArray(asset.layers)) return asset;
      const compW = typeof asset.w === "number" ? asset.w : rootW;
      const compH = typeof asset.h === "number" ? asset.h : rootH;
      return {
        ...asset,
        layers: asset.layers.filter(
          (layer) => !isLikelyBackgroundLayer(layer, compW, compH),
        ),
      };
    });
  }

  return data;
}

export function RocketOverlay({ getPose }: RocketOverlayProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const animContainerRef = useRef<HTMLDivElement | null>(null);
  const animRef = useRef<AnimationItem | null>(null);
  const wrapperSizeRef = useRef(0);

  const forceInnerFit = useCallback(() => {
    const container = animContainerRef.current;
    if (!container) return;
    container.style.background = "transparent";
    container.style.backgroundColor = "transparent";

    const inner = container.firstElementChild as HTMLElement | null;
    if (!inner) return;

    inner.style.width = "100%";
    inner.style.height = "100%";
    inner.style.display = "block";
    inner.style.objectFit = "contain";
    inner.style.background = "transparent";
    inner.style.backgroundColor = "transparent";
    inner.style.outline = "none";
    inner.style.border = "none";
    inner.style.boxShadow = "none";

    if (inner instanceof HTMLCanvasElement) {
      const wrapperSize = Math.max(
        1,
        Math.round(wrapperSizeRef.current || container.clientWidth || 1),
      );
      const dpr = window.devicePixelRatio || 1;
      inner.width = Math.round(wrapperSize * dpr);
      inner.height = Math.round(wrapperSize * dpr);
      inner.style.width = `${wrapperSize}px`;
      inner.style.height = `${wrapperSize}px`;
      inner.style.background = "transparent";
      inner.style.backgroundColor = "transparent";
    }
  }, []);

  useEffect(() => {
    let destroyed = false;
    let onDomLoaded: (() => void) | null = null;

    const boot = async () => {
      const { default: lottie } = await import("lottie-web");
      if (destroyed || !animContainerRef.current) return;
      animContainerRef.current.style.background = "transparent";
      animContainerRef.current.style.backgroundColor = "transparent";

      const mountAnimation = (animation: AnimationItem) => {
        animRef.current = animation;
        onDomLoaded = () => {
          forceInnerFit();
          animRef.current?.resize();
        };
        forceInnerFit();
        animation.addEventListener("DOMLoaded", onDomLoaded);
      };

      const baseConfig = {
        container: animContainerRef.current,
        renderer: "canvas" as const,
        loop: true,
        autoplay: true,
        rendererSettings: {
          clearCanvas: true,
          preserveAspectRatio: "xMidYMid meet",
          progressiveLoad: false,
        },
      };

      try {
        const res = await fetch("/rocket/rocket.json", { cache: "force-cache" });
        if (!res.ok) throw new Error(`Failed to fetch Lottie JSON: ${res.status}`);
        const raw = (await res.json()) as unknown;
        if (!raw || typeof raw !== "object") throw new Error("Invalid Lottie JSON");

        const cloned = JSON.parse(JSON.stringify(raw)) as LottieAnimationData;
        const sanitized = sanitizeAnimationData(cloned);

        const animation = lottie.loadAnimation({
          ...baseConfig,
          animationData: sanitized,
        });
        mountAnimation(animation);
      } catch {
        const animation = lottie.loadAnimation({
          ...baseConfig,
          path: "/rocket/rocket.json",
        });
        mountAnimation(animation);
      }
    };

    void boot();

    return () => {
      destroyed = true;
      if (animRef.current && onDomLoaded) {
        animRef.current.removeEventListener("DOMLoaded", onDomLoaded);
      }
      animRef.current?.destroy();
      animRef.current = null;
    };
  }, [forceInnerFit]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const parent = el.parentElement;
    if (!parent) return;

    const applySize = (containerWidth: number) => {
      const baseSize = containerWidth * 0.34;
      wrapperSizeRef.current = baseSize;
      el.style.width = `${baseSize}px`;
      el.style.height = `${baseSize}px`;
      forceInnerFit();
      animRef.current?.resize();
    };

    applySize(parent.clientWidth);

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      applySize(entry.contentRect.width);
    });

    ro.observe(parent);
    return () => ro.disconnect();
  }, [forceInnerFit]);

  useEffect(() => {
    let rafId = 0;

    const tick = () => {
      const el = rootRef.current;
      if (el) {
        const pose = getPose();
        if (!pose || !pose.visible) {
          el.style.opacity = "0";
        } else {
          const s = Math.max(0.01, Math.min(pose.scale, 1.0));
          el.style.opacity = "1";
          el.style.left = `${pose.x}px`;
          el.style.top = `${pose.y}px`;
          el.style.transform = `translate(-50%, -50%) rotate(${pose.rotation}rad) scale(${s})`;
        }
      }
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [getPose]);

  return (
    <div
      ref={rootRef}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: 0,
        height: 0,
        transform: "translate(-50%, -50%)",
        transformOrigin: "center",
        overflow: "hidden",
        background: "transparent",
        backgroundColor: "transparent",
        pointerEvents: "none",
        outline: "none",
        border: "none",
        boxShadow: "none",
        zIndex: 2,
        opacity: 0,
        willChange: "transform, left, top, width, height, opacity",
      }}
      aria-hidden="true"
    >
      <div
        ref={animContainerRef}
        style={{
          width: "100%",
          height: "100%",
          overflow: "hidden",
          background: "transparent",
          backgroundColor: "transparent",
          display: "block",
          outline: "none",
          border: "none",
          boxShadow: "none",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
