import { useEffect, useState } from "react";
import { X, Trash2, Copy } from "lucide-react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { searchSystemsLive, type SystemSearchMatch } from "../lib/map";
import { useJumpBridges } from "../hooks/useJumpBridges";
import { useErrorReporter } from "../hooks/useErrorReporter";

interface MapJumpBridgePanelProps {
  onClose: () => void;
}

function SystemPickBox({
  placeholder,
  picked,
  onPick,
  onClear,
}: {
  placeholder: string;
  picked: SystemSearchMatch | null;
  onPick: (match: SystemSearchMatch) => void;
  onClear: () => void;
}) {
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

  if (picked) {
    return (
      <div className="capital-route-ship-picked">
        <span>{picked.name}</span>
        <button type="button" className="fittings-ship-clear-btn" onClick={onClear} title="Clear">
          <X size={12} strokeWidth={2.5} />
        </button>
      </div>
    );
  }

  return (
    <div className="kills-add-combobox">
      <input
        type="text"
        placeholder={placeholder}
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

/** Manually-maintained jump-bridge network manager - no ESI endpoint exists
 * for this data at all, so it's entered/imported by hand (alliance/FC
 * maintained), same spirit as SMT's own crowd-sourced text files. Storage is
 * a flat usePersistentState array (useJumpBridges.ts), not SQLite - no
 * decay, no joins, just pairs of system ids. */
function MapJumpBridgePanel({ onClose }: MapJumpBridgePanelProps) {
  const { bridges, addJumpBridge, removeJumpBridge, exportJumpBridges, importJumpBridges } = useJumpBridges();
  const [from, setFrom] = useState<SystemSearchMatch | null>(null);
  const [to, setTo] = useState<SystemSearchMatch | null>(null);
  const [ownerAllianceName, setOwnerAllianceName] = useState("");
  const [notes, setNotes] = useState("");
  const [importText, setImportText] = useState("");
  const [importResult, setImportResult] = useState<string | null>(null);
  const reportError = useErrorReporter();

  function handleAdd() {
    if (!from || !to) return;
    addJumpBridge(from, to, ownerAllianceName.trim() || undefined, notes.trim() || undefined);
    setFrom(null);
    setTo(null);
    setOwnerAllianceName("");
    setNotes("");
  }

  async function handleCopyExport() {
    try {
      await writeText(exportJumpBridges());
    } catch (err) {
      reportError(`Failed to copy to clipboard: ${String(err)}`);
    }
  }

  function handleImport() {
    if (!importText.trim()) return;
    try {
      const result = importJumpBridges(importText);
      setImportResult(`Imported ${result.imported}${result.skipped > 0 ? `, skipped ${result.skipped} invalid entries` : ""}.`);
      setImportText("");
    } catch (err) {
      reportError(`Failed to import jump bridges: ${String(err)}`);
    }
  }

  return (
    <div className="system-stats-backdrop" onClick={onClose}>
      <div className="system-stats-modal jump-bridge-modal" onClick={(e) => e.stopPropagation()}>
        <div className="system-stats-header">
          <div>
            <h3>Jump Bridge Network</h3>
            <p className="system-stats-subtitle">Manually maintained - no ESI data source exists for this</p>
          </div>
          <button type="button" className="system-stats-close" onClick={onClose} title="Close">
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        <div className="system-stats-body">
          <div className="wh-conn-editor">
            <SystemPickBox placeholder="From system..." picked={from} onPick={setFrom} onClear={() => setFrom(null)} />
            <span className="wh-conn-arrow" aria-hidden="true">
              &harr;
            </span>
            <SystemPickBox placeholder="To system..." picked={to} onPick={setTo} onClear={() => setTo(null)} />

            <label className="wh-field-label">
              Owning alliance (optional)
              <input
                type="text"
                value={ownerAllianceName}
                onChange={(e) => setOwnerAllianceName(e.target.value)}
                placeholder="e.g. Goonswarm Federation"
              />
            </label>
            <label className="wh-field-label">
              Notes (optional)
              <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Titan bridge, fuel at both ends" />
            </label>

            <button type="button" className="kills-sync-btn" onClick={handleAdd} disabled={!from || !to}>
              Add Bridge
            </button>
          </div>

          {bridges.length === 0 ? (
            <p className="detail-empty">No jump bridges entered yet.</p>
          ) : (
            <div className="wh-sig-list">
              {bridges.map((b) => (
                <div key={b.id} className="wh-structure-row">
                  <span>
                    <strong>{b.fromSystemName}</strong> &harr; <strong>{b.toSystemName}</strong>
                    {b.ownerAllianceName ? ` - ${b.ownerAllianceName}` : ""}
                    {b.notes ? ` (${b.notes})` : ""}
                  </span>
                  <button type="button" onClick={() => removeJumpBridge(b.id)} title="Delete bridge">
                    <Trash2 size={12} strokeWidth={2} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="wh-conn-editor" style={{ marginTop: 16 }}>
            <button type="button" className="kills-sync-btn" onClick={handleCopyExport} disabled={bridges.length === 0}>
              <Copy size={13} strokeWidth={2} /> Copy All as JSON
            </button>
            <textarea
              className="price-checker-input wh-sig-paste"
              placeholder="Paste a jump-bridge JSON export here to import it..."
              rows={3}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
            />
            <button type="button" className="kills-sync-btn" onClick={handleImport} disabled={importText.trim().length === 0}>
              Import
            </button>
            {importResult && <p className="wh-sig-missing">{importResult}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

export default MapJumpBridgePanel;
