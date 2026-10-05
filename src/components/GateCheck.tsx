import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction, type SyntheticEvent } from "react";
import { X, ArrowLeftRight, Star } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { confirm as confirmDialog } from "@tauri-apps/plugin-dialog";
import { getMapData, type MapSystem } from "../lib/map";
import { planGateCheck, getGateActivity, type RoutePreference, type GateCheckSystem, type GateKillEvent } from "../lib/route";
import { getSystemKillHeat } from "../lib/kills";
import { useErrorReporter } from "../hooks/useErrorReporter";
import { securityColor, formatSecurity } from "../lib/format";
import { useSavedRoutes, type SavedRoute } from "../hooks/useSavedRoutes";
import { setAutopilotWaypoint, type SessionCharacter } from "../lib/eve";
import type { SystemSummary } from "./SystemKillboard";
import type { GateSummary } from "./GateKillboard";
import { useTheme, isPremiumTheme } from "../hooks/useTheme";
import { logEvent } from "../lib/eventLog";
import { playCue } from "../lib/cues";
import SegmentBar, { ThreatState, type SegmentBand, type SegmentTone } from "./premium/SegmentBar";
import Sparkline from "./premium/Sparkline";
import ScanPulse from "./premium/ScanPulse";

/** Kills older than this don't count as "recent" for a gate's danger rating - same window the map's heat overlay uses. */
const RECENT_WINDOW_MS = 60 * 60 * 1000;

/** What a route waypoint needs from a system (a full MapSystem satisfies it). */
type SlotSystem = Pick<MapSystem, "id" | "name" | "security">;

interface Slot {
  key: number;
  query: string;
  system: SlotSystem | null;
  results: MapSystem[];
}

function emptySlot(key: number): Slot {
  return { key, query: "", system: null, results: [] };
}

type SlotSetter = Dispatch<SetStateAction<Slot[]>>;

interface GateBreakdown {
  gateName: string;
  gateId: number | null;
  count: number;
}

interface RouteRow extends GateCheckSystem {
  /** Every kill anywhere in the system in the last hour, regardless of
   * whether it happened near a gate - so a system that's simply a busy
   * fight elsewhere (not a gate camp) still reads as "something's
   * happening here" instead of a misleadingly clear 0. */
  totalSystemKills: number;
  totalGateKills: number;
  gates: GateBreakdown[];
  smartbomb: boolean;
  interdictor: boolean;
  capital: boolean;
  citadel: boolean;
  mobileBubble: boolean;
}

/** Premium decks draw a gate-kill count as a segmented bar with killBand's own
 * zones (1 to 2 caution, 3 and up danger), one cell per kill up to twelve. A
 * route system can read Danger with an empty bar when a threat flag (smartbombs,
 * HICs and so on) is the reason, which is why the shape and word come from
 * killBand and not from the bar. */
const GATE_BAR_MAX = 12;
const GATE_BANDS: SegmentBand[] = [
  { upTo: 2, tone: "caution" },
  { upTo: GATE_BAR_MAX, tone: "critical" },
];
const BAND_TONE: Record<"safe" | "caution" | "danger", SegmentTone> = { safe: "ok", caution: "caution", danger: "critical" };
const BAND_TEXT: Record<"safe" | "caution" | "danger", string> = { safe: "Clear", caution: "Caution", danger: "Danger" };

const HAS_THREAT_FLAG = (row: RouteRow) => row.smartbomb || row.interdictor || row.capital || row.citadel || row.mobileBubble;

function killBand(row: RouteRow): "safe" | "caution" | "danger" {
  if (HAS_THREAT_FLAG(row)) return "danger";
  if (row.totalGateKills <= 0) return "safe";
  if (row.totalGateKills <= 2) return "caution";
  return "danger";
}

/** The Info column's threat-flag lines - the per-gate kill-count lines are
 * rendered separately (see the table body below) since those need to be
 * clickable, not plain text. */
function threatLines(row: RouteRow): string[] {
  const lines: string[] = [];
  if (row.smartbomb) lines.push("Smartbombs used.");
  if (row.interdictor) lines.push("HICs/dictors used.");
  if (row.mobileBubble) lines.push("Mobile bubbles used.");
  if (row.capital) lines.push("Capitals used.");
  if (row.citadel) lines.push("Citadels used.");
  return lines;
}

/** Gate-attributed kills in one system, in six ten-minute slices over the last hour,
 * oldest first. Counted from each kill's own timestamp in the events already fetched,
 * so it always agrees with the bar beside it. */
function gateKillBins(events: GateKillEvent[], systemId: number, now: number): number[] {
  const bins = [0, 0, 0, 0, 0, 0];
  for (const e of events) {
    if (e.system_id !== systemId || e.gate_name == null) continue;
    const t = Date.parse(e.time);
    if (!Number.isFinite(t)) continue;
    const ago = Math.max(0, now - t);
    if (ago >= 60 * 60 * 1000) continue;
    bins[5 - Math.min(5, Math.floor(ago / (10 * 60 * 1000)))] += 1;
  }
  return bins;
}

function dotlanName(name: string): string {
  return name.replace(/ /g, "_");
}

interface GateCheckProps {
  onSelectSystem: (system: SystemSummary) => void;
  onSelectGate: (gate: GateSummary) => void;
  /** Set by the Map tab's "Send Route to Gate Check" button - pre-fills the
   * waypoint slots with these systems and immediately runs the check, so
   * the whole point (quickly seeing if a route you're about to fly has
   * camps on it) doesn't need a second manual "Check!" click. One-shot,
   * consumed via onConsumeInitialWaypoints once applied. */
  initialWaypoints?: SlotSystem[] | null;
  onConsumeInitialWaypoints?: () => void;
  /** For the "Push Route to EVE Online" button - which logged-in character to
   * push the computed route's waypoints to. */
  characters: SessionCharacter[];
  /** Called with the full computed route right after it's successfully
   * pushed to autopilot, so the Map tab can draw the exact same path - see
   * MapView's own pushedRoute prop for why that's its own thing rather than
   * just setting a destination there. */
  onRoutePushed?: (systems: { id: number; name: string }[]) => void;
}

function GateCheck({
  onSelectSystem,
  onSelectGate,
  initialWaypoints,
  onConsumeInitialWaypoints,
  characters,
  onRoutePushed,
}: GateCheckProps) {
  const [theme] = useTheme();
  const premium = isPremiumTheme(theme);
  const [mapSystems, setMapSystems] = useState<MapSystem[]>([]);
  const [waypoints, setWaypoints] = useState<Slot[]>([emptySlot(0), emptySlot(1)]);
  const [avoids, setAvoids] = useState<Slot[]>([emptySlot(100)]);
  const [preference, setPreference] = useState<RoutePreference>("shortest");
  // Kept as the raw route + unfiltered events, not pre-computed rows - rows
  // are derived below via useMemo against a ticking clock, so a kill that
  // was inside the 1h window at check-time actually drops back out of the
  // count on its own as real time passes, instead of staying "recent"
  // forever until the next manual Check! click.
  const [routeSystems, setRouteSystems] = useState<GateCheckSystem[] | null>(null);
  const [rawEvents, setRawEvents] = useState<GateKillEvent[]>([]);
  /** Whole-system last-hour kill counts, keyed by system_id - the same
   * uncapped local-store aggregate the Map's heat glow uses (getSystemKillHeat),
   * kept separate from the gate-specific totalGateKills below rather than
   * folded into it: a system can be full of activity that never lands
   * within 100km of any of its gates, and that's still worth knowing before
   * jumping through it. */
  const [systemTotals, setSystemTotals] = useState<Map<number, number>>(new Map());
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [checking, setChecking] = useState(false);
  const [scanTick, setScanTick] = useState(0);
  const keyCounterRef = useRef(200);
  const reportError = useErrorReporter();
  const { routes: savedRoutes, addRoute, removeRoute } = useSavedRoutes();
  const [saveNameDraft, setSaveNameDraft] = useState("");

  useEffect(() => {
    getMapData()
      .then((data) => setMapSystems(data.systems))
      .catch((err) => reportError(`Failed to load system list: ${String(err)}`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function loadSystemTotals() {
    getSystemKillHeat()
      .then((heat) => setSystemTotals(new Map(heat.map((h) => [h.system_id, h.kill_count]))))
      .catch((err) => reportError(`Failed to load system kill totals: ${String(err)}`));
  }

  // Ticks the clock every 30s so the derived rows below (see the useMemo)
  // re-run and drop any kill that's aged out of the rolling 1h window,
  // without needing another Check! click - a gate that was "3 kills, 1h
  // ago" should read as clear again on its own once that hour's up. Also
  // refreshes the whole-system totals on the same cadence - unlike
  // rawEvents (individual timestamped events the memo below ages out
  // itself), systemTotals is a pre-aggregated count that only goes stale by
  // being re-fetched.
  useEffect(() => {
    loadSystemTotals();
    const interval = setInterval(() => {
      setNowTick(Date.now());
      loadSystemTotals();
    }, 30_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = useMemo<RouteRow[] | null>(() => {
    if (!routeSystems) return null;
    const recent = rawEvents.filter((e) => nowTick - new Date(e.time).getTime() < RECENT_WINDOW_MS);

    const bySystem = new Map<number, GateKillEvent[]>();
    for (const event of recent) {
      const list = bySystem.get(event.system_id);
      if (list) list.push(event);
      else bySystem.set(event.system_id, [event]);
    }

    return routeSystems.map((s) => {
      const sysEvents = bySystem.get(s.id) ?? [];
      const gateCounts = new Map<string, { count: number; gateId: number | null }>();
      for (const event of sysEvents) {
        if (!event.gate_name) continue;
        const existing = gateCounts.get(event.gate_name);
        gateCounts.set(event.gate_name, { count: (existing?.count ?? 0) + 1, gateId: event.gate_id });
      }
      const gates = [...gateCounts.entries()].map(([gateName, g]) => ({ gateName, gateId: g.gateId, count: g.count }));
      return {
        ...s,
        totalSystemKills: systemTotals.get(s.id) ?? 0,
        totalGateKills: gates.reduce((sum, g) => sum + g.count, 0),
        gates,
        smartbomb: sysEvents.some((e) => e.smartbomb),
        interdictor: sysEvents.some((e) => e.interdictor),
        capital: sysEvents.some((e) => e.capital),
        citadel: sysEvents.some((e) => e.citadel),
        mobileBubble: sysEvents.some((e) => e.mobile_bubble),
      };
    });
  }, [routeSystems, rawEvents, nowTick, systemTotals]);

  function updateSlots(setter: SlotSetter, index: number, patch: Partial<Slot>) {
    setter((slots) => slots.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function handleQueryChange(setter: SlotSetter, index: number, value: string) {
    const lower = value.toLowerCase().trim();
    const results = lower.length < 2 ? [] : mapSystems.filter((s) => s.name.toLowerCase().includes(lower)).slice(0, 8);
    updateSlots(setter, index, { query: value, system: null, results });
  }

  function pickSystem(
    setter: SlotSetter,
    slots: Slot[],
    index: number,
    system: MapSystem,
  ) {
    const isLast = index === slots.length - 1;
    setter((prev) => {
      const next = prev.map((s, i) => (i === index ? { ...s, query: system.name, system, results: [] } : s));
      if (isLast) next.push(emptySlot(++keyCounterRef.current));
      return next;
    });
  }

  function removeSlot(setter: SlotSetter, index: number) {
    setter((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0 || next[next.length - 1].system) {
        next.push(emptySlot(++keyCounterRef.current));
      }
      return next;
    });
  }

  // Extracted from handleCheck so the initialWaypoints effect below can run
  // a check against explicit ids immediately, rather than relying on
  // `waypoints` state that a just-called setWaypoints hasn't applied yet
  // within the same effect.
  async function runGateCheck(waypointIds: number[], avoidIds: number[], routePreference: RoutePreference): Promise<boolean> {
    if (waypointIds.length < 2) {
      reportError("Pick at least a start and destination system.");
      return false;
    }
    setChecking(true);
    try {
      const result = await planGateCheck(waypointIds, avoidIds, routePreference);
      const routeSystemIds = result.systems.map((s) => s.id);
      const events = await getGateActivity(routeSystemIds).catch(() => []);
      setRouteSystems(result.systems);
      setRawEvents(events);
      setNowTick(Date.now());
      setScanTick((n) => n + 1);
      // Three or more gate kills along the route is the same line killBand draws for danger.
      playCue(events.length >= 3 ? "route" : "scan");
      return true;
    } catch (err) {
      reportError(`Failed to plan route: ${String(err)}`);
      return false;
    } finally {
      setChecking(false);
    }
  }

  async function handleCheck() {
    setReverseNotice(null);
    const waypointIds = waypoints.filter((s) => s.system).map((s) => s.system!.id);
    const avoidIds = avoids.filter((s) => s.system).map((s) => s.system!.id);
    await runGateCheck(waypointIds, avoidIds, preference);
  }

  /** Instant, styled hover label for the saved-journey chip's small icon
   * buttons - a plain title="" attribute only appears after a long delay
   * (easy to mistake for there being no tooltip at all) and can't be
   * styled. Fixed-positioned from the button's own bounding rect and
   * clamped to the viewport, rather than a CSS ::after, so it can't be
   * clipped by a scrolling/overflow:hidden ancestor or run off the page
   * edge for a chip sitting near the right. */
  const [chipTip, setChipTip] = useState<{ text: string; left: number; top: number } | null>(null);

  /** Confirmation shown after a saved journey's reverse button re-runs the
   * check in the opposite direction - without it, the only sign anything
   * happened would be the results quietly changing. Fades on its own after
   * a few seconds, and is cleared by any manual Check!. */
  const [reverseNotice, setReverseNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!reverseNotice) return;
    const timer = setTimeout(() => setReverseNotice(null), 8000);
    return () => clearTimeout(timer);
  }, [reverseNotice]);

  function showChipTip(e: SyntheticEvent<HTMLElement>, text: string) {
    const rect = e.currentTarget.getBoundingClientRect();
    const halfWidth = 150;
    const left = Math.min(Math.max(rect.left + rect.width / 2, halfWidth + 8), window.innerWidth - halfWidth - 8);
    setChipTip({ text, left, top: rect.bottom + 8 });
  }

  const [autopilotCharacterId, setAutopilotCharacterId] = useState<number | "none">("none");
  const [pushingAutopilot, setPushingAutopilot] = useState(false);
  const [autopilotPushed, setAutopilotPushed] = useState(0);

  /** Pushes every system on the computed route, not just the final
   * destination, as a queued autopilot waypoint (first call clears any
   * existing queue, every call after appends) - this is the actual fix for
   * "the game flew a different route than the Secure/Unsecure/Shortest I
   * picked here": ESI has no way to read or override the client's own
   * route-preference setting (confirmed against the full ESI spec), but a
   * queue of directly gate-adjacent systems leaves that setting nothing left
   * to decide between - there's only ever one gate linking each pushed pair. */
  async function handleSetAutopilot() {
    if (!routeSystems || routeSystems.length < 2 || autopilotCharacterId === "none") return;
    const confirmed = await confirmDialog(
      "This queues every system on this route as an autopilot waypoint, in order - not just the destination.\n\n" +
        "Because of that, your EVE client's own Shortest/Safest/Less-Safe autopilot preference has nothing left to " +
        "decide between any two steps - this exact path will fly regardless of what it's set to in-game.\n\n" +
        "Continue?",
      { title: "Push Route to EVE Online", kind: "info" },
    );
    if (!confirmed) return;
    setPushingAutopilot(true);
    setAutopilotPushed(0);
    try {
      for (let i = 0; i < routeSystems.length; i++) {
        await setAutopilotWaypoint(autopilotCharacterId, routeSystems[i].id, false, i === 0);
        setAutopilotPushed(i + 1);
      }
      logEvent("info", "NAV", `Route pushed to autopilot: ${routeSystems.length} waypoints, ${routeSystems[0].name} to ${routeSystems[routeSystems.length - 1].name}`);
      playCue("confirm");
      onRoutePushed?.(routeSystems.map((s) => ({ id: s.id, name: s.name })));
    } catch (err) {
      reportError(`Failed to push route to EVE Online: ${String(err)}`);
    } finally {
      setPushingAutopilot(false);
    }
  }

  // One-shot: a route sent over from the Map tab pre-fills the waypoint
  // slots (so it's visible/editable exactly like a manually-typed route)
  // and runs immediately, rather than making the user click Check! again
  // for something they just asked to check.
  useEffect(() => {
    if (!initialWaypoints || initialWaypoints.length < 2) return;
    const slots: Slot[] = initialWaypoints.map((sys) => ({
      key: ++keyCounterRef.current,
      query: sys.name,
      system: sys,
      results: [],
    }));
    slots.push(emptySlot(++keyCounterRef.current));
    setWaypoints(slots);
    setRouteSystems(null);
    onConsumeInitialWaypoints?.();
    runGateCheck(
      initialWaypoints.map((s) => s.id),
      [],
      preference,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialWaypoints]);

  function openLink(url: string) {
    openUrl(url).catch((err) => reportError(`Failed to open link: ${String(err)}`));
  }

  const selectedWaypoints = waypoints.filter((s) => s.system);
  const suggestedRouteName = selectedWaypoints.map((s) => s.system!.name).join(" → ");

  function loadSavedRoute(route: SavedRoute, reversed: boolean) {
    const systems = reversed ? [...route.systems].reverse() : route.systems;
    const slots: Slot[] = systems.map((sys) => ({
      key: ++keyCounterRef.current,
      query: sys.name,
      system: { id: sys.id, name: sys.name, security: sys.security, region_id: 0, constellation_id: 0, x: 0, y: 0 },
      results: [],
    }));
    slots.push(emptySlot(++keyCounterRef.current));
    setWaypoints(slots);
    setRouteSystems(null);

    // Reversing is "I want to check the way back" - loading the slots alone
    // would leave the old direction's results gone and nothing in their
    // place until a manual Check!, so it re-runs the check itself, using the
    // preference and avoid list currently set in the form, and says so.
    if (reversed) {
      const label = systems.map((s) => s.name).join(" → ");
      setReverseNotice(`Route reversed - checking ${label}...`);
      const avoidIds = avoids.filter((s) => s.system).map((s) => s.system!.id);
      void runGateCheck(
        systems.map((s) => s.id),
        avoidIds,
        preference,
      ).then((ok) =>
        setReverseNotice(
          ok
            ? `Route reversed and re-checked - now ${label}`
            : `Route reversed to ${label}, but the re-check failed - press Check! to try again`,
        ),
      );
    } else {
      setReverseNotice(null);
    }
  }

  function saveCurrentRoute() {
    if (selectedWaypoints.length < 2) {
      reportError("Pick at least a start and destination system before saving a journey.");
      return;
    }
    const name = saveNameDraft.trim() || suggestedRouteName;
    addRoute({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      systems: selectedWaypoints.map((s) => ({ id: s.system!.id, name: s.system!.name, security: s.system!.security })),
    });
    setSaveNameDraft("");
  }

  function renderSlotRow(
    slots: Slot[],
    setter: SlotSetter,
    joiner: string,
  ) {
    return (
      <div className="gatecheck-slots">
        {slots.map((slot, index) => (
          <div key={slot.key} className="gatecheck-slot-group">
            {index > 0 && <span className="gatecheck-joiner">{joiner}</span>}
            <div className="gatecheck-slot">
              {slot.system ? (
                <span className="gatecheck-chip">
                  {slot.system.name}
                  <span className="kills-security" style={{ color: securityColor(slot.system.security) }}>
                    {formatSecurity(slot.system.security)}
                  </span>
                  <button type="button" onClick={() => removeSlot(setter, index)} aria-label="Remove">
                    <X size={11} strokeWidth={2.5} className="icon-danger" />
                  </button>
                </span>
              ) : (
                <>
                  <input
                    type="text"
                    placeholder="System name..."
                    value={slot.query}
                    onChange={(e) => handleQueryChange(setter, index, e.target.value)}
                  />
                  {slot.results.length > 0 && (
                    <div className="gatecheck-slot-results">
                      {slot.results.map((system) => (
                        <button key={system.id} type="button" onClick={() => pickSystem(setter, slots, index, system)}>
                          <span className="kills-security" style={{ color: securityColor(system.security) }}>
                            {formatSecurity(system.security)}
                          </span>
                          {system.name}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }

  let lastRegion: string | null = null;

  return (
    <div className="gatecheck-page">
        <div className="gatecheck-form">
          {savedRoutes.length > 0 && (
            <div className="gatecheck-form-row">
              <span className="gatecheck-label">Saved journeys</span>
              <div className="gatecheck-saved-routes">
                {savedRoutes.map((route) => (
                  <span key={route.id} className="gatecheck-saved-chip">
                    <button type="button" onClick={() => loadSavedRoute(route, false)}>
                      {route.name}
                    </button>
                    <button
                      type="button"
                      className="gatecheck-saved-reverse"
                      onClick={() => loadSavedRoute(route, true)}
                      onMouseEnter={(e) => showChipTip(e, `Reverse trip - loads ${[...route.systems].reverse().map((s) => s.name).join(" → ")}`)}
                      onFocus={(e) => showChipTip(e, `Reverse trip - loads ${[...route.systems].reverse().map((s) => s.name).join(" → ")}`)}
                      onMouseLeave={() => setChipTip(null)}
                      onBlur={() => setChipTip(null)}
                      aria-label={`Reverse trip - load ${route.name} in the opposite direction`}
                    >
                      <ArrowLeftRight size={16} strokeWidth={2.4} />
                    </button>
                    <button
                      type="button"
                      className="gatecheck-saved-remove"
                      onClick={() => {
                        setChipTip(null);
                        removeRoute(route.id);
                      }}
                      onMouseEnter={(e) => showChipTip(e, `Delete ${route.name} from your saved journeys`)}
                      onFocus={(e) => showChipTip(e, `Delete ${route.name} from your saved journeys`)}
                      onMouseLeave={() => setChipTip(null)}
                      onBlur={() => setChipTip(null)}
                      aria-label={`Delete saved journey ${route.name}`}
                    >
                      <X size={11} strokeWidth={2.5} className="icon-danger" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="gatecheck-form-row">
            <span className="gatecheck-label">I will be traveling from</span>
            {renderSlotRow(waypoints, setWaypoints, "to")}
          </div>

          {selectedWaypoints.length >= 2 && (
            <div className="gatecheck-form-row">
              <span className="gatecheck-label">Save this journey</span>
              <div className="gatecheck-save-controls">
                <input
                  type="text"
                  value={saveNameDraft}
                  onChange={(e) => setSaveNameDraft(e.target.value)}
                  placeholder={suggestedRouteName}
                />
                <button type="button" className="gatecheck-save-button" onClick={saveCurrentRoute}>
                  <Star size={13} strokeWidth={2} />
                  Save
                </button>
              </div>
            </div>
          )}

          <div className="gatecheck-form-row">
            <span className="gatecheck-label">Avoid these systems</span>
            {renderSlotRow(avoids, setAvoids, "")}
          </div>

          <div className="gatecheck-form-row">
            <span className="gatecheck-label">Prefer</span>
            <div className="gatecheck-preference">
              {(["shortest", "secure", "insecure"] as RoutePreference[]).map((option) => (
                <label key={option} className="gatecheck-radio">
                  <input
                    type="radio"
                    name="gatecheck-preference"
                    checked={preference === option}
                    onChange={() => setPreference(option)}
                  />
                  {option === "shortest" ? "Shortest" : option === "secure" ? "Secure" : "Unsecure"}
                </label>
              ))}
            </div>
          </div>

          <button type="button" className="gatecheck-check-button" onClick={handleCheck} disabled={checking}>
            {checking ? "Checking..." : "Check!"}
          </button>
        </div>

        {reverseNotice && (
          <p className="gatecheck-reverse-notice" role="status">
            <ArrowLeftRight size={15} strokeWidth={2.4} />
            {reverseNotice}
          </p>
        )}

        {rows && (
          <div className="gatecheck-results">
            <p className="gatecheck-results-heading">
              Your route <span>({rows.length - 1} jumps)</span>
            </p>
            <div className="gatecheck-autopilot-row">
              <label className="capital-route-char-picker">
                <span>Push route for</span>
                <select
                  value={autopilotCharacterId}
                  onChange={(e) => setAutopilotCharacterId(e.target.value === "none" ? "none" : Number(e.target.value))}
                >
                  <option value="none">Choose a character...</option>
                  {characters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="gatecheck-check-button"
                disabled={autopilotCharacterId === "none" || pushingAutopilot}
                onClick={handleSetAutopilot}
                title="Queues every system on this route as an autopilot waypoint, in order - not just the destination, so the in-game client's own Shortest/Safest/Less-Safe setting has nothing left to decide"
              >
                {pushingAutopilot ? `Pushing route... ${autopilotPushed}/${routeSystems?.length ?? 0}` : "Push Route to EVE Online"}
              </button>
            </div>
            <p className="gatecheck-caveat">
              This queues every system above as an autopilot waypoint, not just the destination - the client has no
              gate choice left to make between any two, so your Shortest/Secure/Unsecure pick above is what actually
              flies, regardless of what route preference is set in the EVE client itself (ESI has no way to read or
              change that setting).
            </p>
            <p className="gatecheck-caveat">Displaying confirmed kills from the last 60 minutes // EVE Time.</p>
            <p className="gatecheck-caveat">
              Kills automatically expire from this feed once they pass the one-hour threshold. A system showing clear
              now should not be considered safe — new activity can appear at any time.
            </p>
            <p className="gatecheck-caveat">
              High system kill counts do not necessarily indicate gate danger. If no gate activity is detected, the
              fighting may be occurring elsewhere in-system, away from the stargates on your route.
            </p>
            <div className="gatecheck-table-wrap">
              <ScanPulse trigger={scanTick} />
              <table className="gatecheck-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Region</th>
                    <th>System / Sec</th>
                    <th>Total Kills In System (1h)</th>
                    <th>Kills Within 100km Of A Gate (1h)</th>
                    <th>Info</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => {
                    const showRegion = row.region_name !== lastRegion;
                    lastRegion = row.region_name;
                    return (
                      <tr key={`${row.id}-${index}`} className={`gatecheck-row gatecheck-row-${killBand(row)}`}>
                        <td>{index + 1}</td>
                        <td>
                          {showRegion && row.region_name ? (
                            <a
                              href="#"
                              onClick={(e) => {
                                e.preventDefault();
                                openLink(`https://evemaps.dotlan.net/map/${dotlanName(row.region_name)}`);
                              }}
                            >
                              {row.region_name}
                            </a>
                          ) : null}
                        </td>
                        <td>
                          <span className="kills-security" style={{ color: securityColor(row.security) }}>
                            {formatSecurity(row.security)}
                          </span>
                          <span
                            className="kills-system-clickable"
                            role="button"
                            tabIndex={0}
                            onClick={() =>
                              onSelectSystem({
                                id: row.id,
                                name: row.name,
                                security: row.security,
                                regionName: row.region_name || null,
                              })
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                onSelectSystem({
                                  id: row.id,
                                  name: row.name,
                                  security: row.security,
                                  regionName: row.region_name || null,
                                });
                              }
                            }}
                          >
                            {row.name}
                          </span>
                        </td>
                        <td>{row.totalSystemKills}</td>
                        <td>
                          {premium ? (
                            <span className="threat-cell">
                              <span>{row.totalGateKills}</span>
                              <SegmentBar
                                value={row.totalGateKills}
                                max={GATE_BAR_MAX}
                                bands={GATE_BANDS}
                                label={`Kills within 100 km of a gate in ${row.name} in the last hour`}
                                valueText={`${row.totalGateKills} kills, ${BAND_TEXT[killBand(row)].toLowerCase()}`}
                                hatched={row.totalGateKills > 0 && row.totalGateKills < 2}
                              />
                              <ThreatState tone={BAND_TONE[killBand(row)]} text={BAND_TEXT[killBand(row)]} />
                              {row.totalGateKills > 0 && (
                                <Sparkline
                                  values={gateKillBins(rawEvents, row.id, nowTick)}
                                  label={`Gate kills in ${row.name} per ten minutes over the last hour`}
                                />
                              )}
                            </span>
                          ) : (
                            row.totalGateKills
                          )}
                        </td>
                        <td>
                          {row.totalGateKills === 0 && <div>No kills at gates.</div>}
                          {row.gates.map((g) =>
                            g.gateId != null ? (
                              <div key={g.gateName}>
                                {g.count} kill{g.count === 1 ? "" : "s"} at the{" "}
                                <a
                                  href="#"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    onSelectGate({ id: g.gateId!, name: g.gateName, systemId: row.id, systemName: row.name });
                                  }}
                                >
                                  {g.gateName} gate
                                </a>
                                .
                              </div>
                            ) : (
                              <div key={g.gateName}>
                                {g.count} kill{g.count === 1 ? "" : "s"} at the {g.gateName} gate.
                              </div>
                            ),
                          )}
                          {threatLines(row).map((line, i) => (
                            <div key={i}>{line}</div>
                          ))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="gatecheck-legend">
              {[
                ["safe", "0 kills"],
                ["caution", "2 kills or less"],
                ["danger", "3 kills or more"],
                ["danger", "smartbomb kills"],
                ["danger", "hic/dictors used"],
                ["danger", "mobile bubbles used"],
                ["danger", "capitals used"],
                ["danger", "citadels used"],
              ].map(([band, label]) => (
                <div key={label} className="gatecheck-legend-row">
                  <span className={`gatecheck-legend-item gatecheck-row-${band}`}>{label}</span>
                  <span>at gates in system in the past hour</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {chipTip && (
          <div className="gatecheck-chip-tooltip" style={{ left: chipTip.left, top: chipTip.top }} role="tooltip">
            {chipTip.text}
          </div>
        )}
    </div>
  );
}

export default GateCheck;
