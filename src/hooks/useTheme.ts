import { useEffect, useState } from "react";
import { backupSetting } from "../lib/settingsBackup";

export type ThemeId =
  | "dark"
  | "light"
  | "anime"
  | "cyberpunk"
  | "sunset"
  | "retro-ova"
  | "crt-green"
  | "bulkhead"
  | "cold-ballast"
  | "command-deck"
  | "amber-exchange"
  | "phosphor-green"
  | "holographic"
  | "tactical"
  | "amber-command"
  | "cybernetic"
  | "mecha-alert"
  | "deep-space"
  | "cyber-neon"
  | "corporate-future"
  | "biotech"
  | "mecha-90"
  | "white-phosphor"
  | "cassette-deck";

/** Optional geometry family a premium deck shares rules with (stamped on <html> as
 * data-family): premium-glass.css or premium-terminal.css. Decks with no family ride the
 * shared premium hardware structure directly. */
export type ThemeFamily = "glass" | "terminal";

export const THEMES: { id: ThemeId; label: string; description: string; tier?: "premium"; family?: ThemeFamily; segmentClock?: boolean }[] = [
  { id: "dark", label: "Dark (default)", description: "VESPER's original dark navy/cyan look." },
  { id: "light", label: "Light", description: "A bright counterpart to the default theme." },
  { id: "anime", label: "Analog Signal", description: "Warm cream, indigo panels, and dusty rose - old cel-animation film tones." },
  { id: "cyberpunk", label: "Night Static", description: "Deep navy and violet, oxidised cyan, sodium-gold streetlights." },
  { id: "sunset", label: "Dusk Horizon", description: "A softer, warmer palette - slate blue fading into coral and cream." },
  { id: "retro-ova", label: "YC Retro", description: "EVE reimagined as a 1994 sci-fi anime OVA - tactical cyan and aged amber on deep navy." },
  { id: "crt-green", label: "Phosphor Deck", description: "Old spacecraft terminal - CRT phosphor green for data/telemetry, aged amber for navigation and industry." },
  {
    id: "bulkhead",
    label: "Bulkhead",
    description: "Gritty industrial freighter - rust, hazard amber, and a reactor that's overdue for maintenance. Buttons press with real weight.",
    tier: "premium",
  },
  {
    id: "cold-ballast",
    label: "Cold Ballast",
    description: "A quiet ops deck lit by tank glass - deep abyss black and electric cyan, CRT scanlines on the shell.",
    tier: "premium",
  },
  {
    id: "command-deck",
    label: "Command Deck",
    description: "Bridge HUD glass paired against warm amber switch banks - void navy, royal blue, and Exo 2 display type.",
    tier: "premium",
  },
  {
    id: "amber-exchange",
    label: "Amber Exchange",
    description: "A trading-floor ticker desk - brass and bronze fittings, amber exchange-floor light, and gains/losses that glow the moment they move.",
    tier: "premium",
  },
  {
    id: "holographic",
    label: "Holographic",
    description: "Black glass and light - no hardware plates: glass buttons that light on hover, thin cyan edges, and a faint glow falling from the top of the screen. The cyan-led deck without the raster.",
    tier: "premium",
  },
  {
    id: "phosphor-green",
    label: "Phosphor Green",
    description: "A ship's green-phosphor terminal - black glass, monospace labels, shell-prompt page titles with a block cursor, and a thin scan raster. Scanlines, glow, grain and flicker are all adjustable in Settings > Display > Effects.",
    tier: "premium",
  },
  {
    id: "tactical",
    label: "Capsuleer Tactical",
    description:
      "A field display - black and olive plates with amber and a muted teal, flat matte hardware, range rings on the map and a TGT tag on every page title.",
    tier: "premium",
  },
  {
    id: "amber-command",
    label: "Amber Command",
    description:
      "A 1970s space console - amber phosphor on black, double-line frames, a shell prompt on every title and a scan raster. Easy on the eyes at night.",
    tier: "premium",
    family: "terminal",
    segmentClock: true,
  },
  {
    id: "cybernetic",
    label: "Cybernetic",
    description:
      "Diagnostics and augmentation - gold-amber over dark steel with a cyan scan edge, angled bold outlines and soft glow.",
    tier: "premium",
    family: "glass",
  },
  {
    id: "mecha-alert",
    label: "Mecha Command Alert",
    description:
      "A command centre built around alerts - alarm orange, hazard-stripe bands under every title, heavy frames and hard cuts between pages.",
    tier: "premium",
  },
  {
    id: "deep-space",
    label: "Deep Space",
    description:
      "A ship at night - very dark, sparse cool light, hairline edges, a faint star field and almost no chrome.",
    tier: "premium",
    family: "glass",
  },
  {
    id: "cyber-neon",
    label: "Cyberpunk Neon",
    description:
      "Neon on black - cyan data, violet depth and magenta kept to the edges, with a short glitch when you change page. Loud by design.",
    tier: "premium",
    family: "glass",
  },
  {
    id: "corporate-future",
    label: "Corporate Future",
    description:
      "Faction-HQ polish - dark navy, clean white and pale cyan, rounded cards and soft shadows, no hardware.",
    tier: "premium",
    family: "glass",
  },
  {
    id: "biotech",
    label: "Alien Biotech",
    description:
      "Wet, cold and slightly wrong - pale organic green and acid yellow, irregular curves and a slow breathing mist. Suits wormhole space.",
    tier: "premium",
    family: "glass",
  },
  {
    id: "mecha-90",
    label: "90s Mecha",
    description:
      "Cockpit displays - pale green data with orange and red status, double-line schematic frames and square tags on every title.",
    tier: "premium",
  },
  {
    id: "white-phosphor",
    label: "White Phosphor",
    description:
      "Monochrome and austere - off-white on charcoal, thin single lines, no fills, monospace throughout. The most readable of the terminal decks.",
    tier: "premium",
    family: "terminal",
  },
  {
    id: "cassette-deck",
    label: "Cassette Deck",
    description:
      "A heavy modular console - green and amber phosphor over charcoal with olive and beige hardware, embossed label strips and a tape-counter clock.",
    tier: "premium",
    segmentClock: true,
  },
];

const STORAGE_KEY = "vesper.settings.theme";
// Exported so non-React code that can't call the useTheme() hook itself
// (MapView's canvas draw loop, in particular) can still listen for a live
// theme change directly, instead of guessing at this string a second time.
export const THEME_CHANGE_EVENT = "vesper:theme-change";

function readStoredTheme(): ThemeId {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ThemeId) : "dark";
  } catch {
    return "dark";
  }
}

/** True whenever a premium deck is active - the one thing every premium-
 * only component (StatusLamp, the boot-flicker wrapper, anything else
 * gated on tier rather than a specific palette) needs to check, without
 * each of them re-deriving the premium id list themselves. */
export function isPremiumTheme(theme: ThemeId): boolean {
  return THEMES.find((t) => t.id === theme)?.tier === "premium";
}

/** The active color theme, applied via a data-theme attribute on <html> so
 * App.css's [data-theme="x"] blocks (each redefining the same semantic
 * color variables the rest of the app already renders with - --bg, --accent,
 * --text, etc.) take over with no per-component changes needed. "dark" is
 * the absence of an override - it just leaves the base :root values in
 * place, matching how the app already looked before theming existed.
 *
 * Deliberately NOT built on the generic usePersistentState - this app now
 * has more than one place that needs to REACT to a theme change live
 * (StatusChip swapping to the premium lamp markup, the boot-flicker
 * wrapper, future premium-only components), and usePersistentState's
 * plain useState only updates the ONE component instance that called
 * setTheme. Every other already-mounted useTheme() caller (the persistent
 * TopBar, in particular - it's never unmounted between tab switches)
 * would keep rendering the value it read at ITS OWN mount time until a
 * full reload. Broadcasting the change over a window CustomEvent (instead
 * of a React Context, to avoid re-plumbing every existing useTheme() call
 * site through a new provider) means every instance - however many are
 * mounted, however long they've been mounted - stays in sync the instant
 * ANY of them calls setTheme. */
export function useTheme() {
  const [theme, setThemeState] = useState<ThemeId>(() => readStoredTheme());

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    // Mirrors THEMES' own tier field into the DOM as a real attribute -
    // premium-structure.css's shared rules key off :root[data-tier="premium"]
    // instead of enumerating every premium theme id by name, so a new deck
    // needs no edits there. Cleared (not left stale) when switching back to
    // a standard theme - an empty string removes any prior match instead of
    // a dangling data-tier="premium" attribute standard themes never look at.
    document.documentElement.dataset.tier = isPremiumTheme(theme) ? "premium" : "";
    document.documentElement.dataset.family = THEMES.find((t) => t.id === theme)?.family ?? "";
  }, [theme]);

  useEffect(() => {
    function handleExternalChange(e: Event) {
      setThemeState((e as CustomEvent<ThemeId>).detail);
    }
    window.addEventListener(THEME_CHANGE_EVENT, handleExternalChange);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, handleExternalChange);
  }, []);

  function setTheme(next: ThemeId) {
    try {
      const serialized = JSON.stringify(next);
      localStorage.setItem(STORAGE_KEY, serialized);
      backupSetting(STORAGE_KEY, serialized);
    } catch {
      // Not worth surfacing - worst case the choice doesn't persist across restarts.
    }
    setThemeState(next);
    window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: next }));
  }

  return [theme, setTheme] as const;
}
