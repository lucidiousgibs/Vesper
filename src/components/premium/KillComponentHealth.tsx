import { useTheme, isPremiumTheme } from "../../hooks/useTheme";
import type { KillItemEntry, SlotGroup } from "../../lib/kills";

const GROUPS: { id: SlotGroup; label: string }[] = [
  { id: "high", label: "High slots" },
  { id: "mid", label: "Mid slots" },
  { id: "low", label: "Low slots" },
  { id: "rig", label: "Rigs" },
  { id: "drone", label: "Drones" },
  { id: "cargo", label: "Cargo" },
];

const MAX_CELLS = 16;

/** What became of the ship's fitting, group by group: one cell per item, red where it was
 * destroyed and green where it dropped as loot, the way an equipment panel shows module
 * states. Counted straight from the killmail's own items (charges are not counted as
 * modules), so a group shows exactly the items the item list beneath it shows. A group with
 * more than 16 items draws 16 cells and says how many more there are. Premium decks only. */
function KillComponentHealth({ items }: { items: KillItemEntry[] }) {
  const [theme] = useTheme();
  if (!isPremiumTheme(theme)) return null;

  const rows = GROUPS.map((group) => {
    let destroyed = 0;
    let dropped = 0;
    for (const item of items) {
      if (item.slot_group !== group.id) continue;
      if (item.is_charge && group.id !== "cargo") continue;
      destroyed += item.quantity_destroyed;
      dropped += item.quantity_dropped;
    }
    return { ...group, destroyed, dropped, total: destroyed + dropped };
  }).filter((row) => row.total > 0);

  if (rows.length === 0) return null;

  return (
    <div className="kill-health">
      {rows.map((row) => {
        const cells: ("destroyed" | "dropped")[] = [];
        for (let i = 0; i < row.destroyed && cells.length < MAX_CELLS; i++) cells.push("destroyed");
        for (let i = 0; i < row.dropped && cells.length < MAX_CELLS; i++) cells.push("dropped");
        const extra = row.total - cells.length;
        return (
          <div className="kill-health-row" key={row.id}>
            <span className="kill-health-label">{row.label}</span>
            <span
              className="kill-health-cells"
              role="img"
              aria-label={`${row.label}: ${row.destroyed} destroyed, ${row.dropped} dropped`}
            >
              {cells.map((state, i) => (
                <i key={i} className={`kill-health-cell kill-health-cell-${state}`} />
              ))}
              {extra > 0 && <span className="kill-health-extra">+{extra}</span>}
            </span>
            <span className="kill-health-counts">
              <span className="kill-health-destroyed">&#9632; {row.destroyed}</span>
              <span className="kill-health-dropped">&#9679; {row.dropped}</span>
            </span>
          </div>
        );
      })}
      <p className="kill-health-key">
        <span className="kill-health-destroyed">&#9632; destroyed</span> <span className="kill-health-dropped">&#9679; dropped as loot</span>
      </p>
    </div>
  );
}

export default KillComponentHealth;
