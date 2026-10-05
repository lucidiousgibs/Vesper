import { useEffect, useRef } from "react";
import { getLikelyGateCamps, GATE_CAMP_KILLS_HIGH } from "../lib/route";
import { useTrackedSystemsActivity } from "./useTrackedSystemsActivity";
import { useTheme, isPremiumTheme } from "./useTheme";
import { useToast } from "./useToast";
import { logEvent } from "../lib/eventLog";
import { playCue } from "../lib/cues";

/** How often the watcher looks. The camps query reads the local kill store (the gate
 * lookups behind it are cached), so a minute costs next to nothing. */
const WATCH_INTERVAL_MS = 60_000;

/**
 * Watches the gates you track (Kills > Tracked Systems > Gate) and speaks up the
 * moment one newly crosses into high activity: a log line, a toast and the camp
 * cue. "Newly" is what matters: the first look only records where every gate
 * stands, so opening the app next to an already-camped gate is silent, and a gate
 * that stays hot does not repeat itself every minute. Falling back below the line
 * re-arms it. Premium decks only, like the rest of the signal systems.
 *
 * This is activity in the last hour, the same count the Likely Gate Camps board
 * shows, not a prediction.
 */
export function useTrackedGateCampWatch() {
  const { entries } = useTrackedSystemsActivity();
  const [theme] = useTheme();
  const premium = isPremiumTheme(theme);
  const { showToast } = useToast();
  const wasHot = useRef<Map<number, boolean>>(new Map());
  const seeded = useRef(false);

  const gateIds = entries.filter((e) => e.type === "gate").map((e) => e.id);
  const gateKey = gateIds.join(",");

  useEffect(() => {
    if (!premium || gateIds.length === 0) {
      wasHot.current.clear();
      seeded.current = false;
      return;
    }
    let cancelled = false;
    async function look() {
      try {
        const camps = await getLikelyGateCamps();
        if (cancelled) return;
        const byGate = new Map(camps.map((c) => [c.gate_location_id, c]));
        for (const id of gateIds) {
          const camp = byGate.get(id);
          const hot = (camp?.kills_last_hour ?? 0) >= GATE_CAMP_KILLS_HIGH;
          const before = wasHot.current.get(id) ?? false;
          wasHot.current.set(id, hot);
          if (seeded.current && hot && !before && camp) {
            const text = `${camp.origin_system_name} ${camp.gate_name} gate: ${camp.kills_last_hour} kills in the last hour`;
            logEvent("warn", "GATE", `Camp threshold crossed - ${text}`);
            showToast("Vesper: tracked gate is hot", text, "normal");
            playCue("camp");
          }
        }
        seeded.current = true;
      } catch {
        // A failed look is not worth interrupting anyone for; the next one tries again.
      }
    }
    look();
    const timer = window.setInterval(look, WATCH_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
    // gateKey stands in for gateIds so a re-render with the same gates does not restart the watch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [premium, gateKey]);
}

/** Renders nothing - mounts the watcher from a JSX position in the App shell,
 * mirroring TrackedEntityEventsEffect. */
export function TrackedGateCampWatchEffect() {
  useTrackedGateCampWatch();
  return null;
}
