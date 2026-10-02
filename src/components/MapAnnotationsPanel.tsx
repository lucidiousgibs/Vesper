import { X, Trash2 } from "lucide-react";
import { useMapAnnotations } from "../hooks/useMapAnnotations";

interface MapAnnotationsPanelProps {
  onClose: () => void;
}

/** Delete-only management list for the right-click-drawn markers/lines
 * MapView.tsx's canvas context menu creates - the canvas itself has no hit
 * test for "clicked an existing line", so this is the only way to remove
 * one once drawn. */
function MapAnnotationsPanel({ onClose }: MapAnnotationsPanelProps) {
  const { markers, removeMarker, lines, removeLine } = useMapAnnotations();

  return (
    <div className="system-stats-backdrop" onClick={onClose}>
      <div className="system-stats-modal jump-bridge-modal" onClick={(e) => e.stopPropagation()}>
        <div className="system-stats-header">
          <div>
            <h3>Map Annotations</h3>
            <p className="system-stats-subtitle">Right-click any system on the map to add more</p>
          </div>
          <button type="button" className="system-stats-close" onClick={onClose} title="Close">
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        <div className="system-stats-body">
          <p className="wh-side-label">Markers</p>
          {markers.length === 0 ? (
            <p className="detail-empty">No markers placed yet.</p>
          ) : (
            <div className="wh-sig-list" style={{ marginBottom: 16 }}>
              {markers.map((m) => (
                <div key={m.id} className="wh-structure-row">
                  <span>
                    <span className="map-annotation-swatch" style={{ background: m.color }} aria-hidden="true" />
                    <strong>{m.systemName}</strong>
                    {m.label ? ` - ${m.label}` : ""}
                  </span>
                  <button type="button" onClick={() => removeMarker(m.id)} title="Delete marker">
                    <Trash2 size={12} strokeWidth={2} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <p className="wh-side-label">Lines</p>
          {lines.length === 0 ? (
            <p className="detail-empty">No lines drawn yet.</p>
          ) : (
            <div className="wh-sig-list">
              {lines.map((l) => (
                <div key={l.id} className="wh-structure-row">
                  <span>
                    <span className="map-annotation-swatch" style={{ background: l.color }} aria-hidden="true" />
                    <strong>{l.fromSystemName}</strong> &rarr; <strong>{l.toSystemName}</strong>
                    {l.style === "dashed" ? " (dashed)" : ""}
                  </span>
                  <button type="button" onClick={() => removeLine(l.id)} title="Delete line">
                    <Trash2 size={12} strokeWidth={2} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default MapAnnotationsPanel;
