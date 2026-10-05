import { useCallback, useEffect, useMemo } from "react";
import { usePersistentState } from "./usePersistentState";
import { useTheme, type ThemeId } from "./useTheme";

/** The user-facing "Effects" settings: one place to scale or switch off every
 * atmospheric effect the premium decks (and the new sci-fi features built on
 * them) draw. Replaces the old single Reduce Motion checkbox - Motion OFF is
 * exactly what that checkbox did.
 *
 * How it reaches CSS: the effective value of each setting is stamped on <html>
 * as data-fx-<key> (see applyToDom), and premium-fx.css turns those into the
 * intensity variables (--fx-glow-k, --fx-scan-k, ...) and the animation gates
 * the existing premium rules already read. Nothing here has any visual effect
 * under a standard theme except Motion, which has always applied everywhere.
 *
 * Motion classes (kept in step with the research report):
 *   OFF  - nothing animates (the old Reduce Motion behaviour).
 *   LOW  - warnings, loading and selection feedback only (lamp blink, scan-tick,
 *          lock-on, signal degrade). No ambient or decorative loops.
 *   FULL - everything, including ambient CRT flicker, the map scan bar and the
 *          page-mount ignition flicker.
 * Flicker only plays at Motion FULL, because it is a decorative loop. */

export type FxKey = "motion" | "mapfx" | "glow" | "crt" | "grain" | "scan" | "flicker" | "noise" | "faction" | "sound";
export type FxSettings = Record<FxKey, string>;

export interface FxControl {
  key: FxKey;
  label: string;
  options: { value: string; label: string }[];
  hint: string;
  /** True when the setting only does something under a premium theme. */
  premiumOnly: boolean;
}

export const FX_CONTROLS: FxControl[] = [
  {
    key: "motion",
    label: "Motion",
    options: [
      { value: "off", label: "Off" },
      { value: "low", label: "Low" },
      { value: "full", label: "Full" },
    ],
    hint: "Off stops all animation, including the skill-queue pulse and proximity flash (this replaces the old Reduce Motion switch). Low keeps warnings, loading and selection feedback only. Full adds the ambient effects and the short startup sequence on Premium themes.",
    premiumOnly: false,
  },
  {
    key: "mapfx",
    label: "Map animation",
    options: [
      { value: "low", label: "Low" },
      { value: "normal", label: "Normal" },
      { value: "high", label: "High" },
    ],
    hint: "How many animated objects the map may draw at once: kill pulses, and route particles on a Premium theme. The freshest events always win, and anything over the limit holds still instead of disappearing. Low suits older graphics hardware; High suits a busy night in null-sec.",
    premiumOnly: false,
  },
  {
    key: "glow",
    label: "Glow",
    options: [
      { value: "off", label: "Off" },
      { value: "subtle", label: "Subtle" },
      { value: "strong", label: "Strong" },
    ],
    hint: "Light bloom around readouts, lamps and map HUD marks.",
    premiumOnly: true,
  },
  {
    key: "crt",
    label: "CRT",
    options: [
      { value: "off", label: "Off" },
      { value: "subtle", label: "Subtle" },
      { value: "full", label: "Full" },
    ],
    hint: "Screen-glass atmosphere: each deck's vignette or sheen, and the map's rolling scan bar.",
    premiumOnly: true,
  },
  {
    key: "scan",
    label: "Scanlines",
    options: [
      { value: "off", label: "Off" },
      { value: "low", label: "Low" },
      { value: "high", label: "High" },
    ],
    hint: "Thin horizontal lines over the screen and the map. Never placed over reading text at Low.",
    premiumOnly: true,
  },
  {
    key: "grain",
    label: "Grain",
    options: [
      { value: "off", label: "Off" },
      { value: "low", label: "Low" },
      { value: "high", label: "High" },
    ],
    hint: "A fine static noise texture across the whole screen.",
    premiumOnly: true,
  },
  {
    key: "flicker",
    label: "Flicker",
    options: [
      { value: "off", label: "Off" },
      { value: "subtle", label: "Subtle" },
    ],
    hint: "Occasional brief dips in readouts, lamps and the map, like an unstable monitor. Needs Motion set to Full.",
    premiumOnly: true,
  },
  {
    key: "noise",
    label: "Imperfection",
    options: [
      { value: "off", label: "Off" },
      { value: "authentic", label: "Authentic" },
      { value: "extreme", label: "Extreme (may be uncomfortable)" },
    ],
    hint: "A faint colour fringe on page titles (Authentic), or a stronger fringe plus a slight shake on the map frame (Extreme). Only on frames and titles, never on data. Extreme needs Motion set to Full and is off whenever Motion is Off; turn it off if it bothers your eyes.",
    premiumOnly: true,
  },
  {
    key: "faction",
    label: "Faction accent",
    options: [
      { value: "off", label: "Deck's own" },
      { value: "amarr", label: "Amarr gold" },
      { value: "caldari", label: "Caldari steel blue" },
      { value: "gallente", label: "Gallente green" },
      { value: "minmatar", label: "Minmatar rust" },
    ],
    hint: "Recolours the Premium deck's accent (selection, lit edges, the map's markers) in one of the four empires' colours. Most accent surfaces follow; a few deck-specific details keep their own tint.",
    premiumOnly: true,
  },
  {
    key: "sound",
    label: "Sound cues",
    options: [
      { value: "off", label: "Off" },
      { value: "minimal", label: "Minimal" },
      { value: "full", label: "Full" },
    ],
    hint: "Short interface sounds on Premium themes. Minimal plays only warnings (an error, a risky route) and the startup sequence's console sounds. Full adds confirmations, target lock and scan complete. Volume follows the notification volume. The proximity alert and notification ping keep their own settings.",
    premiumOnly: true,
  },
];

/** What every deck does today, so adding this system changes nothing until the
 * user touches a setting. */
export const BASE_FX: FxSettings = {
  motion: "full",
  mapfx: "normal",
  glow: "subtle",
  crt: "subtle",
  grain: "off",
  scan: "low",
  flicker: "subtle",
  noise: "off",
  faction: "off",
  sound: "minimal",
};

/** Per-theme starting points, layered over BASE_FX. A theme only lists what
 * differs from today's look. */
export const THEME_FX: Partial<Record<ThemeId, Partial<FxSettings>>> = {
  // New effects arrive at a low level: the deck's own raster and glow match the
  // other decks, plus a light grain.
  "phosphor-green": { grain: "low" },
  // Clean glass: stronger glow, no raster or flicker.
  holographic: { glow: "strong", scan: "off", flicker: "off" },
  // The research report's starting points for each further deck. Only what differs
  // from BASE_FX is listed (glow subtle, crt subtle, grain off, scan low, flicker subtle,
  // sound minimal, motion full, map normal).
  tactical: { motion: "low", crt: "off", grain: "low", scan: "off", flicker: "off" },
  "amber-command": { grain: "low", sound: "full" },
  cybernetic: { crt: "off", scan: "low", flicker: "off" },
  "mecha-alert": { crt: "off", scan: "off", flicker: "off", sound: "full" },
  "deep-space": { motion: "low", crt: "off", grain: "low", scan: "off", flicker: "off" },
  "cyber-neon": { glow: "strong", grain: "low", sound: "full" },
  "corporate-future": { motion: "low", crt: "off", scan: "off", flicker: "off", sound: "off" },
  biotech: { crt: "off", grain: "low", scan: "off", flicker: "off" },
  "mecha-90": { motion: "low", grain: "low", flicker: "off" },
  "white-phosphor": { motion: "low", grain: "low", flicker: "off", sound: "off" },
  "cassette-deck": { grain: "high", sound: "full" },
};

const STORAGE_KEY = "vesper.settings.effects";
const LEGACY_REDUCE_MOTION_KEY = "vesper.settings.reduceMotion";

function sanitize(raw: Partial<FxSettings>): Partial<FxSettings> {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: Partial<FxSettings> = {};
  for (const control of FX_CONTROLS) {
    const value = src[control.key];
    if (typeof value === "string" && control.options.some((o) => o.value === value)) out[control.key] = value;
  }
  // One-time carry-over from the old Reduce Motion checkbox: someone who had it
  // on keeps Motion off until they choose otherwise.
  if (out.motion === undefined) {
    try {
      if (localStorage.getItem(LEGACY_REDUCE_MOTION_KEY) === "true") out.motion = "off";
    } catch {
      // storage unavailable: nothing to migrate
    }
  }
  return out;
}

function clearLegacyReduceMotion() {
  try {
    localStorage.setItem(LEGACY_REDUCE_MOTION_KEY, "false");
  } catch {
    // not worth surfacing
  }
}

export function defaultsForTheme(theme: ThemeId): FxSettings {
  return { ...BASE_FX, ...(THEME_FX[theme] ?? {}) };
}

function applyToDom(fx: FxSettings) {
  const root = document.documentElement;
  root.dataset.fxMotion = fx.motion;
  root.dataset.fxMapfx = fx.mapfx;
  root.dataset.fxGlow = fx.glow;
  root.dataset.fxCrt = fx.crt;
  root.dataset.fxGrain = fx.grain;
  root.dataset.fxScan = fx.scan;
  root.dataset.fxFlicker = fx.flicker;
  root.dataset.fxNoise = fx.noise;
  root.dataset.fxFaction = fx.faction;
  root.dataset.fxSound = fx.sound;
  // The existing premium CSS and App.css gate their reduced-motion fallbacks on
  // body[data-reduce-motion="true"]. Keeping it in step means all of those rules
  // keep working untouched.
  document.body.dataset.reduceMotion = String(fx.motion === "off");
}

/** Read and change the effects settings. Each setting is stored only when it
 * differs from the active theme's default, so a theme's defaults can still
 * improve later without being pinned by an old saved copy. */
export function useEffects() {
  const [theme] = useTheme();
  const [overrides, setOverrides] = usePersistentState<Partial<FxSettings>>(STORAGE_KEY, {}, sanitize);

  const defaults = useMemo(() => defaultsForTheme(theme), [theme]);
  const effective = useMemo<FxSettings>(() => ({ ...defaults, ...overrides }), [defaults, overrides]);

  const setFx = useCallback(
    (key: FxKey, value: string) => {
      setOverrides((prev) => {
        const next = { ...prev };
        if (value === defaults[key]) delete next[key];
        else next[key] = value;
        return next;
      });
      if (key === "motion") clearLegacyReduceMotion();
    },
    [defaults, setOverrides],
  );

  const resetFx = useCallback(() => {
    setOverrides({});
    clearLegacyReduceMotion();
  }, [setOverrides]);

  const customised = Object.keys(overrides).length > 0;
  return { effective, defaults, customised, setFx, resetFx };
}

/** Mount once near the root: stamps the effective settings on the document. */
export function useEffectsApplier() {
  const { effective } = useEffects();
  useEffect(() => {
    applyToDom(effective);
  }, [effective]);
}
