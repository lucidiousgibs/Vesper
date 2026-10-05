/** Geometry and flag mapping for the fitting dial (components/FittingDial.tsx), the round ship
 * fitting display from EVE's own fitting window: high slots along the top left, mid slots on
 * the right, low slots along the bottom, rigs on the left and (on Tech III hulls) subsystems
 * between the lows and the rigs. Angles are degrees clockwise from 12 o'clock. */

export type DialGroup = "high" | "mid" | "low" | "rig" | "subsystem";

export const DIAL_GROUPS: DialGroup[] = ["high", "mid", "low", "rig", "subsystem"];

/** The arc each rack sits on: its centre, and the widest span it may use. Slots are spaced
 * evenly around the centre and tighten up only when a rack has too many to fit its span. The
 * spans are chosen so that no two racks overlap on any real hull (a Tech III hull has
 * subsystems but no low slots of its own, so subsystems may reach into the lows' arc). */
const SECTORS: Record<DialGroup, { center: number; span: number }> = {
  high: { center: -22, span: 88 },
  mid: { center: 82, span: 88 },
  low: { center: 186, span: 88 },
  subsystem: { center: 243, span: 40 },
  rig: { center: -80, span: 26 },
};

/** Angular distance between neighbouring slots when the rack has room. */
export const SLOT_STEP_DEG = 10.5;

/** The angle of every slot in a rack of `count`, in slot order (clockwise round the dial). */
export function slotAngles(group: DialGroup, count: number): number[] {
  if (count <= 0) return [];
  const { center, span } = SECTORS[group];
  const step = Math.min(SLOT_STEP_DEG, span / count);
  return Array.from({ length: count }, (_, i) => center + (i - (count - 1) / 2) * step);
}

/** A point on a circle round (cx, cy), `angle` degrees clockwise from the top. */
export function polar(cx: number, cy: number, radius: number, angle: number): { x: number; y: number } {
  const rad = (angle * Math.PI) / 180;
  return { x: cx + Math.sin(rad) * radius, y: cy - Math.cos(rad) * radius };
}

/** An SVG arc path along a circle between two clockwise-from-top angles (a0 < a1, under 360). */
export function arcPath(cx: number, cy: number, radius: number, a0: number, a1: number): string {
  const start = polar(cx, cy, radius, a0);
  const end = polar(cx, cy, radius, a1);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius} ${radius} 0 ${large} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

/** The ESI fitting flag prefixes the Fit Builder stores its items under (HiSlot0, MedSlot2, ...). */
const FIT_FLAG_PREFIX: Record<DialGroup, string> = {
  high: "HiSlot",
  mid: "MedSlot",
  low: "LoSlot",
  rig: "RigSlot",
  subsystem: "SubSystemSlot",
};

export function fitFlagFor(group: DialGroup, index: number): string {
  return `${FIT_FLAG_PREFIX[group]}${index}`;
}

/** The rack and position a fit item's flag names, or null for drones, cargo and the rest. */
export function dialSlotForFitFlag(flag: string): { group: DialGroup; index: number } | null {
  for (const group of DIAL_GROUPS) {
    const prefix = FIT_FLAG_PREFIX[group];
    if (flag.startsWith(prefix)) {
      const index = Number(flag.slice(prefix.length));
      if (Number.isInteger(index) && index >= 0) return { group, index };
    }
  }
  return null;
}

/** First inventory flag of each rack on a killmail. These are fixed EVE inventory-position ids:
 * LoSlot0-7 = 11-18, MedSlot0-7 = 19-26, HiSlot0-7 = 27-34, RigSlot0-7 = 92-99 and
 * SubSystemSlot0-7 = 125-132. */
const KILL_FLAG_BASE: Record<DialGroup, number> = { low: 11, mid: 19, high: 27, rig: 92, subsystem: 125 };

/** The rack and position a killmail item's flag names, or null for drone bay, cargo and the rest. */
export function dialSlotForKillFlag(flag: number): { group: DialGroup; index: number } | null {
  for (const group of DIAL_GROUPS) {
    const base = KILL_FLAG_BASE[group];
    if (flag >= base && flag < base + 8) return { group, index: flag - base };
  }
  return null;
}
