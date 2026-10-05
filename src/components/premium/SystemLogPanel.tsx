import { useEffect, useRef, useState } from "react";
import { useTheme, isPremiumTheme } from "../../hooks/useTheme";
import { useErrorReporter } from "../../hooks/useErrorReporter";
import { clearEvents, useEventLog, type EventLevel } from "../../lib/eventLog";
import { playCue } from "../../lib/cues";

/** Event name TopBar's SYS lamp and the command palette dispatch to open the log. */
export const OPEN_SYSTEM_LOG_EVENT = "vesper:open-system-log";

const GLYPH: Record<EventLevel, string> = { info: "●", warn: "▲", error: "■" };
const WORD: Record<EventLevel, string> = { info: "info", warn: "warn", error: "fault" };

function utcTime(at: number): string {
  return new Date(at).toISOString().slice(11, 19);
}

/** A real diagnostic log, shown only under premium decks: every error the app
 * showed you and every tracked-player alert, with the time it happened, newest
 * first. Nothing here is generated for atmosphere; if the log is empty it says
 * so. The Copy button puts the whole log on the clipboard for a bug report. */
function SystemLogPanel() {
  const [theme] = useTheme();
  const premium = isPremiumTheme(theme);
  const events = useEventLog();
  const reportError = useErrorReporter();
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!premium) return;
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_SYSTEM_LOG_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_SYSTEM_LOG_EVENT, onOpen);
  }, [premium]);

  useEffect(() => {
    if (!open) return;
    playCue("panel");
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      returnFocusRef.current?.focus?.();
    };
  }, [open]);

  if (!premium || !open) return null;

  const newestFirst = [...events].reverse();

  async function copyLog() {
    const text = [...events].map((e) => `${new Date(e.at).toISOString()} [${WORD[e.level]}] ${e.source}: ${e.message}`).join("\n");
    try {
      await navigator.clipboard.writeText(text || "(empty log)");
    } catch (err) {
      reportError(`Could not copy the system log: ${String(err)}`);
    }
  }

  return (
    <div className="syslog-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
      <div className="syslog" role="dialog" aria-modal="true" aria-label="System log" onMouseDown={(e) => e.stopPropagation()}>
        <div className="syslog-head">
          <span className="syslog-title">System log</span>
          <span className="syslog-count">
            {events.length} event{events.length === 1 ? "" : "s"} this session, times in UTC
          </span>
        </div>
        <div className="syslog-body">
          {newestFirst.length === 0 ? (
            <p className="syslog-empty">Nothing logged yet. Errors and tracked-player alerts appear here as they happen.</p>
          ) : (
            <ul className="syslog-list">
              {newestFirst.map((e) => (
                <li key={e.id} className={`syslog-row syslog-row-${e.level}`}>
                  <span className="syslog-time">{utcTime(e.at)}</span>
                  <span className="syslog-level">
                    <span aria-hidden="true">{GLYPH[e.level]}</span> {WORD[e.level]}
                  </span>
                  <span className="syslog-source">{e.source}</span>
                  <span className="syslog-message">{e.message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="syslog-foot">
          <button type="button" onClick={copyLog} disabled={events.length === 0}>
            Copy log
          </button>
          <button type="button" onClick={clearEvents} disabled={events.length === 0}>
            Clear
          </button>
          <button type="button" ref={closeRef} onClick={() => setOpen(false)}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default SystemLogPanel;
