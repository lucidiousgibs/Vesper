// Generates src/themes/premium/premium-tokens-extra.css: one full token block per
// extra premium deck. Run with `npm run gen:decks` after changing a palette or a deck
// choice below, then commit the regenerated CSS.
//
// Inputs are the research report's contrast-checked 11-role palettes (bg, panel, border,
// text, accent, accent2, warn, danger, positive, muted) plus a few per-deck choices.
// Everything else the app's token contract needs is derived:
//   * the security scale is built by spacing hue evenly between three fixed anchors
//     (1.0, 0.4, 0.1), never hand-picked, so a deck's scale stays smooth if an anchor
//     is ever tuned;
//   * soft/translucent variants come from the solid colours;
//   * construction layers (--deck-*) come from the palette unless a deck overrides them.
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";


const PAL = {
  "tactical": {
    "bg": "#0b0e09",
    "panel": "#151a11",
    "border": "#3a4829",
    "text": "#d6dcc6",
    "accent": "#d3a62c",
    "accent2": "#86a463",
    "warn": "#e6a732",
    "danger": "#e45e52",
    "positive": "#86a463",
    "muted": "#8b9873"
  },
  "amber": {
    "bg": "#0a0600",
    "panel": "#150d03",
    "border": "#5a3d0e",
    "text": "#ffd89a",
    "accent": "#ffb000",
    "accent2": "#ff8a1f",
    "warn": "#ffd24a",
    "danger": "#ff5a45",
    "positive": "#a5d95e",
    "muted": "#b08a52"
  },
  "white": {
    "bg": "#101112",
    "panel": "#181a1b",
    "border": "#3b4042",
    "text": "#e9ece8",
    "accent": "#f2f5ee",
    "accent2": "#b9bfb6",
    "warn": "#e0c068",
    "danger": "#ec7060",
    "positive": "#a3d29e",
    "muted": "#9aa09a"
  },
  "retrocrt": {
    "bg": "#0b0e0c",
    "panel": "#151b16",
    "border": "#34443a",
    "text": "#cdd8c3",
    "accent": "#7fd18b",
    "accent2": "#d9a441",
    "warn": "#e3a63e",
    "danger": "#d8654a",
    "positive": "#7fd18b",
    "muted": "#8a9885"
  },
  "mecha90": {
    "bg": "#0d0f10",
    "panel": "#161a1b",
    "border": "#35433f",
    "text": "#d3e5d8",
    "accent": "#a8d8b8",
    "accent2": "#ff8f45",
    "warn": "#ffa23a",
    "danger": "#ff5546",
    "positive": "#93d7a5",
    "muted": "#85978d"
  },
  "cyberpunk": {
    "bg": "#08050f",
    "panel": "#130b22",
    "border": "#47256e",
    "text": "#f1eaff",
    "accent": "#00e5ff",
    "accent2": "#ff3fd8",
    "warn": "#ffd43f",
    "danger": "#ff4468",
    "positive": "#3dffa8",
    "muted": "#a08fc4"
  },
  "corporate": {
    "bg": "#0a1222",
    "panel": "#111d35",
    "border": "#2d4166",
    "text": "#f1f6fc",
    "accent": "#9fdcef",
    "accent2": "#e8f1fa",
    "warn": "#f2bd50",
    "danger": "#ee7272",
    "positive": "#74d39d",
    "muted": "#93a5c2"
  },
  "biotech": {
    "bg": "#050805",
    "panel": "#0c140b",
    "border": "#2d4224",
    "text": "#dcebcb",
    "accent": "#b9e38c",
    "accent2": "#e4ee3d",
    "warn": "#f2b640",
    "danger": "#e85d49",
    "positive": "#8fd373",
    "muted": "#8a9c78"
  },
  "deepspace": {
    "bg": "#02040a",
    "panel": "#080c15",
    "border": "#243553",
    "text": "#c4d0e4",
    "accent": "#82bbe8",
    "accent2": "#dbe6f4",
    "warn": "#cfa95e",
    "danger": "#d4675f",
    "positive": "#74b69a",
    "muted": "#7384a0"
  },
  "nerv": {
    "bg": "#0b0608",
    "panel": "#170d10",
    "border": "#5c2a30",
    "text": "#f3dfda",
    "accent": "#ff6d1f",
    "accent2": "#63e374",
    "warn": "#ffc700",
    "danger": "#ff3b3b",
    "positive": "#63e374",
    "muted": "#b08d87"
  },
  "cybernetic": {
    "bg": "#0a0c10",
    "panel": "#13171d",
    "border": "#313b49",
    "text": "#e1e5eb",
    "accent": "#ffb43f",
    "accent2": "#42d6ea",
    "warn": "#ffd060",
    "danger": "#ff5d4d",
    "positive": "#48dba3",
    "muted": "#8e99a8"
  }
};

const DECKS = [
  {
    "id": "tactical",
    "name": "Capsuleer Tactical",
    "pal": "tactical",
    "display": "Rajdhani",
    "label": "B612 Mono",
    "notch": 8,
    "safe": "#6fb7c4",
    "wormhole": "#a98ae0",
    "note": "Black and olive with amber, red and desaturated green: a field display. Flat matte plates, 8px chamfer, shape-coded contacts."
  },
  {
    "id": "amber-command",
    "name": "Amber Command",
    "pal": "amber",
    "display": "Chakra Petch",
    "label": "Share Tech Mono",
    "notch": 0,
    "safe": "#6bbfae",
    "wormhole": "#d89aff",
    "note": "A 1970s space console: amber phosphor on black, double-line frames, seven-segment readouts."
  },
  {
    "id": "cybernetic",
    "name": "Cybernetic",
    "pal": "cybernetic",
    "display": "Chakra Petch",
    "label": "Share Tech Mono",
    "notch": 10,
    "safe": "#42d6ea",
    "wormhole": "#b79aff",
    "note": "Diagnostics and augmentation: gold-amber over dark steel with a cyan scan layer."
  },
  {
    "id": "mecha-alert",
    "name": "Mecha Command Alert",
    "pal": "nerv",
    "display": "Oswald",
    "label": "Share Tech Mono",
    "notch": 0,
    "safe": "#3fd7b0",
    "wormhole": "#c79aff",
    "note": "A command centre built around alerts: alarm orange, hazard bands, thick frames, hard cuts."
  },
  {
    "id": "deep-space",
    "name": "Deep Space",
    "pal": "deepspace",
    "display": "Exo 2",
    "label": "Share Tech Mono",
    "notch": 6,
    "safe": "#82bbe8",
    "wormhole": "#a9a3ff",
    "note": "A ship at night: very dark, sparse cool light, hairline edges and almost no chrome."
  },
  {
    "id": "cyber-neon",
    "name": "Cyberpunk Neon",
    "pal": "cyberpunk",
    "display": "Orbitron",
    "label": "Share Tech Mono",
    "notch": 14,
    "safe": "#00e5ff",
    "wormhole": "#b36bff",
    "note": "Neon on black: cyan data, violet depth and magenta kept to edges. Loud by design."
  },
  {
    "id": "corporate-future",
    "name": "Corporate Future",
    "pal": "corporate",
    "display": "Exo 2",
    "label": "IBM Plex Mono",
    "notch": 0,
    "radius": "10px",
    "safe": "#9fdcef",
    "wormhole": "#b79aff",
    "note": "Faction-HQ polish: dark navy, clean white, pale cyan, rounded cards and soft shadows."
  },
  {
    "id": "biotech",
    "name": "Alien Biotech",
    "pal": "biotech",
    "display": "Chakra Petch",
    "label": "Share Tech Mono",
    "notch": 0,
    "radius": "16px 4px 16px 4px",
    "safe": "#8fe0c0",
    "wormhole": "#c9a0ff",
    "note": "Wet, cold and slightly wrong: pale organic green, acid yellow, irregular curves and slow breathing."
  },
  {
    "id": "mecha-90",
    "name": "90s Mecha",
    "pal": "mecha90",
    "display": "Rajdhani",
    "label": "B612 Mono",
    "notch": 6,
    "safe": "#a8d8b8",
    "wormhole": "#c0a0ff",
    "note": "Cockpit displays: pale green data, orange and red status, double-line schematic frames."
  },
  {
    "id": "white-phosphor",
    "name": "White Phosphor",
    "pal": "white",
    "display": "IBM Plex Mono",
    "label": "IBM Plex Mono",
    "notch": 0,
    "safe": "#9bd0e6",
    "wormhole": "#c0b0f0",
    "body": "IBM Plex Mono",
    "note": "Monochrome and austere: off-white on charcoal, thin single lines, no fills.",
    "over": {
      "--deck-plate": "#101112"
    }
  },
  {
    "id": "cassette-deck",
    "name": "Cassette Deck",
    "pal": "retrocrt",
    "display": "Oswald",
    "label": "IBM Plex Mono",
    "notch": 0,
    "safe": "#7fd18b",
    "wormhole": "#c0a0e0",
    "note": "A heavy modular console: green and amber phosphor over charcoal, olive and beige hardware.",
    "over": {
      "--deck-plate": "#1b1e19",
      "--deck-frame": "#5f5c48",
      "--deck-bezel": "#4c4a3a",
      "--deck-rivet": "#a8a283",
      "--deck-bevel-light": "rgba(255, 250, 220, 0.12)",
      "--deck-bevel-dark": "rgba(0, 0, 0, 0.7)"
    }
  }
];

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../src/themes/premium/premium-tokens-extra.css");

// Python-style rounding (half to even) so the output is stable across tools.
const pyRound = (x) => {
  const r = Math.round(x);
  return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
};
const clamp255 = (c) => Math.max(0, Math.min(255, pyRound(c)));
const h2r = (h) => {
  const s = h.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
};
const r2h = (rgb) => "#" + rgb.map((c) => clamp255(c).toString(16).padStart(2, "0")).join("");
const mix = (a, b, t) => {
  const ra = h2r(a);
  const rb = h2r(b);
  return r2h(ra.map((v, i) => v * (1 - t) + rb[i] * t));
};
const rgba = (h, a) => {
  const [r, g, b] = h2r(h);
  return `rgba(${r}, ${g}, ${b}, ${a.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")})`;
};

// colorsys-compatible HLS conversions.
function rgbToHls(r, g, b) {
  const maxc = Math.max(r, g, b);
  const minc = Math.min(r, g, b);
  const l = (minc + maxc) / 2;
  if (minc === maxc) return [0, l, 0];
  const s = l <= 0.5 ? (maxc - minc) / (maxc + minc) : (maxc - minc) / (2 - maxc - minc);
  const rc = (maxc - r) / (maxc - minc);
  const gc = (maxc - g) / (maxc - minc);
  const bc = (maxc - b) / (maxc - minc);
  let h = r === maxc ? bc - gc : g === maxc ? 2 + rc - bc : 4 + gc - rc;
  h = (h / 6) % 1;
  if (h < 0) h += 1;
  return [h, l, s];
}
function hlsToRgb(h, l, s) {
  if (s === 0) return [l, l, l];
  const m2 = l <= 0.5 ? l * (1 + s) : l + s - l * s;
  const m1 = 2 * l - m2;
  const v = (hue) => {
    hue = ((hue % 1) + 1) % 1;
    if (hue < 1 / 6) return m1 + (m2 - m1) * hue * 6;
    if (hue < 0.5) return m2;
    if (hue < 2 / 3) return m1 + (m2 - m1) * (2 / 3 - hue) * 6;
    return m1;
  };
  return [v(h + 1 / 3), v(h), v(h - 1 / 3)];
}
const hsl = (hex) => {
  const [r, g, b] = h2r(hex).map((c) => c / 255);
  const [h, l, s] = rgbToHls(r, g, b);
  return [h * 360, s, l];
};
const fromHsl = (h, s, l) => {
  const [r, g, b] = hlsToRgb((((h % 360) + 360) % 360) / 360, Math.max(0, Math.min(1, l)), Math.max(0, Math.min(1, s)));
  return r2h([r * 255, g * 255, b * 255]);
};
const lum = (hex) => {
  const f = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = h2r(hex);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a, b) => {
  const la = lum(a);
  const lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

/** Even hue spacing between three anchors: 1.0 (safe), 0.4 (mid) and 0.1 (low). */
function securityScale(safe, mid, low) {
  const [ha, sa, la] = hsl(safe);
  let [hb, sb, lb] = hsl(mid);
  let [hc, sc, lc] = hsl(low);
  if (hb > ha) hb -= 360;
  if (hc > hb) hc -= 360;
  const out = { 10: safe };
  for (let i = 1; i < 6; i++) {
    const t = i / 6; // 9..5 between 1.0 and 0.4 (6 steps)
    out[10 - i] = fromHsl(ha + (hb - ha) * t, sa + (sb - sa) * t, la + (lb - la) * t);
  }
  out[4] = mid;
  for (let i = 1; i < 3; i++) {
    const t = i / 3; // 3..2 between 0.4 and 0.1 (3 steps)
    out[4 - i] = fromHsl(hb + (hc - hb) * t, sb + (sc - sb) * t, lb + (lc - lb) * t);
  }
  out[1] = low;
  out.min = fromHsl(hc - 32, sc * 0.85, lc * 0.82);
  return out;
}

function block(d) {
  const p = PAL[d.pal];
  const { bg, panel, border, text, accent, accent2, warn, danger, positive, muted } = p;
  const wormhole = d.wormhole ?? "#b79aff";
  const abyssal = d.abyssal ?? "#ff9a4d";
  const info = d.info ?? "#6fb4ff";
  const cavity = mix(bg, "#000000", 0.45);
  const sec = securityScale(d.safe, warn, danger);
  const t = {};
  t["--bg"] = bg;
  t["--bg-elevated"] = panel;
  t["--bg-elevated-2"] = mix(panel, border, 0.4);
  t["--border"] = border;
  t["--border-active"] = rgba(accent, 0.5);
  t["--text"] = text;
  t["--text-secondary"] = mix(text, muted, 0.5);
  t["--text-muted"] = muted;
  t["--accent"] = accent;
  t["--accent-soft"] = rgba(accent, 0.14);
  t["--accent-contrast"] = lum(accent) > 0.25 ? mix(bg, "#000000", 0.4) : "#f4f7fa";
  t["--metal"] = mix(muted, border, 0.5);
  t["--success"] = positive;
  t["--success-soft"] = rgba(positive, 0.15);
  t["--warning"] = warn;
  t["--warning-soft"] = rgba(warn, 0.15);
  t["--danger"] = danger;
  t["--danger-soft"] = rgba(danger, 0.15);
  t["--wormhole"] = wormhole;
  t["--wormhole-glow"] = rgba(wormhole, 0.4);
  t["--abyssal"] = abyssal;
  t["--abyssal-glow"] = rgba(abyssal, 0.4);
  t["--kill-corp"] = info;
  t["--kill-alliance"] = wormhole;
  t["--kill-ship"] = accent;
  t["--isk"] = warn;
  t["--isk-soft"] = rgba(warn, 0.15);
  t["--standing-positive"] = info;
  t["--standing-positive-soft"] = rgba(info, 0.12);
  t["--standing-negative"] = mix(danger, "#ffffff", 0.15);
  t["--standing-negative-soft"] = rgba(danger, 0.12);
  t["--standing-neutral"] = muted;
  t["--constellation"] = wormhole;
  t["--constellation-soft"] = rgba(wormhole, 0.15);
  t["--region"] = info;
  t["--region-soft"] = rgba(info, 0.15);
  t["--gate"] = positive;
  t["--gate-soft"] = rgba(positive, 0.15);
  for (const k of ["10", "9", "8", "7", "6", "5", "4", "3", "2", "1", "min"]) t[`--sec-${k}`] = sec[k];
  t["--sec-legend-on-light"] = mix(bg, "#000000", 0.4);
  t["--sec-legend-on-dark"] = text;
  t["--slot-low"] = "#e6d99a";
  t["--slot-low-soft"] = "rgba(230, 217, 154, 0.12)";
  t["--slot-mid"] = "#8fd9f0";
  t["--slot-mid-soft"] = "rgba(143, 217, 240, 0.12)";
  t["--slot-high"] = "#f0a0b4";
  t["--slot-high-soft"] = "rgba(240, 160, 180, 0.12)";
  t["--grid-line"] = rgba(accent, 0.04);
  const rad = d.radius ?? "0px";
  const simpleRad = rad === "0px" ? "0px" : rad.includes("px") && !rad.includes(" ") ? "10px" : "12px";
  t["--radius-sm"] = rad === "0px" ? "0px" : "6px";
  t["--radius-md"] = simpleRad;
  t["--radius-pill"] = rad === "0px" ? "0px" : "999px";
  t["--font-display"] = `"${d.display}", sans-serif`;
  t["--font-label"] = `"${d.label}", monospace`;
  if (d.body) t["--font-body"] = `"${d.body}", monospace`;
  t["--glow-accent"] = `0 0 0 1px var(--border-active), 0 0 20px ${rgba(accent, 0.28)}`;
  // construction layers
  t["--deck-plate"] = panel;
  t["--deck-frame"] = border;
  t["--deck-bezel"] = mix(border, accent, 0.14);
  t["--deck-cavity"] = cavity;
  t["--deck-rivet"] = mix(border, accent, 0.3);
  t["--deck-hazard"] = warn;
  t["--deck-hazard-dark"] = bg;
  t["--deck-bevel-dark"] = "rgba(0, 0, 0, 0.6)";
  t["--deck-bevel-light"] = rgba(accent, 0.07);
  t["--deck-notch"] = `${d.notch}px`;
  t["--deck-lamp-off-online"] = mix(cavity, positive, 0.16);
  t["--deck-lamp-off-warning"] = mix(cavity, warn, 0.16);
  t["--deck-lamp-off-danger"] = mix(cavity, danger, 0.16);
  t["--deck-lamp-off-neutral"] = mix(cavity, muted, 0.14);
  // family variables read by premium-glass.css / premium-terminal.css
  t["--glass-radius"] = rad;
  t["--deck-accent2"] = accent2;
  for (const [k, v] of Object.entries(d.over ?? {})) t[k] = v;
  const lines = [`/* ${d.name.toUpperCase()} - ${d.note} */`, `:root[data-theme="${d.id}"] {`, "  color-scheme: dark;"];
  for (const [k, v] of Object.entries(t)) lines.push(`  ${k}: ${v};`);
  lines.push("}");
  return lines.join("\n");
}

const header = `/* ============================================================================
   Extra premium decks - generated token blocks.
   ============================================================================
   Each block starts from the research report's contrast-checked palette for
   that deck (text, muted text, accents and status colours all tested against
   their surfaces) and derives the rest of the token contract. The security
   scale of every deck is built by spacing hue evenly between three fixed
   anchors (1.0 safe, 0.4 amber, 0.1 danger) rather than picked step by step, so
   a deck's scale stays smooth if an anchor is ever tuned. Geometry and
   signature effects live in premium-glass.css, premium-terminal.css and
   premium-decks-extra.css.

   GENERATED FILE: edit scripts/gen-deck-tokens.mjs and run \`npm run gen:decks\`.
   ============================================================================ */

`;

writeFileSync(OUT, [header, ...DECKS.map((d) => block(d) + "\n")].join("\n"), "utf8");
for (const d of DECKS) {
  const p = PAL[d.pal];
  const bez = d.over?.["--deck-bezel"] ?? mix(p.border, p.accent, 0.14);
  console.log(
    `${d.id.padEnd(18)} muted-on-panel ${contrast(p.muted, p.panel).toFixed(1)}  text-on-panel ${contrast(p.text, p.panel).toFixed(1)}  muted-on-bezel ${contrast(p.muted, bez).toFixed(1)}`,
  );
}
console.log(`wrote ${DECKS.length} decks to ${OUT}`);
