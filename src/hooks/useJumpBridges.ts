import { usePersistentState } from "./usePersistentState";

export interface JumpBridgeEntry {
  id: string;
  fromSystemId: number;
  fromSystemName: string;
  toSystemId: number;
  toSystemName: string;
  ownerAllianceName?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = "vesper.map.jumpBridges";

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function pairKey(aId: number, bId: number): string {
  return aId < bId ? `${aId}:${bId}` : `${bId}:${aId}`;
}

/** Manually-maintained jump-bridge network - ESI has no endpoint for this at
 * all, so the alliance/FC maintains it by hand the same way SMT's own
 * crowd-sourced text files work. One bidirectional entry per bridge (not two
 * directed rows) since a bridge always has a return jump; export/import is a
 * plain JSON blob so one FC can build the list once and hand it to others
 * with no server component. */
export function useJumpBridges() {
  const [bridges, setBridges] = usePersistentState<JumpBridgeEntry[]>(STORAGE_KEY, []);

  function addJumpBridge(
    from: { id: number; name: string },
    to: { id: number; name: string },
    ownerAllianceName?: string,
    notes?: string,
  ) {
    if (from.id === to.id) return;
    const key = pairKey(from.id, to.id);
    const now = Date.now();
    setBridges((prev) => [
      ...prev.filter((b) => pairKey(b.fromSystemId, b.toSystemId) !== key),
      {
        id: makeId(),
        fromSystemId: from.id,
        fromSystemName: from.name,
        toSystemId: to.id,
        toSystemName: to.name,
        ownerAllianceName,
        notes,
        createdAt: now,
        updatedAt: now,
      },
    ]);
  }

  function removeJumpBridge(id: string) {
    setBridges((prev) => prev.filter((b) => b.id !== id));
  }

  function exportJumpBridges(): string {
    return JSON.stringify(bridges, null, 2);
  }

  function importJumpBridges(json: string): { imported: number; skipped: number } {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      throw new Error("Not valid JSON.");
    }
    if (!Array.isArray(parsed)) throw new Error("Expected a JSON array of jump bridges.");

    const incoming: JumpBridgeEntry[] = [];
    let skipped = 0;
    for (const raw of parsed) {
      if (
        raw &&
        typeof raw === "object" &&
        typeof (raw as Record<string, unknown>).fromSystemId === "number" &&
        typeof (raw as Record<string, unknown>).fromSystemName === "string" &&
        typeof (raw as Record<string, unknown>).toSystemId === "number" &&
        typeof (raw as Record<string, unknown>).toSystemName === "string"
      ) {
        const r = raw as Record<string, unknown>;
        incoming.push({
          id: typeof r.id === "string" ? r.id : makeId(),
          fromSystemId: r.fromSystemId as number,
          fromSystemName: r.fromSystemName as string,
          toSystemId: r.toSystemId as number,
          toSystemName: r.toSystemName as string,
          ownerAllianceName: typeof r.ownerAllianceName === "string" ? r.ownerAllianceName : undefined,
          notes: typeof r.notes === "string" ? r.notes : undefined,
          createdAt: typeof r.createdAt === "number" ? r.createdAt : Date.now(),
          updatedAt: Date.now(),
        });
      } else {
        skipped++;
      }
    }

    setBridges((prev) => {
      const incomingKeys = new Set(incoming.map((b) => pairKey(b.fromSystemId, b.toSystemId)));
      return [...prev.filter((b) => !incomingKeys.has(pairKey(b.fromSystemId, b.toSystemId))), ...incoming];
    });
    return { imported: incoming.length, skipped };
  }

  return { bridges, addJumpBridge, removeJumpBridge, exportJumpBridges, importJumpBridges };
}
