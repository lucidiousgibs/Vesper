import { usePersistentState } from "./usePersistentState";

export interface MapMarker {
  id: string;
  systemId: number;
  systemName: string;
  label: string;
  color: string;
  createdAt: number;
}

export interface MapLine {
  id: string;
  fromSystemId: number;
  fromSystemName: string;
  toSystemId: number;
  toSystemName: string;
  label?: string;
  color: string;
  style: "solid" | "dashed";
  createdAt: number;
}

const MARKERS_KEY = "vesper.map.annotationMarkers";
const LINES_KEY = "vesper.map.annotationLines";

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** FC-drawn intel markers/lines - deliberately simple (right-click on the
 * map to add, see the context menu MapView.tsx wires up), not a general
 * drawing tool. One marker per system (adding a second over an existing one
 * replaces it, matching useSystemPresets' "one per key" convention); lines
 * can repeat since the same two systems might get re-marked in a different
 * color/style over time. */
export function useMapAnnotations() {
  const [markers, setMarkers] = usePersistentState<MapMarker[]>(MARKERS_KEY, []);
  const [lines, setLines] = usePersistentState<MapLine[]>(LINES_KEY, []);

  function addMarker(systemId: number, systemName: string, label: string, color: string) {
    setMarkers((prev) => [
      ...prev.filter((m) => m.systemId !== systemId),
      { id: makeId(), systemId, systemName, label, color, createdAt: Date.now() },
    ]);
  }

  function removeMarker(id: string) {
    setMarkers((prev) => prev.filter((m) => m.id !== id));
  }

  function removeMarkerBySystem(systemId: number) {
    setMarkers((prev) => prev.filter((m) => m.systemId !== systemId));
  }

  function addLine(
    from: { id: number; name: string },
    to: { id: number; name: string },
    color: string,
    style: "solid" | "dashed",
  ) {
    if (from.id === to.id) return;
    setLines((prev) => [
      ...prev,
      {
        id: makeId(),
        fromSystemId: from.id,
        fromSystemName: from.name,
        toSystemId: to.id,
        toSystemName: to.name,
        color,
        style,
        createdAt: Date.now(),
      },
    ]);
  }

  function removeLine(id: string) {
    setLines((prev) => prev.filter((l) => l.id !== id));
  }

  return { markers, addMarker, removeMarker, removeMarkerBySystem, lines, addLine, removeLine };
}
