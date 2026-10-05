import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { getLikelyGateCamps, GATE_CAMP_KILLS_HIGH, type LikelyGateCamp } from "../lib/route";
import { useErrorReporter } from "../hooks/useErrorReporter";
import { securityColor, formatSecurity, formatExactTime, formatSecondsAgo } from "../lib/format";
import { useSortableRows } from "../hooks/useSortableRows";
import { SortableTh } from "./SortableTh";
import type { GateSummary } from "./GateKillboard";
import { useTheme, isPremiumTheme } from "../hooks/useTheme";
import SegmentBar, { ThreatState, type SegmentBand, type SegmentTone } from "./premium/SegmentBar";
import SignalLamp from "./premium/SignalLamp";
import Sparkline from "./premium/Sparkline";
import ScanPulse from "./premium/ScanPulse";
import StaleMark from "./premium/StaleMark";
import type { LampTone } from "./premium/StatusLamp";

interface LikelyGateCampsProps {
  onSelectGate: (gate: GateSummary) => void;
}

function killBand(kills: number): "safe" | "caution" | "danger" {
  if (kills < 2) return "safe";
  if (kills < GATE_CAMP_KILLS_HIGH) return "caution";
  return "danger";
}

/** Premium decks show each gate's kill count as a segmented bar whose zones match
 * killBand's own thresholds (1 is low, 2 to 5 medium, 6 and up high), one cell
 * per kill up to twelve. The counts are what the data actually is: this is
 * activity in the last hour, not a probability of being camped. */
const CAMP_BAR_MAX = 12;
const CAMP_BANDS: SegmentBand[] = [
  { upTo: 1, tone: "ok" },
  { upTo: 5, tone: "caution" },
  { upTo: CAMP_BAR_MAX, tone: "critical" },
];
const BAND_TONE: Record<"safe" | "caution" | "danger", SegmentTone> = { safe: "ok", caution: "caution", danger: "critical" };
const STATE_TEXT: Record<SegmentTone, string> = { ok: "Low activity", caution: "Medium activity", critical: "High activity" };
const LAMP_TONE: Record<SegmentTone, LampTone> = { ok: "online", caution: "warning", critical: "danger" };
const HOUR_MS = 60 * 60 * 1000;
/** The lamp is at full brightness for a few minutes after a kill, then fades across the hour. */
const LAMP_FRESH_MS = 5 * 60 * 1000;

/** New Eden-wide "what's likely camped right now" board - the in-app
 * equivalent of eve-gatecheck.space's own "Current (likely) gatecamps"
 * list, sourced entirely from the local kill-history store (see
 * kill_history::get_likely_gate_camps) rather than any external site. */
function LikelyGateCamps({ onSelectGate }: LikelyGateCampsProps) {
  const [camps, setCamps] = useState<LikelyGateCamp[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadCount, setLoadCount] = useState(0);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const reportError = useErrorReporter();
  const [theme] = useTheme();
  const premium = isPremiumTheme(theme);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getLikelyGateCamps();
      setCamps(result);
      setLoadCount((n) => n + 1);
      setLoadedAt(Date.now());
    } catch (err) {
      reportError(`Failed to load likely gate camps: ${String(err)}`);
    } finally {
      setLoading(false);
    }
  }, [reportError]);

  useEffect(() => {
    load();
    // Refreshed on the same cadence as GateCheck's own rolling window, so a
    // camp that's dissolved in the last hour drops off here too without
    // needing a manual refresh.
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, [load]);

  const sorted = useSortableRows<LikelyGateCamp>(camps ?? [], {
    location: (camp) => camp.origin_system_name,
    kills: (camp) => camp.kills_last_hour,
    last_kill: (camp) => new Date(camp.last_kill_time).getTime(),
  });

  return (
    <div className="gatecheck-page">
      <div className="likely-camps-header">
        <div>
          <h3>Current (likely) gate camps</h3>
          <p className="gatecheck-label">
            Every gate with a recorded kill in the last hour, New Eden-wide, ranked by kill count.
            {premium && loadedAt != null && (
              <>
                {" "}
                <span className="camps-updated">Updated {formatSecondsAgo(new Date(loadedAt).toISOString())}</span>
                <StaleMark since={loadedAt} afterMs={3 * 60_000} what="Likely gate camps" />
              </>
            )}
          </p>
        </div>
        <button type="button" className="detail-back" onClick={load} disabled={loading}>
          <RefreshCw size={13} strokeWidth={2} className={loading ? "market-resync-spin" : undefined} />
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {camps === null ? (
        <p className="detail-empty">Loading...</p>
      ) : camps.length === 0 ? (
        <p className="detail-empty">No kills recorded at any gate in the last hour.</p>
      ) : (
        <div className="gatecheck-table-wrap">
          <ScanPulse trigger={loadCount} />
          <table className="gatecheck-table">
            <thead>
              <tr>
                <SortableTh
                  label="Location"
                  sortKey="location"
                  activeKey={sorted.sortKey}
                  dir={sorted.sortDir}
                  onSort={(key) => sorted.sort(key, "asc")}
                />
                <SortableTh
                  label="Kills (1h)"
                  sortKey="kills"
                  activeKey={sorted.sortKey}
                  dir={sorted.sortDir}
                  onSort={(key) => sorted.sort(key, "desc")}
                  numeric
                />
                {premium && <th title="Kills in the last hour on a scale of twelve. Activity, not a probability.">Activity</th>}
                <SortableTh
                  label="Last kill"
                  sortKey="last_kill"
                  activeKey={sorted.sortKey}
                  dir={sorted.sortDir}
                  onSort={(key) => sorted.sort(key, "desc")}
                  numeric
                />
              </tr>
            </thead>
            <tbody>
              {sorted.rows.map((camp) => (
                <tr key={camp.gate_location_id} className={`gatecheck-row gatecheck-row-${killBand(camp.kills_last_hour)}`}>
                  <td>
                    {camp.origin_system_name}
                    <span className="kills-security" style={{ color: securityColor(camp.origin_security) }}>
                      {formatSecurity(camp.origin_security)}
                    </span>
                    <span className="likely-camps-arrow">on the</span>
                    <a
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        onSelectGate({
                          id: camp.gate_location_id,
                          name: camp.gate_name,
                          systemId: camp.origin_system_id,
                          systemName: camp.origin_system_name,
                        });
                      }}
                    >
                      {camp.gate_name} gate
                    </a>
                    {camp.destination_security != null && (
                      <span className="kills-security" style={{ color: securityColor(camp.destination_security) }}>
                        {formatSecurity(camp.destination_security)}
                      </span>
                    )}
                  </td>
                  <td>
                    {camp.kills_last_hour} ({camp.pods_last_hour} pod{camp.pods_last_hour === 1 ? "" : "s"})
                  </td>
                  {premium && (
                    <td>
                      <span className="threat-cell">
                        <SegmentBar
                          value={camp.kills_last_hour}
                          max={CAMP_BAR_MAX}
                          bands={CAMP_BANDS}
                          label={`Kills at the ${camp.gate_name} gate in the last hour`}
                          valueText={`${camp.kills_last_hour} kills, ${STATE_TEXT[BAND_TONE[killBand(camp.kills_last_hour)]].toLowerCase()}`}
                          hatched={camp.kills_last_hour < 2}
                        />
                        <ThreatState tone={BAND_TONE[killBand(camp.kills_last_hour)]} text={STATE_TEXT[BAND_TONE[killBand(camp.kills_last_hour)]]} />
                        <Sparkline values={camp.kills_by_10min} label={`Kills at the ${camp.gate_name} gate per ten minutes over the last hour`} />
                      </span>
                    </td>
                  )}
                  <td>
                    {premium && (
                      <>
                        <SignalLamp
                          since={new Date(camp.last_kill_time).getTime()}
                          tone={LAMP_TONE[BAND_TONE[killBand(camp.kills_last_hour)]]}
                          freshMs={LAMP_FRESH_MS}
                          staleAfterMs={HOUR_MS}
                        />{" "}
                      </>
                    )}
                    {formatExactTime(camp.last_kill_time)} <span className="likely-camps-last-kill-ago">({formatSecondsAgo(camp.last_kill_time)})</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default LikelyGateCamps;
