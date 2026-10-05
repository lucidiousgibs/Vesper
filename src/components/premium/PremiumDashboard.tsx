import type { ReactNode } from "react";
import { Plus, Scale, ShieldAlert, GraduationCap, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import CharacterCard from "../CharacterCard";
import NewsTicker from "../NewsTicker";
import LiveActivityTicker from "../LiveActivityTicker";
import Annunciator from "./Annunciator";
import MechanicalButton from "./MechanicalButton";
import TelemetryRail from "./TelemetryRail";
import ScreenHousing from "./ScreenHousing";
import TechnicalLabel from "./TechnicalLabel";
import RollingNumber from "./RollingNumber";
import { formatIsk, formatSp } from "../../lib/format";
import type { CharacterOverview, SessionCharacter } from "../../lib/eve";
import { usePersistentState } from "../../hooks/usePersistentState";

/** The dashboard's modules sit in two racks (a row of three, a row of two) that the pilot can
 * rearrange with the arrows in each module's title bar. The order is saved, and Reset
 * layout puts it back. A module can only move within its own rack, and a saved order that
 * no longer matches (a module added or removed in a later version) falls back to the default. */
interface RackLayout {
  zones: string[];
  monitors: string[];
}

const DEFAULT_RACK: RackLayout = { zones: ["sysstate", "primary", "alerts"], monitors: ["comms", "activity"] };

function sameMembers(a: unknown, b: string[]): a is string[] {
  return Array.isArray(a) && a.length === b.length && b.every((id) => a.includes(id));
}

function sanitizeRack(raw: Partial<RackLayout>): RackLayout {
  return {
    zones: sameMembers(raw?.zones, DEFAULT_RACK.zones) ? raw.zones : DEFAULT_RACK.zones,
    monitors: sameMembers(raw?.monitors, DEFAULT_RACK.monitors) ? raw.monitors : DEFAULT_RACK.monitors,
  };
}

interface PremiumDashboardProps {
  characters: SessionCharacter[];
  overviews: Record<number, CharacterOverview | null>;
  activeCharacterName: string;
  pending: boolean;
  onOpenDetail: (id: number) => void;
  onAccountAction: () => void;
  onCancel: () => void;
  onCompare: () => void;
}

/** VESPER MAIN BRIDGE STATION - a genuinely different composition from the
 * standard Dashboard, not a reskin of the same character-grid-plus-tickers
 * stack. Shares 100% of Dashboard.tsx's data-fetching/session logic (this
 * component receives everything as props, fetches nothing itself) and
 * reuses CharacterCard as-is for the real per-character data - only the
 * surrounding console composition and the three new zones (SYS STATE,
 * ALERT BANK, the telemetry rail) are new, and every value in those three
 * is derived from real, already-fetched state, never invented.
 *
 * Composition, roughly following the brief's own mockup:
 *   COMMAND STATUS header
 *   SYS STATE (left) | CAPSULEER STATUS (center, the character cards) | ALERT BANK (right)
 *   FLEET TELEMETRY rail (aggregate real numbers across every connected character)
 *   two auxiliary monitors (the existing NewsTicker/LiveActivityTicker, reframed) */
function PremiumDashboard({
  characters,
  overviews,
  activeCharacterName,
  pending,
  onOpenDetail,
  onAccountAction,
  onCancel,
  onCompare,
}: PremiumDashboardProps) {
  const [rack, setRack] = usePersistentState<RackLayout>("vesper.dashboard.rack", DEFAULT_RACK, sanitizeRack);
  const customised = rack.zones.join() !== DEFAULT_RACK.zones.join() || rack.monitors.join() !== DEFAULT_RACK.monitors.join();

  /** Moves a module one place earlier (-1) or later (+1) within its own rack. */
  function move(group: keyof RackLayout, id: string, direction: -1 | 1) {
    setRack((prev) => {
      const list = [...prev[group]];
      const from = list.indexOf(id);
      const to = from + direction;
      if (from < 0 || to < 0 || to >= list.length) return prev;
      [list[from], list[to]] = [list[to], list[from]];
      return { ...prev, [group]: list };
    });
  }

  /** The arrows for one module's title bar; an end of the rack has no arrow past it. */
  function rackControls(group: keyof RackLayout, id: string, title: string) {
    const index = rack[group].indexOf(id);
    return (
      <>
        <button type="button" className="rack-move" disabled={index <= 0} onClick={() => move(group, id, -1)} aria-label={`Move ${title} earlier`} title="Move earlier">
          <ChevronLeft size={12} strokeWidth={2} />
        </button>
        <button type="button" className="rack-move" disabled={index < 0 || index >= rack[group].length - 1} onClick={() => move(group, id, 1)} aria-label={`Move ${title} later`} title="Move later">
          <ChevronRight size={12} strokeWidth={2} />
        </button>
      </>
    );
  }

  const loadedOverviews = characters.map((c) => overviews[c.id]).filter((o): o is CharacterOverview => o != null);
  // undefined = "fetch hasn't resolved yet" (see Dashboard.tsx's
  // Record<id, CharacterOverview | null> - null specifically means "fetch
  // resolved, no data" - the ESI link lamp only cares whether the fetch
  // pipeline itself has produced anything at all, loaded or not).
  const anyResolved = characters.some((c) => overviews[c.id] !== undefined);
  // Named lists for the Alert Bank's severity cards below - the Annunciators
  // already show on/off state; these add the one thing that doesn't fit a
  // lamp: WHICH characters. Built in one pass (rather than a separate
  // .filter() per list plus a linear characters.find() per name) since every
  // loaded overview needs to land in exactly one of reauthNames/idleNames'
  // sibling training list anyway. reauthCount/trainingCount are just these
  // lists' own .length - no separate counts to keep in sync.
  const characterNameById = new Map(characters.map((c) => [c.id, c.name]));
  const reauthNames: string[] = [];
  const trainingNames: string[] = [];
  const idleNames: string[] = [];
  for (const o of loadedOverviews) {
    const name = characterNameById.get(o.character_id) ?? "Unknown";
    if (o.needs_reauth) reauthNames.push(name);
    // An idle skill queue is the amber "worth a look" case - not urgent like
    // reauth, but a wasted skill queue is a real thing worth surfacing by name.
    if (o.training_skill_name) trainingNames.push(name);
    else idleNames.push(name);
  }
  const reauthCount = reauthNames.length;
  const trainingCount = trainingNames.length;
  const totalIsk = loadedOverviews.reduce((sum, o) => sum + (o.isk_balance ?? 0), 0);
  const totalSp = loadedOverviews.reduce((sum, o) => sum + (o.total_sp ?? 0), 0);
  const anyIskKnown = loadedOverviews.some((o) => o.isk_balance != null);
  const anySpKnown = loadedOverviews.some((o) => o.total_sp != null);

  const zoneNodes: Record<string, ReactNode> = {
    sysstate: (
      <ScreenHousing key="sysstate" title="Sys State" className="premium-dashboard-sysstate" actions={rackControls("zones", "sysstate", "Sys State")}>
          {/* Amber ("attention") rather than dark while the first overview
             fetch is still in flight - a dark lamp here read as "is this
             thing even working?" exactly like the Alert Bank's old off
             state did, before every real lamp in this file went always-lit. */}
          <Annunciator label="ESI LINK" state={anyResolved ? "calm" : "attention"} />
          <Annunciator label="SYNC" state={anyResolved ? "calm" : "attention"} />
          <Annunciator label="CACHE" state="calm" />
        </ScreenHousing>
    ),
    primary: (
      <ScreenHousing key="primary" title="Capsuleer Status" className="premium-dashboard-primary" actions={rackControls("zones", "primary", "Capsuleer Status")}>
          <div className="character-grid">
            {characters.map((character) => (
              <CharacterCard
                key={character.id}
                character={character}
                overview={overviews[character.id]}
                isActive={false}
                pending={pending}
                onSelect={() => onOpenDetail(character.id)}
                onReauth={onAccountAction}
              />
            ))}
            <button type="button" className="character-card character-card-add" onClick={onAccountAction} disabled={pending}>
              <Plus size={20} strokeWidth={1.75} />
              <span>Add Character</span>
              <span className="character-card-add-hint">Sign in with EVE to get started</span>
            </button>
          </div>
        </ScreenHousing>
    ),
    alerts: (
      <ScreenHousing key="alerts" title="Alert Bank" className="premium-dashboard-alerts" actions={rackControls("zones", "alerts", "Alert Bank")}>
          {/* Grey until abnormal: a quiet grey lamp with the word OK means "checked,
             all clear" (never dark, which read as unknown), amber (attention) is
             something worth a look but not urgent, red (danger) is something that
             actually needs doing and can be acknowledged to stop its blink.
             REAUTH/TRAINING specifically stay amber ("checking...") until at
             least one overview has actually resolved - otherwise an account
             with nothing loaded yet showed a false green "no reauth needed"
             and a false amber "nobody training", neither of which had been
             checked. */}
          <Annunciator label="SIGN-IN" state={pending ? "attention" : "calm"} />
          <Annunciator label="REAUTH" state={!anyResolved ? "attention" : reauthCount > 0 ? "danger" : "calm"} />
          <Annunciator label="TRAINING" state={!anyResolved ? "attention" : trainingCount > 0 ? "calm" : "attention"} />
          {/* No separate "all clear" fallback card - every loaded character
             lands in exactly one of Training active / Not training below
             (training_skill_name is either set or it isn't), so those two
             lists already cover the full picture together; a 4th summary
             card could only ever fire when it overlapped one of these two,
             which is exactly the bug that was here before. */}
          <div className="premium-dashboard-alert-cards">
            {reauthCount > 0 && (
              <div className="severity-card severity-card-danger">
                <div className="severity-card-header">
                  <ShieldAlert size={14} strokeWidth={2} />
                  Reauth needed
                </div>
                <ul className="severity-card-body severity-card-list">
                  {reauthNames.map((name) => (
                    <li key={name}>{name}</li>
                  ))}
                </ul>
              </div>
            )}
            {trainingCount > 0 && (
              <div className="severity-card severity-card-success">
                <div className="severity-card-header">
                  <GraduationCap size={14} strokeWidth={2} />
                  Training active
                </div>
                <ul className="severity-card-body severity-card-list">
                  {trainingNames.map((name) => (
                    <li key={name}>{name}</li>
                  ))}
                </ul>
              </div>
            )}
            {idleNames.length > 0 && (
              <div className="severity-card severity-card-attention">
                <div className="severity-card-header">
                  <GraduationCap size={14} strokeWidth={2} />
                  Not training
                </div>
                <ul className="severity-card-body severity-card-list">
                  {idleNames.map((name) => (
                    <li key={name}>{name}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </ScreenHousing>
    ),
  };
  const monitorNodes: Record<string, ReactNode> = {
    comms: (
      <ScreenHousing key="comms" title="Comms Feed" className="premium-dashboard-monitor" actions={rackControls("monitors", "comms", "Comms Feed")}>
          <NewsTicker />
        </ScreenHousing>
    ),
    activity: (
      <ScreenHousing key="activity" title="Activity Scope" className="premium-dashboard-monitor" actions={rackControls("monitors", "activity", "Activity Scope")}>
          <LiveActivityTicker />
        </ScreenHousing>
    ),
  };

  return (
    <div className="premium-dashboard">
      <div className="premium-dashboard-header">
        <div>
          <TechnicalLabel>SYS.CMD / DECK 01</TechnicalLabel>
          <h2>Command Status // Capsuleer Operations</h2>
          <p className="premium-dashboard-subtitle">Welcome back, {activeCharacterName}</p>
        </div>
        <div className="premium-dashboard-header-actions">
          {customised && (
            <MechanicalButton onClick={() => setRack(DEFAULT_RACK)}>
              <RotateCcw size={13} strokeWidth={2} /> Reset layout
            </MechanicalButton>
          )}
          {characters.length > 1 && (
            <MechanicalButton onClick={onCompare}>
              <Scale size={13} strokeWidth={2} /> Compare Skills
            </MechanicalButton>
          )}
          {pending && (
            <div className="dashboard-pending">
              <span>Waiting for you to finish signing in...</span>
              <button type="button" className="dashboard-pending-cancel" onClick={onCancel}>
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      <TelemetryRail
        items={[
          { label: "Pilots", value: String(characters.length) },
          { label: "Total ISK", value: anyIskKnown ? <RollingNumber id="fleet-isk" value={totalIsk} format={formatIsk} /> : "—" },
          { label: "Total SP", value: anySpKnown ? <RollingNumber id="fleet-sp" value={totalSp} format={formatSp} /> : "—" },
          { label: "Training", value: `${trainingCount}/${characters.length}` },
          { label: "Reauth Needed", value: String(reauthCount) },
        ]}
      />

      <div className="premium-dashboard-zones">
        {rack.zones.map((id) => zoneNodes[id])}
      </div>

      <div className="premium-dashboard-monitors">
        {rack.monitors.map((id) => monitorNodes[id])}
      </div>
    </div>
  );
}

export default PremiumDashboard;
