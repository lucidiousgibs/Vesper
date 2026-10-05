import { useEffect, useState, useSyncExternalStore } from "react";

/** One shared one-second clock for everything that needs "how old is this?"
 * to stay live (decaying lamps, "Ns ago" text). A single interval serves
 * every subscriber and stops entirely when nobody is subscribed, instead of
 * each component running its own timer. */
let current = Date.now();
let timer: number | undefined;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (timer === undefined) {
    current = Date.now();
    timer = window.setInterval(() => {
      current = Date.now();
      listeners.forEach((l) => l());
    }, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== undefined) {
      window.clearInterval(timer);
      timer = undefined;
    }
  };
}

/** Epoch milliseconds, updated once a second while mounted. */
export function useNow(): number {
  return useSyncExternalStore(subscribe, () => current);
}

/** Epoch milliseconds, updated every 30 seconds while `active`. For display that
 * only changes on a scale of minutes (a row dimming as it ages), where the one-second
 * clock above would re-render far more than the eye could tell. Does nothing, and costs
 * nothing, while inactive. */
export function useNowCoarse(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}
