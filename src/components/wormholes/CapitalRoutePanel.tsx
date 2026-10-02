import { useEffect, useState } from "react";
import { Rocket, X, Trash2 } from "lucide-react";
import { searchMarketTypes, getJumpDriveInfo, type TypeSearchMatch, type JumpDriveInfo } from "../../lib/market";
import { searchSystemsLive, getSystemPositions, type SystemSearchMatch } from "../../lib/map";
import { getCharacterSkills, type SessionCharacter } from "../../lib/eve";
import { typeIconUrl } from "../../lib/format";
import {
  planCapitalRoute,
  planAutoRoute,
  JUMP_DRIVE_CALIBRATION_SKILL_ID,
  JUMP_FUEL_CONSERVATION_SKILL_ID,
  JUMP_FUEL_TYPE_NAMES,
  type RoutePosition,
  type CapitalRoutePlan,
} from "../../lib/capitalRoute";
import { getSystemKillHeat, type SystemKillHeat } from "../../lib/kills";
import { planGateCheck, getGateActivity } from "../../lib/route";
import { useErrorReporter } from "../../hooks/useErrorReporter";

interface CapitalRoutePanelProps {
  characters: SessionCharacter[];
  onClose: () => void;
}

function ShipSearchBox({ onPick }: { onPick: (match: TypeSearchMatch) => void }) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<TypeSearchMatch[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      searchMarketTypes(trimmed)
        .then((results) => {
          if (cancelled) return;
          setSuggestions(results);
          setOpen(results.length > 0);
        })
        .catch(() => {
          if (!cancelled) setSuggestions([]);
        });
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  return (
    <div className="kills-add-combobox">
      <input
        type="text"
        placeholder="Search for a capital ship..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
      />
      {open && (
        <div className="gatecheck-slot-results kills-add-suggestions">
          {suggestions.map((s) => (
            <button
              key={s.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onPick(s);
                setQuery("");
                setOpen(false);
              }}
            >
              <img src={typeIconUrl(s.id)} alt="" className="market-browser-row-icon" />
              {s.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function WaypointSearchBox({ onPick }: { onPick: (match: SystemSearchMatch) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SystemSearchMatch[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      searchSystemsLive(trimmed)
        .then((matches) => {
          if (!cancelled) {
            setResults(matches);
            setOpen(matches.length > 0);
          }
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        });
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  return (
    <div className="kills-add-combobox">
      <input
        type="text"
        placeholder="Add a waypoint system..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
      />
      {open && (
        <div className="gatecheck-slot-results kills-add-suggestions">
          {results.map((s) => (
            <button
              key={s.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onPick(s);
                setQuery("");
                setOpen(false);
              }}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function formatMinutes(mins: number): string {
  const totalSeconds = Math.round(mins * 60);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function CapitalRoutePanel({ characters, onClose }: CapitalRoutePanelProps) {
  const [ship, setShip] = useState<TypeSearchMatch | null>(null);
  const [jumpInfo, setJumpInfo] = useState<JumpDriveInfo | null>(null);
  const [checkedShip, setCheckedShip] = useState(false);
  const [characterId, setCharacterId] = useState<number | "none">("none");
  const [skillLevels, setSkillLevels] = useState<{ jdc: number; jfc: number }>({ jdc: 0, jfc: 0 });
  const [waypoints, setWaypoints] = useState<SystemSearchMatch[]>([]);
  const [plan, setPlan] = useState<CapitalRoutePlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoRouteEnabled, setAutoRouteEnabled] = useState(false);
  const [originSystem, setOriginSystem] = useState<SystemSearchMatch | null>(null);
  const [destinationSystem, setDestinationSystem] = useState<SystemSearchMatch | null>(null);
  const [avoidSystems, setAvoidSystems] = useState<SystemSearchMatch[]>([]);
  /** Last-hour kill activity on any of the plan's own waypoint systems - the
   * right danger signal for a jump-drive route, unlike Gate Check below,
   * since a capital lands directly in each of these systems regardless of
   * which stargates (if any) connect them. */
  const [dangerSystems, setDangerSystems] = useState<SystemKillHeat[]>([]);
  const [checkingGates, setCheckingGates] = useState(false);
  /** Gate-camp check run against a hypothetical STARGATE path between the
   * same waypoints - deliberately separate from dangerSystems above, since a
   * jump drive never actually takes this path. Offered as an extra,
   * explicitly-labeled option rather than folded into the main result. */
  const [gateCheckKills, setGateCheckKills] = useState<{ total: number; bySystem: Map<number, number> } | null>(null);
  const reportError = useErrorReporter();

  async function checkWaypointDanger(systemIds: number[]) {
    try {
      const heat = await getSystemKillHeat();
      const idSet = new Set(systemIds);
      setDangerSystems(heat.filter((h) => idSet.has(h.system_id) && h.kill_count > 0));
    } catch {
      // Best-effort - a failed heat fetch just means no danger flags shown,
      // not a reason to fail the whole route calculation.
      setDangerSystems([]);
    }
  }

  async function handleCheckGateActivity(systemIds: number[]) {
    if (systemIds.length < 2) return;
    setCheckingGates(true);
    setGateCheckKills(null);
    try {
      const result = await planGateCheck(systemIds, [], "shortest");
      const routeIds = result.systems.map((s) => s.id);
      const events = await getGateActivity(routeIds);
      const bySystem = new Map<number, number>();
      for (const e of events) bySystem.set(e.system_id, (bySystem.get(e.system_id) ?? 0) + 1);
      setGateCheckKills({ total: events.length, bySystem });
    } catch (err) {
      reportError(`Failed to check gate activity: ${String(err)}`);
    } finally {
      setCheckingGates(false);
    }
  }

  useEffect(() => {
    if (!ship) {
      setJumpInfo(null);
      setCheckedShip(false);
      return;
    }
    setCheckedShip(false);
    getJumpDriveInfo(ship.id)
      .then((info) => {
        setJumpInfo(info);
        setCheckedShip(true);
      })
      .catch((err) => {
        reportError(`Failed to load jump drive info: ${String(err)}`);
        setJumpInfo(null);
        setCheckedShip(true);
      });
  }, [ship, reportError]);

  useEffect(() => {
    if (characterId === "none") {
      setSkillLevels({ jdc: 0, jfc: 0 });
      return;
    }
    getCharacterSkills(characterId)
      .then((result) => {
        const jdc = result.skills.find((s) => s.skill_id === JUMP_DRIVE_CALIBRATION_SKILL_ID)?.trained_level ?? 0;
        const jfc = result.skills.find((s) => s.skill_id === JUMP_FUEL_CONSERVATION_SKILL_ID)?.trained_level ?? 0;
        setSkillLevels({ jdc, jfc });
      })
      .catch(() => setSkillLevels({ jdc: 0, jfc: 0 }));
  }, [characterId]);

  function handleAddWaypoint(match: SystemSearchMatch) {
    if (waypoints.some((w) => w.id === match.id)) return;
    setWaypoints((prev) => [...prev, match]);
    setPlan(null);
  }

  function handleRemoveWaypoint(id: number) {
    setWaypoints((prev) => prev.filter((w) => w.id !== id));
    setPlan(null);
  }

  async function handleCalculate() {
    if (!jumpInfo || waypoints.length < 2) return;
    setLoading(true);
    setPlan(null);
    setDangerSystems([]);
    setGateCheckKills(null);
    try {
      const positions = await getSystemPositions(waypoints.map((w) => w.id));
      const posById = new Map(positions.map((p) => [p.system_id, [p.x, p.y, p.z] as [number, number, number]]));
      const missing = waypoints.filter((w) => !posById.has(w.id));
      if (missing.length > 0) {
        reportError(`Could not resolve position for: ${missing.map((m) => m.name).join(", ")}`);
        return;
      }
      const routePositions: RoutePosition[] = waypoints.map((w) => ({
        systemId: w.id,
        systemName: w.name,
        pos: posById.get(w.id)!,
      }));
      setPlan(planCapitalRoute(routePositions, jumpInfo.base_range_ly, jumpInfo.fuel_per_ly, skillLevels.jdc, skillLevels.jfc));
      checkWaypointDanger(waypoints.map((w) => w.id));
    } catch (err) {
      reportError(`Failed to plan capital route: ${String(err)}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleAutoCalculate() {
    if (!jumpInfo || !originSystem || !destinationSystem) return;
    setLoading(true);
    setPlan(null);
    setDangerSystems([]);
    setGateCheckKills(null);
    try {
      const routePositions = await planAutoRoute(
        originSystem.id,
        destinationSystem.id,
        effectiveRangeLy ?? jumpInfo.base_range_ly,
        avoidSystems.map((s) => s.id),
      );
      setPlan(planCapitalRoute(routePositions, jumpInfo.base_range_ly, jumpInfo.fuel_per_ly, skillLevels.jdc, skillLevels.jfc));
      checkWaypointDanger(routePositions.map((r) => r.systemId));
    } catch (err) {
      reportError(String(err));
    } finally {
      setLoading(false);
    }
  }

  const fuelTypeName = jumpInfo ? (JUMP_FUEL_TYPE_NAMES[jumpInfo.fuel_type_id] ?? "Isotopes") : null;
  const effectiveRangeLy = jumpInfo ? jumpInfo.base_range_ly * (1 + 0.2 * skillLevels.jdc) : null;
  const planSystemIds = plan && plan.legs.length > 0 ? [plan.legs[0].fromSystemId, ...plan.legs.map((l) => l.toSystemId)] : [];

  return (
    <div className="wh-route-panel">
      <div className="wh-route-header">
        <p className="wh-side-label">
          <Rocket size={13} strokeWidth={2} /> Capital Route
        </p>
        <div className="wh-route-header-actions">
          <button type="button" className="wh-route-close" onClick={onClose} title="Close">
            <X size={14} strokeWidth={2} />
          </button>
        </div>
      </div>

      <p className="settings-section-hint">
        Plan a jump-drive route: pick a capital ship, add waypoints in jump order, and see the fuel, cooldown, and
        fatigue cost of each leg. Assumes every jump is taken back-to-back with no waiting - the worst case for total
        time, and the safest one to fuel for.
      </p>

      <ShipSearchBox
        onPick={(match) => {
          setShip(match);
          setPlan(null);
        }}
      />

      {ship && (
        <div className="capital-route-ship-picked">
          <img src={typeIconUrl(ship.id)} alt="" className="market-browser-row-icon" />
          <span>{ship.name}</span>
          <button
            type="button"
            className="fittings-ship-clear-btn"
            onClick={() => {
              setShip(null);
              setPlan(null);
            }}
            title="Clear ship"
          >
            <X size={12} strokeWidth={2.5} />
          </button>
        </div>
      )}

      {checkedShip && !jumpInfo && <p className="detail-empty">{ship?.name} has no jump drive.</p>}

      {jumpInfo && (
        <>
          <label className="capital-route-char-picker">
            <span>Apply skills from</span>
            <select
              value={characterId}
              onChange={(e) => setCharacterId(e.target.value === "none" ? "none" : Number(e.target.value))}
            >
              <option value="none">Untrained (no character)</option>
              {characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <p className="capital-route-range-line">
            Base range {jumpInfo.base_range_ly.toFixed(2)} LY &rarr; effective {effectiveRangeLy?.toFixed(2)} LY
            {characterId !== "none" && ` (Jump Drive Calibration ${skillLevels.jdc}, Jump Fuel Conservation ${skillLevels.jfc})`}
          </p>

          <label className="settings-checkbox-row">
            <input
              type="checkbox"
              checked={autoRouteEnabled}
              onChange={(e) => {
                setAutoRouteEnabled(e.target.checked);
                setPlan(null);
              }}
            />
            Auto-route (find a jump-drive path automatically, instead of picking every waypoint by hand)
          </label>

          {autoRouteEnabled ? (
            <>
              <p className="settings-section-hint">
                Picks the shortest jump-drive path by itself, respecting this ship's effective range and EVE's own rule that a
                jump drive can neither activate from nor land in high-sec space.
              </p>
              <WaypointSearchBox
                onPick={(match) => {
                  setOriginSystem(match);
                  setPlan(null);
                }}
              />
              {originSystem && (
                <div className="capital-route-ship-picked">
                  <span>From: {originSystem.name}</span>
                  <button type="button" className="fittings-ship-clear-btn" onClick={() => setOriginSystem(null)} title="Clear origin">
                    <X size={12} strokeWidth={2.5} />
                  </button>
                </div>
              )}
              <WaypointSearchBox
                onPick={(match) => {
                  setDestinationSystem(match);
                  setPlan(null);
                }}
              />
              {destinationSystem && (
                <div className="capital-route-ship-picked">
                  <span>To: {destinationSystem.name}</span>
                  <button
                    type="button"
                    className="fittings-ship-clear-btn"
                    onClick={() => setDestinationSystem(null)}
                    title="Clear destination"
                  >
                    <X size={12} strokeWidth={2.5} />
                  </button>
                </div>
              )}
              <WaypointSearchBox
                onPick={(match) => {
                  if (avoidSystems.some((s) => s.id === match.id)) return;
                  setAvoidSystems((prev) => [...prev, match]);
                  setPlan(null);
                }}
              />
              <div className="capital-route-waypoint-list">
                {avoidSystems.length === 0 && <p className="detail-empty">Optionally add systems to avoid (e.g. a known camp).</p>}
                {avoidSystems.map((s) => (
                  <div key={s.id} className="capital-route-waypoint-row">
                    <span className="capital-route-waypoint-name">Avoid: {s.name}</span>
                    <button
                      type="button"
                      className="wh-delete-btn"
                      onClick={() => setAvoidSystems((prev) => prev.filter((a) => a.id !== s.id))}
                      title="Remove"
                    >
                      <Trash2 size={12} strokeWidth={2} />
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="wh-origin-btn"
                disabled={!originSystem || !destinationSystem || loading}
                onClick={handleAutoCalculate}
              >
                {loading ? "Finding route..." : "Find Route"}
              </button>
            </>
          ) : (
            <>
              <WaypointSearchBox onPick={handleAddWaypoint} />

              <div className="capital-route-waypoint-list">
                {waypoints.length === 0 && <p className="detail-empty">Add at least two systems to plan a route.</p>}
                {waypoints.map((w, i) => (
                  <div key={w.id} className="capital-route-waypoint-row">
                    <span className="capital-route-waypoint-index">{i + 1}</span>
                    <span className="capital-route-waypoint-name">{w.name}</span>
                    <button type="button" className="wh-delete-btn" onClick={() => handleRemoveWaypoint(w.id)} title="Remove">
                      <Trash2 size={12} strokeWidth={2} />
                    </button>
                  </div>
                ))}
              </div>

              <button type="button" className="wh-origin-btn" disabled={waypoints.length < 2 || loading} onClick={handleCalculate}>
                {loading ? "Calculating..." : "Calculate Route"}
              </button>
            </>
          )}
        </>
      )}

      {plan && (
        <div className="capital-route-results">
          {plan.anyLegOutOfRange && (
            <p className="capital-route-warning">
              One or more legs exceed this ship's effective jump range - add a closer waypoint to split that jump.
            </p>
          )}
          <div className="capital-route-legs">
            {plan.legs.map((leg, i) => (
              <div key={i} className={`capital-route-leg${leg.inRange ? "" : " capital-route-leg-out-of-range"}`}>
                <p className="capital-route-leg-title">
                  {leg.fromSystemName} &rarr; {leg.toSystemName}
                </p>
                <p className="capital-route-leg-stats">
                  {leg.distanceLy.toFixed(2)} LY &middot; {leg.fuelUnits.toFixed(0)} {fuelTypeName} &middot;{" "}
                  {formatMinutes(leg.cooldownMinutes)} cooldown &middot; fatigue {formatMinutes(leg.fatigueAfterMinutes)}
                </p>
              </div>
            ))}
          </div>
          <div className="market-browser-stats capital-route-totals">
            <div className="market-stat-card">
              <span className="market-stat-label">Total Fuel</span>
              <span className="market-stat-value">
                {plan.totalFuelUnits.toFixed(0)} {fuelTypeName}
              </span>
            </div>
            <div className="market-stat-card">
              <span className="market-stat-label">Total Time</span>
              <span className="market-stat-value">{formatMinutes(plan.totalMinutes)}</span>
            </div>
          </div>

          {dangerSystems.length > 0 && (
            <div className="capital-route-danger">
              <p className="capital-route-warning">Recent kill activity on this route:</p>
              {dangerSystems.map((s) => (
                <p key={s.system_id} className="capital-route-danger-row">
                  {s.system_name} &mdash; {s.kill_count} kill{s.kill_count === 1 ? "" : "s"} in the last hour
                </p>
              ))}
            </div>
          )}

          <button
            type="button"
            className="wh-origin-btn"
            disabled={checkingGates || planSystemIds.length < 2}
            onClick={() => handleCheckGateActivity(planSystemIds)}
            title="Checks for gate-camp activity along a hypothetical STARGATE path between these same systems - informational only, since a jump drive never actually takes this path"
          >
            {checkingGates ? "Checking gates..." : "Also Check Gate Activity"}
          </button>
          {gateCheckKills && (
            <p className="settings-section-hint">
              {gateCheckKills.total === 0
                ? "No recent kills found on a stargate path between these systems."
                : `${gateCheckKills.total} recent kill${gateCheckKills.total === 1 ? "" : "s"} found across ${gateCheckKills.bySystem.size} system${gateCheckKills.bySystem.size === 1 ? "" : "s"} on a stargate path between these systems.`}{" "}
              This checks a stargate route your capital won't actually fly - its jump drive goes directly between
              waypoints, not through gates.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default CapitalRoutePanel;
