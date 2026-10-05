import { BaseEdge, EdgeLabelRenderer, getStraightPath, type EdgeProps, type Edge } from "@xyflow/react";
import type { Connection } from "../../lib/wormholes";
import { WORMHOLE_TYPES } from "../../lib/wormholeTypes";
import { deriveTimeStatus, type TimeStatusTier } from "../../lib/wormholeMass";
import { useTheme, isPremiumTheme } from "../../hooks/useTheme";
import { useNow } from "../../hooks/useNow";

export type ConnectionEdgeType = Edge<{ connection: Connection }, "connection">;

const MASS_COLOR: Record<string, string> = {
  fresh: "#5fbf8a",
  reduced: "#e0a85c",
  critical: "#e0685f",
};

/** Premium decks let a wormhole edge fade as its lifetime runs down, so a hole
 * that is about to close looks like it is about to close. Only holes whose type
 * has a known lifetime (or one flagged EOL by the scanner) can fade; the rest
 * stay at full strength because there is nothing true to show. Expired holes go
 * to a faint dotted line rather than disappearing, since the estimate can be
 * wrong. */
const LIFESPAN_OPACITY: Record<TimeStatusTier, number> = {
  fresh: 1,
  lessThan24h: 0.9,
  lessThan4h: 0.78,
  lessThan1h: 0.62,
  eol: 0.6,
  expired: 0.35,
};

function ConnectionEdgeLine({ sourceX, sourceY, targetX, targetY, data, selected }: EdgeProps<ConnectionEdgeType>) {
  const conn = data?.connection;
  const [theme] = useTheme();
  const premium = isPremiumTheme(theme);
  // Re-renders once a second so the fade follows real time, not just data refreshes.
  useNow();
  const [edgePath, labelX, labelY] = getStraightPath({ sourceX, sourceY, targetX, targetY });
  if (!conn) return <BaseEdge path={edgePath} />;

  const isStargate = conn.kind === "stargate";
  const broken = !isStargate && (conn.from_signature_broken || conn.to_signature_broken);
  const color = isStargate ? "#5b9bd9" : broken ? "#e0685f" : MASS_COLOR[conn.mass_status] ?? "#8a8f98";
  const lifespan: TimeStatusTier | null =
    premium && !isStargate
      ? deriveTimeStatus(
          conn.first_seen_at,
          WORMHOLE_TYPES.find((w) => w.code === conn.wormhole_type)?.lifetimeHours ?? null,
          conn.is_eol,
        )
      : null;

  return (
    <>
      <BaseEdge
        path={edgePath}
        style={{
          stroke: color,
          strokeWidth: selected ? 3 : isStargate ? 1.5 : 2,
          strokeDasharray: lifespan === "expired" ? "2 5" : !isStargate && conn.is_eol ? "7 5" : undefined,
          opacity: isStargate ? 0.65 : lifespan ? LIFESPAN_OPACITY[lifespan] : 1,
        }}
      />
      <EdgeLabelRenderer>
        <div
          className={`wh-edge-label${isStargate ? " wh-edge-label-gate" : ""}${broken ? " wh-edge-label-broken" : ""}`}
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, borderColor: color, color }}
        >
          {isStargate ? "G" : broken ? "!" : conn.wormhole_type}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export default ConnectionEdgeLine;
