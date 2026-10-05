import { getServerStatus } from "./eve";
import { searchSystemsLive } from "./map";

/** The real checks behind both the startup sequence and the "Check connections"
 * command. Nothing here is simulated: the ESI line is a live status request (and
 * its timing is the real round trip), the map line is a lookup against the local
 * systems cache. A check that fails says so. */

export const CHECK_TIMEOUT_MS = 1500;

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export interface CheckResult {
  key: string;
  ok: boolean;
  detail: string;
}

/** One ESI status request, timed. `ms` is null when it failed or timed out. */
export async function checkEsiLink(): Promise<CheckResult & { ms: number | null; serverOnline: boolean | null; players: number | null }> {
  const started = performance.now();
  try {
    const status = await withTimeout(getServerStatus(), CHECK_TIMEOUT_MS);
    const ms = Math.round(performance.now() - started);
    return { key: "ESI link", ok: true, detail: `connected, ${ms} ms${status.online ? "" : ", Tranquility offline"}`, ms, serverOnline: status.online, players: status.players };
  } catch {
    return { key: "ESI link", ok: false, detail: "unreachable", ms: null, serverOnline: null, players: null };
  }
}

export async function checkMapIndex(): Promise<CheckResult> {
  try {
    const matches = await withTimeout(searchSystemsLive("Ja"), CHECK_TIMEOUT_MS);
    return matches.length > 0
      ? { key: "Map index", ok: true, detail: "ready" }
      : { key: "Map index", ok: false, detail: "returned nothing" };
  } catch {
    return { key: "Map index", ok: false, detail: "unavailable" };
  }
}

/** Runs every check once, the two network ones in parallel, and returns them in display order. */
export async function runConnectionChecks(state: { characterName: string | null; killStreamLive: boolean }): Promise<CheckResult[]> {
  const [esi, map] = await Promise.all([checkEsiLink(), checkMapIndex()]);
  return [
    { key: "Core", ok: true, detail: "online" },
    esi,
    {
      key: "Character",
      ok: state.characterName != null,
      detail: state.characterName ? state.characterName : "none signed in",
    },
    map,
    {
      key: "Kill stream",
      ok: state.killStreamLive,
      detail: state.killStreamLive ? "live" : "waiting for the first poll",
    },
  ];
}
