import type { KillEntry } from "./kills";

/** Signal tier for a kill row, from the kill's own data only: 1 is a loss or a
 * billion-ISK kill, 3 is background noise (NPC kills, pods, under a million ISK),
 * 2 is everything else. Premium decks use it to make every kill feed readable at a
 * glance; other themes ignore the class. The thresholds are judgement calls and
 * live here so they are easy to change. */
export const TIER1_MIN_VALUE = 1_000_000_000;
export const TIER3_MAX_VALUE = 1_000_000;

export function killTier(kill: KillEntry, outcome?: "kill" | "loss"): 1 | 2 | 3 {
  if (outcome === "loss" || kill.total_value >= TIER1_MIN_VALUE) return 1;
  if (kill.npc || /capsule/i.test(kill.ship_type_name) || kill.total_value < TIER3_MAX_VALUE) return 3;
  return 2;
}

/** Premium decks let a row lose brightness as its kill ages: full for the first ten
 * minutes, then easing down to 60% by two hours. Decay shows how recent something is,
 * which is most of what a feed is for. Tier-1 rows never dim, and every row returns to
 * full on hover (see premium-signal.css). */
const AGE_FULL_MIN = 10;
const AGE_FLOOR_MIN = 120;
const AGE_FLOOR = 0.6;

export function rowAgeFactor(killTime: string, now: number): number {
  const t = Date.parse(killTime);
  if (!Number.isFinite(t)) return 1;
  const ageMin = Math.max(0, (now - t) / 60_000);
  const progress = Math.min(1, Math.max(0, (ageMin - AGE_FULL_MIN) / (AGE_FLOOR_MIN - AGE_FULL_MIN)));
  return 1 - progress * (1 - AGE_FLOOR);
}
