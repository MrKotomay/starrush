/* ────────────────────────────────────────────────────────
   StarRush Design System — Brand Palette (v3)
   Cosmic violet / pink  •  Apple liquid-glass polish
   Canonical source: app/globals.css :root
   This file provides JS-consumable values & legacy --ui-* CSS aliases.
   ──────────────────────────────────────────────────────── */

export const colors = {
  /* Background layers */
  bg0: "#070C16",
  bg1: "#050912",
  bgGlow: "#10192A",

  /* Surfaces */
  surface1: "#111A2B",
  surface2: "#162033",
  surface3: "#202B40",

  /* Legacy aliases (keep compat for components referencing them) */
  primary: "#6B4BFF",
  primarySoft: "#E6D8FF",
  accent: "#D36EF3",
  secondary: "#162033",
  surface: "#111A2B",
  surfaceAlt: "#070C16",

  /* Borders */
  border: "#283449",
  divider: "rgba(255,255,255,0.06)",

  /* Text */
  textPrimary: "#F5F7FF",
  textSecondary: "#B7C4E1",
  textTertiary: "#7D89A9",
  disabled: "#7D89A9",

  /* Brand */
  brand1: "#6B4BFF",
  brand2: "#D36EF3",
  brandSoft: "#E6D8FF",

  /* Highlights */
  star: "#F6D77A",
  flame: "#F48A4F",

  /* Semantic */
  success: "#34D0A8",
  warning: "#F1B85C",
  danger: "#FF5B74",
  info: "#59A6FF",
} as const;

export const gradients = {
  primary: "linear-gradient(132deg, #6B4BFF 0%, #7C69FF 46%, #D36EF3 100%)",
  primaryHover: "linear-gradient(132deg, #7458FF 0%, #8A78FF 46%, #DB79F6 100%)",
  glass: "linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.03) 100%)",
  bgRadial: "radial-gradient(64% 44% at 50% 0%, rgba(126,105,255,0.18) 0%, rgba(126,105,255,0.05) 42%, transparent 72%)",
  surface: "linear-gradient(180deg, #060A14 0%, #10192A 100%)",
  sheet: "linear-gradient(180deg, rgba(98,85,255,0.12) 0%, rgba(8,12,22,0.96) 30%, #070C16 100%)",
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
  "--ui-overlay": "rgba(4, 8, 18, 0.58)",
  "--ui-surface-glass-strong": "rgba(15, 23, 39, 0.82)",
  "--ui-surface-glass": "rgba(15, 23, 39, 0.68)",
  "--ui-surface-glass-soft": "rgba(15, 23, 39, 0.48)",
  "--ui-surface-glow": "rgba(107, 75, 255, 0.12)",
  "--ui-glass-border": "rgba(255,255,255,0.08)",

  /* ── shadows ───────────────────────────────────── */
  "--ui-shadow-sm": "0 8px 22px rgba(2,6,18,0.22), 0 2px 6px rgba(7,12,26,0.12)",
  "--ui-shadow-md": "0 14px 36px rgba(2,6,18,0.28), 0 4px 12px rgba(7,12,26,0.16)",
  "--ui-shadow-lg": "0 24px 56px rgba(2,6,18,0.36), 0 10px 24px rgba(7,12,26,0.20)",
  "--ui-elevated-shadow": "0 20px 44px rgba(2, 6, 18, 0.34), 0 8px 18px rgba(7, 12, 26, 0.18)",
  "--ui-soft-shadow": "0 10px 24px rgba(2, 6, 18, 0.24), 0 4px 10px rgba(7, 12, 26, 0.14)",
  "--ui-primary-shadow": "0 12px 26px rgba(107, 75, 255, 0.20), 0 4px 10px rgba(2, 6, 18, 0.18)",
  "--ui-glow-primary": "0 0 18px rgba(107,75,255,0.18), 0 0 42px rgba(107,75,255,0.08)",
  "--ui-glow-accent": "0 0 18px rgba(211,110,243,0.16), 0 0 38px rgba(211,110,243,0.07)",

  /* ── borders ───────────────────────────────────── */
  "--ui-border-subtle": "rgba(255,255,255,0.08)",
  "--ui-border-strong": "rgba(255,255,255,0.16)",
  "--ui-divider": colors.divider,

  /* ── RGB channels (backward compat — canonical is --rgb-* in :root) ── */
  "--ui-rgb-primary": "107, 75, 255",
  "--ui-rgb-primary-soft": "230, 216, 255",
  "--ui-rgb-accent": "211, 110, 243",
  "--ui-rgb-text-primary": "245, 247, 255",
  "--ui-rgb-text-secondary": "183, 196, 225",
  "--ui-rgb-success": "52, 208, 168",
  "--ui-rgb-danger": "255, 91, 116",
  "--ui-rgb-warning": "241, 184, 92",
  "--ui-rgb-info": "89, 166, 255",
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
