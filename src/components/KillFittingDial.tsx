import { useEffect, useMemo, useState } from "react";
import { getShipStats, getItemResourceCosts, type ItemResourceCost, type ShipStats } from "../lib/market";
import { DIAL_GROUPS, dialSlotForKillFlag, type DialGroup } from "../lib/fittingDial";
import type { KillItemEntry } from "../lib/kills";
import type { MarketItemRef } from "./MarketBrowser";
import FittingDial, { type DialSlot } from "./FittingDial";

interface KillFittingDialProps {
  shipTypeId: number;
  shipTypeName: string;
  items: KillItemEntry[];
  /** Every icon on the dial (the ship, each module, each loaded charge) opens that item in the
   * Market Browser, the same navigation the rest of the killmail page uses. */
  onSelectItem: (item: MarketItemRef) => void;
}

const STATS_KEY: Record<DialGroup, keyof ShipStats> = {
  high: "hi_slots",
  mid: "mid_slots",
  low: "low_slots",
  rig: "rig_slots",
  subsystem: "subsystem_slots",
};

/** A flag can hold a fitted module plus whatever is loaded in it (ammo, a crystal, a script).
 * Quantity alone does not tell them apart (frequency crystals sit at quantity 1, like the module),
 * so this trusts the item's real category (is_charge, resolved server-side) and only falls back
 * to the smaller stack being the module if that lookup did not resolve for anything at the flag. */
function pickModuleAndAmmo(entries: KillItemEntry[]): { module: KillItemEntry; ammo: KillItemEntry | null } {
  const modules = entries.filter((e) => !e.is_charge);
  const charges = entries.filter((e) => e.is_charge);
  if (modules.length > 0) return { module: modules[0], ammo: charges[0] ?? null };
  const sorted = [...entries].sort((a, b) => a.quantity_destroyed + a.quantity_dropped - (b.quantity_destroyed + b.quantity_dropped));
  return { module: sorted[0], ammo: sorted[1] ?? null };
}

/** The fitting dial for a killmail: the hull's racks laid out as in the game's fitting window,
 * every module marked destroyed or dropped, with the weapon hardpoints and rig calibration the
 * hull and fit actually use. Powergrid and CPU are left off on purpose: the pilot's skills are
 * not on the killmail, so the hull's base output would be the wrong number to compare against. */
function KillFittingDial({ shipTypeId, shipTypeName, items, onSelectItem }: KillFittingDialProps) {
  const [stats, setStats] = useState<ShipStats | null>(null);
  const [costs, setCosts] = useState<Map<number, ItemResourceCost>>(new Map());

  useEffect(() => {
    let cancelled = false;
    setStats(null);
    getShipStats(shipTypeId)
      .then((s) => {
        if (!cancelled) setStats(s);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [shipTypeId]);

  const moduleTypeIds = useMemo(
    () => Array.from(new Set(items.filter((i) => dialSlotForKillFlag(i.flag) && !i.is_charge).map((i) => i.item_type_id))),
    [items],
  );

  useEffect(() => {
    if (moduleTypeIds.length === 0) {
      setCosts(new Map());
      return;
    }
    let cancelled = false;
    getItemResourceCosts(moduleTypeIds)
      .then((c) => {
        if (!cancelled) setCosts(c);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [moduleTypeIds]);

  const model = useMemo(() => {
    const byFlag = new Map<number, KillItemEntry[]>();
    for (const item of items) {
      if (!dialSlotForKillFlag(item.flag)) continue;
      const entries = byFlag.get(item.flag) ?? [];
      entries.push(item);
      byFlag.set(item.flag, entries);
    }
    const slots: DialSlot[] = [];
    const reach: Record<DialGroup, number> = { high: 0, mid: 0, low: 0, rig: 0, subsystem: 0 };
    for (const [flag, entries] of byFlag) {
      const where = dialSlotForKillFlag(flag)!;
      const { module, ammo } = pickModuleAndAmmo(entries);
      const quantity = module.quantity_destroyed + module.quantity_dropped;
      slots.push({
        ...where,
        typeId: module.item_type_id,
        name: module.item_type_name,
        quantity,
        state: module.quantity_destroyed > 0 ? "destroyed" : "dropped",
        ammo: ammo
          ? { typeId: ammo.item_type_id, name: ammo.item_type_name, quantity: ammo.quantity_destroyed + ammo.quantity_dropped }
          : null,
      });
      reach[where.group] = Math.max(reach[where.group], where.index + 1);
    }
    // Every slot the hull has is drawn. If the killmail holds an item beyond the hull's base count
    // (a Tech III hull's slots come from its subsystems), the rack grows to take it.
    const counts = {} as Record<DialGroup, number>;
    for (const group of DIAL_GROUPS) counts[group] = Math.max(stats ? (stats[STATS_KEY[group]] as number) : 0, reach[group]);
    return { slots, counts };
  }, [items, stats]);

  const hardpoints = useMemo(() => {
    if (!stats || (stats.turret_hardpoints <= 0 && stats.launcher_hardpoints <= 0)) return null;
    const highs = model.slots.filter((s) => s.group === "high" && s.typeId != null);
    const known = highs.every((s) => costs.has(s.typeId!));
    const used = (kind: "turret" | "launcher") => (known ? highs.filter((s) => costs.get(s.typeId!)?.hardpoint === kind).length : null);
    return {
      turret: { total: stats.turret_hardpoints, used: used("turret") },
      launcher: { total: stats.launcher_hardpoints, used: used("launcher") },
    };
  }, [stats, model.slots, costs]);

  const calibration = useMemo(() => {
    if (!stats || stats.calibration <= 0) return null;
    const rigs = model.slots.filter((s) => s.group === "rig" && s.typeId != null);
    if (!rigs.every((s) => costs.has(s.typeId!))) return null;
    const used = rigs.reduce((sum, s) => sum + (costs.get(s.typeId!)?.calibration ?? 0), 0);
    return { label: "Calibration", used, total: stats.calibration };
  }, [stats, model.slots, costs]);

  return (
    <div>
      <FittingDial
        shipTypeId={shipTypeId}
        shipTypeName={shipTypeName}
        counts={model.counts}
        slots={model.slots}
        hardpoints={hardpoints}
        calibration={calibration}
        mode="view"
        onShipClick={() => onSelectItem({ id: shipTypeId, name: shipTypeName })}
        onSlotClick={(slot) => {
          if (slot.typeId != null && slot.name) onSelectItem({ id: slot.typeId, name: slot.name });
        }}
      />
      <p className="fit-dial-legend">
        <span className="fit-dial-legend-destroyed">&#10005; destroyed</span>
        <span className="fit-dial-legend-dropped">&#10003; dropped</span>
        <span>Click any icon to open it in the Market Browser.</span>
      </p>
    </div>
  );
}

export default KillFittingDial;
