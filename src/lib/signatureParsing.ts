/** Shared clipboard-paste parsing for EVE's in-game Scanning window output -
 * extracted from the wormhole-chain tool's SignaturePanel.tsx so the new
 * map-wide signature scratchpad (keyed by plain k-space system id, not a
 * wormhole chain) can reuse the exact same parsing/classification logic
 * instead of re-implementing it. Pure functions only, no component/chain
 * dependency - both consumers import from here. */

export type SignatureKind = "unknown" | "combat" | "data" | "relic" | "gas" | "wormhole" | "ore";

export const KIND_BY_GROUP: Record<string, SignatureKind> = {
  "combat site": "combat",
  "data site": "data",
  "relic site": "relic",
  "gas site": "gas",
  "wormhole": "wormhole",
  "ore site": "ore",
};

export function normalizeKind(group: string): SignatureKind {
  return KIND_BY_GROUP[group.trim().toLowerCase()] ?? "unknown";
}

export const KIND_LABEL: Record<SignatureKind, string> = {
  unknown: "Unscanned",
  combat: "Combat",
  data: "Data",
  relic: "Relic",
  gas: "Gas",
  wormhole: "Wormhole",
  ore: "Ore",
};

export interface ParsedSignature {
  sig_id: string;
  kind: SignatureKind;
  sig_type: string;
  signal_strength: string;
}

/** Parses EVE's in-game Scanning window clipboard paste: one signature per
 * line, tab-separated (Sig ID, Group, Name, Signal Strength, Distance) -
 * some columns are blank until the site is actually scanned down, so this
 * only requires the leading Sig ID column to treat a line as a signature. */
export function parseScanPaste(text: string): ParsedSignature[] {
  const results: ParsedSignature[] = [];
  for (const line of text.split("\n")) {
    const cols = line.split("\t").map((c) => c.trim());
    if (cols.length < 2) continue;
    const sigId = cols[0];
    if (!/^[A-Z]{3}-\d{3}$/.test(sigId)) continue;
    results.push({
      sig_id: sigId,
      kind: normalizeKind(cols[1] ?? ""),
      sig_type: cols[2] ?? "",
      signal_strength: cols[3] ?? "",
    });
  }
  return results;
}
