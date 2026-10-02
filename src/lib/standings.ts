import type { ContactEntry } from "./eve";

/** Picks the most specific standing for a kill's victim/attacker: a direct
 * character contact beats a corporation contact, which beats an alliance
 * contact. Returns null when nothing in the contact list matches any of the
 * given ids. */
export function matchContactStanding(
  contacts: ContactEntry[],
  ids: { characterId: number | null; corporationId: number | null; allianceId: number | null },
): number | null {
  if (ids.characterId != null) {
    const match = contacts.find((c) => c.contact_type === "character" && c.contact_id === ids.characterId);
    if (match) return match.standing;
  }
  if (ids.corporationId != null) {
    const match = contacts.find((c) => c.contact_type === "corporation" && c.contact_id === ids.corporationId);
    if (match) return match.standing;
  }
  if (ids.allianceId != null) {
    const match = contacts.find((c) => c.contact_type === "alliance" && c.contact_id === ids.allianceId);
    if (match) return match.standing;
  }
  return null;
}

/** Same 5-bucket thresholds as ContactsDirectory.tsx's own standingLabel -
 * kept as a separate small helper here (per the map territory overlay's own
 * needs) rather than importing a component-local function, but the
 * boundaries must stay identical to that file's if either ever changes.
 * Returns null for "no contact entry matched at all", distinct from tier 2
 * (Neutral, an actual 0-ish standing) - the map overlay renders these two
 * states differently (unfilled vs grey-filled) since most sov-holders won't
 * be on any given character's contact list at all. */
export function standingTier(value: number | null): number | null {
  if (value === null) return null;
  if (value <= -5.5) return 0; // Terrible
  if (value <= -0.5) return 1; // Bad
  if (value < 0.5) return 2; // Neutral
  if (value < 5.5) return 3; // Good
  return 4; // Excellent
}

export const STANDING_TIER_LABELS = ["Terrible", "Bad", "Neutral", "Good", "Excellent"];
