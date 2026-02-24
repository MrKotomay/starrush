/* ────────────────────────────────────────────────────────
   StarRush Design System — Brand Palette (v3)
   Cosmic violet / pink  •  Apple liquid-glass polish
   Canonical source: app/globals.css :root
   This file provides JS-consumable values & legacy --ui-* CSS aliases.
   ──────────────────────────────────────────────────────── */

export const colors = {
  /* Background layers */
  bg0: "#0B1024",
  bg1: "#080B1A",
  bgGlow: "#12183A",

  /* Surfaces */
  surface1: "#141A3A",
  surface2: "#191E3B",
  surface3: "#242C62",

  /* Legacy aliases (keep compat for components referencing them) */
  primary: "#651DCB",
  primarySoft: "#ECCCF9",
  accent: "#D761F1",
  secondary: "#191E3B",
  surface: "#141A3A",
  surfaceAlt: "#0B1024",

  /* Borders */
  border: "#2F3156",
  divider: "rgba(255,255,255,0.06)",

  /* Text */
  textPrimary: "#F6F2FF",
  textSecondary: "#B9C2E6",
  textTertiary: "#7E88B6",
  disabled: "#7E88B6",

  /* Brand */
  brand1: "#651DCB",
  brand2: "#D761F1",
  brandSoft: "#ECCCF9",

  /* Highlights */
  star: "#FDE182",
  flame: "#F48547",

  /* Semantic */
  success: "#35D39B",
  warning: "#F4B445",
  danger: "#FF4D6D",
  info: "#4AA3FF",
} as const;

export const gradients = {
  primary: "linear-gradient(135deg, #651DCB 0%, #7A5CFF 45%, #D761F1 100%)",
  primaryHover: "linear-gradient(135deg, #7332D6 0%, #8A6EFF 45%, #E071F7 100%)",
  glass: "linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.04) 100%)",
  bgRadial: "radial-gradient(60% 40% at 50% 10%, rgba(122,92,255,0.22) 0%, transparent 60%)",
  surface: "linear-gradient(180deg, #080B1A 0%, #12183A 100%)",
  sheet: "linear-gradient(180deg, rgba(101,29,203,0.18) 0%, rgba(11,16,36,0.96) 30%, #0B1024 100%)",
} as const;

/**
 * --ui-* backward-compat aliases.
 * These map to the same values as the canonical :root tokens in globals.css.
 * CSS modules that still reference --ui-* will work without changes.
 *
 * NEW CODE should use the canonical vars:
 *   hsl(var(--surface-1))   instead of   var(--ui-surface-1)
 *   rgba(var(--rgb-primary), 0.5)   instead of   rgba(var(--ui-rgb-primary), 0.5)
 */
export const appColorCssVariables: Record<`--${string}`, string> = {
  /* ── core palette ──────────────────────────────── */
  "--ui-primary": colors.brand1,
  "--ui-primary-soft": colors.brandSoft,
  "--ui-accent": colors.accent,
  "--ui-secondary": colors.secondary,
  "--ui-surface": colors.surface1,
  "--ui-surface-alt": colors.bg0,
  "--ui-border": colors.border,
  "--ui-text-primary": colors.textPrimary,
  "--ui-text-secondary": colors.textSecondary,
  "--ui-text-tertiary": colors.textTertiary,
  "--ui-disabled": colors.disabled,
  "--ui-success": colors.success,
  "--ui-danger": colors.danger,
  "--ui-warning": colors.warning,
  "--ui-info": colors.info,
  "--ui-star": colors.star,
  "--ui-flame": colors.flame,

  /* ── surfaces ──────────────────────────────────── */
  "--ui-surface-1": colors.surface1,
  "--ui-surface-2": colors.surface2,
  "--ui-surface-3": colors.surface3,
  "--ui-bg-0": colors.bg0,
  "--ui-bg-1": colors.bg1,
  "--ui-bg-glow": colors.bgGlow,

  /* ── gradients ─────────────────────────────────── */
  "--ui-primary-gradient": gradients.primary,
  "--ui-primary-gradient-hover": gradients.primaryHover,
  "--ui-glass-gradient": gradients.glass,
  "--ui-bg-radial": gradients.bgRadial,
  "--ui-surface-gradient": gradients.surface,
  "--ui-sheet-gradient": gradients.sheet,

  /* ── overlays / glass ──────────────────────────── */
  "--ui-overlay": "rgba(6, 9, 22, 0.72)",
  "--ui-surface-glass-strong": "rgba(20, 26, 58, 0.94)",
  "--ui-surface-glass": "rgba(20, 26, 58, 0.80)",
  "--ui-surface-glass-soft": "rgba(20, 26, 58, 0.60)",
  "--ui-surface-glow": "rgba(101, 29, 203, 0.18)",
  "--ui-glass-border": "rgba(255,255,255,0.10)",

  /* ── shadows ───────────────────────────────────── */
  "--ui-shadow-sm": "0 2px 8px rgba(4,7,22,0.28), 0 1px 3px rgba(11,17,38,0.18)",
  "--ui-shadow-md": "0 8px 24px rgba(4,7,22,0.40), 0 2px 8px rgba(11,17,38,0.24)",
  "--ui-shadow-lg": "0 18px 48px rgba(4,7,22,0.54), 0 6px 18px rgba(11,17,38,0.30)",
  "--ui-elevated-shadow": "0 18px 44px rgba(4, 7, 22, 0.54), 0 6px 16px rgba(11, 17, 38, 0.3)",
  "--ui-soft-shadow": "0 8px 20px rgba(4, 7, 22, 0.38), 0 2px 8px rgba(11, 17, 38, 0.24)",
  "--ui-primary-shadow": "0 10px 22px rgba(101, 29, 203, 0.34), 0 2px 8px rgba(8, 12, 28, 0.26)",
  "--ui-glow-primary": "0 0 20px rgba(101,29,203,0.35), 0 0 60px rgba(101,29,203,0.12)",
  "--ui-glow-accent": "0 0 20px rgba(215,97,241,0.30), 0 0 50px rgba(215,97,241,0.10)",

  /* ── borders ───────────────────────────────────── */
  "--ui-border-subtle": "rgba(255,255,255,0.08)",
  "--ui-border-strong": "rgba(255,255,255,0.16)",
  "--ui-divider": colors.divider,

  /* ── RGB channels (backward compat — canonical is --rgb-* in :root) ── */
  "--ui-rgb-primary": "101, 29, 203",
  "--ui-rgb-primary-soft": "236, 204, 249",
  "--ui-rgb-accent": "215, 97, 241",
  "--ui-rgb-text-primary": "246, 242, 255",
  "--ui-rgb-text-secondary": "185, 194, 230",
  "--ui-rgb-success": "53, 211, 155",
  "--ui-rgb-danger": "255, 77, 109",
  "--ui-rgb-warning": "244, 180, 69",
  "--ui-rgb-info": "74, 163, 255",
};

export const avatarPalette = [
  "#6f5cc0",
  "#7f66ca",
  "#8c74d5",
  "#9a7ede",
  "#aa8be4",
  "#7764b6",
  "#6655a4",
  "#5a4a92",
] as const;
