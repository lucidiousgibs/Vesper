import { Delaunay } from "d3-delaunay";

/** One Voronoi cell per input system, in the SAME flattened x/y layout
 * MapView's canvas already draws with (MapSystem.x/y) - NOT real 3D
 * positions. This is a visual fill over the existing stylized map
 * projection, not a distance computation, which is exactly why
 * capitalRoute.ts's systemsWithinLy deliberately avoids this same x/y for
 * the opposite reason. Triangulation only depends on the point set, which
 * never changes during a session - callers should memoize the result keyed
 * on the input system id list, since rebuilding it every time sov data
 * refreshes (the actual per-resync work) would be pure waste. */
export function buildRegionCells(
  systems: { id: number; x: number; y: number }[],
  bounds: [number, number, number, number],
): Map<number, [number, number][]> {
  const delaunay = Delaunay.from(
    systems,
    (s) => s.x,
    (s) => s.y,
  );
  const voronoi = delaunay.voronoi(bounds);
  const cells = new Map<number, [number, number][]>();
  systems.forEach((s, i) => {
    const polygon = voronoi.cellPolygon(i);
    if (polygon) cells.set(s.id, polygon as [number, number][]);
  });
  return cells;
}
