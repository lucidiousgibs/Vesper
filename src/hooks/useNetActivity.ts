import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface NetStats {
  sent: number;
  received: number;
  failed: number;
}

export interface NetActivity extends NetStats {
  /** True when at least one request went out since the previous look. */
  txActive: boolean;
  /** True when at least one answer came back since the previous look. */
  rxActive: boolean;
  /** True when at least one request failed since the previous look. */
  failing: boolean;
}

const POLL_MS = 1000;

/** Polls the backend's running count of ESI requests once a second, and reports whether
 * anything went out, came back or failed since the last look. A second is the finest
 * the lights can honestly be: they show "activity in the last second", never a
 * request-by-request replay. Only polls while `active`. */
export function useNetActivity(active: boolean): NetActivity | null {
  const [activity, setActivity] = useState<NetActivity | null>(null);
  const previous = useRef<NetStats | null>(null);

  useEffect(() => {
    if (!active) {
      previous.current = null;
      setActivity(null);
      return;
    }
    let cancelled = false;
    const look = () => {
      invoke<NetStats>("get_net_stats")
        .then((now) => {
          if (cancelled) return;
          const before = previous.current;
          previous.current = now;
          setActivity({
            ...now,
            txActive: before != null && now.sent > before.sent,
            rxActive: before != null && now.received > before.received,
            failing: before != null && now.failed > before.failed,
          });
        })
        .catch(() => undefined);
    };
    look();
    const id = window.setInterval(look, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [active]);

  return activity;
}
