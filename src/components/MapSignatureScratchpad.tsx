import { useEffect, useState } from "react";
import { X, Trash2 } from "lucide-react";
import {
  listScratchpadSignatures,
  importScratchpadSignatures,
  deleteScratchpadSignature,
  type ScratchpadSignature,
} from "../lib/map";
import { parseScanPaste, KIND_LABEL, type SignatureKind } from "../lib/signatureParsing";
import { useErrorReporter } from "../hooks/useErrorReporter";

interface MapSignatureScratchpadProps {
  systemId: number;
  systemName: string;
  onClose: () => void;
}

const AGE_STALE_MS = 30 * 60 * 1000;
const AGE_OLD_MS = 2 * 60 * 60 * 1000;

function ageClass(lastSeenAt: number): string {
  const ageMs = Date.now() - lastSeenAt * 1000;
  if (ageMs > AGE_OLD_MS) return "wh-sig-age-old";
  if (ageMs > AGE_STALE_MS) return "wh-sig-age-stale";
  return "wh-sig-age-fresh";
}

/** A quick per-system signature scratchpad for the main map - paste straight
 * from the in-game Scanning window, same format/parser as the wormhole-chain
 * tool's own SignaturePanel, just scoped to a plain k-space system instead
 * of a chain (see map_scratchpad.rs for why this needed its own simpler
 * table rather than reusing the chain-scoped one). */
function MapSignatureScratchpad({ systemId, systemName, onClose }: MapSignatureScratchpadProps) {
  const [signatures, setSignatures] = useState<ScratchpadSignature[]>([]);
  const [loading, setLoading] = useState(true);
  const [paste, setPaste] = useState("");
  const [importing, setImporting] = useState(false);
  const [missingIds, setMissingIds] = useState<string[]>([]);
  const reportError = useErrorReporter();

  function refresh() {
    setLoading(true);
    listScratchpadSignatures(systemId)
      .then(setSignatures)
      .catch((err) => reportError(`Failed to load signatures: ${String(err)}`))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [systemId]);

  async function handleImport() {
    const parsed = parseScanPaste(paste);
    if (parsed.length === 0) {
      reportError("No recognizable signatures found in that paste - copy directly from the in-game Scanning window.");
      return;
    }
    setImporting(true);
    try {
      const result = await importScratchpadSignatures(systemId, parsed);
      setMissingIds(result.missing_sig_ids);
      setPaste("");
      refresh();
    } catch (err) {
      reportError(`Failed to import signatures: ${String(err)}`);
    } finally {
      setImporting(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteScratchpadSignature(id);
      refresh();
    } catch (err) {
      reportError(`Failed to delete signature: ${String(err)}`);
    }
  }

  return (
    <div className="system-stats-backdrop" onClick={onClose}>
      <div className="system-stats-modal map-scratchpad-modal" onClick={(e) => e.stopPropagation()}>
        <div className="system-stats-header">
          <div>
            <h3>{systemName}</h3>
            <p className="system-stats-subtitle">Signature Scratchpad</p>
          </div>
          <button type="button" className="system-stats-close" onClick={onClose} title="Close">
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        {loading ? (
          <p className="detail-empty wh-sig-empty">Loading...</p>
        ) : signatures.length === 0 ? (
          <p className="detail-empty wh-sig-empty">No signatures scanned yet.</p>
        ) : (
          <div className="wh-sig-list">
            {signatures.map((sig) => (
              <div key={sig.id} className={`wh-sig-row ${ageClass(sig.last_seen_at)}`}>
                <span className="wh-sig-id">{sig.sig_id}</span>
                <span className="wh-sig-kind">{KIND_LABEL[sig.kind as SignatureKind] ?? sig.kind}</span>
                <span className="wh-sig-type">{sig.sig_type || "—"}</span>
                <button type="button" onClick={() => handleDelete(sig.id)} title="Delete signature">
                  <Trash2 size={12} strokeWidth={2} />
                </button>
              </div>
            ))}
          </div>
        )}

        {missingIds.length > 0 && (
          <p className="wh-sig-missing">Not in your last paste: {missingIds.join(", ")} - delete any that have decayed.</p>
        )}

        <textarea
          className="price-checker-input wh-sig-paste"
          placeholder="Paste the in-game Scanning window results here..."
          rows={4}
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
        />
        <button type="button" className="kills-sync-btn" onClick={handleImport} disabled={importing || paste.trim().length === 0}>
          {importing ? "Importing..." : "Import Signatures"}
        </button>
      </div>
    </div>
  );
}

export default MapSignatureScratchpad;
