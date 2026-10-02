import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getRecentActivityKills, pollRecentActivityKills, mergeKillFeeds, type KillEntry } from "../lib/kills";
import { useErrorReporter } from "./useErrorReporter";

const POLL_RETRY_DELAY_MS = 5_000;
/** A long-poll connection sitting idle for up to 60s (killmail.stream's own
 * /poll/ duration) looks exactly like a dead one to plenty of routers/
 * firewalls, which silently drop it - a real but transient failure that
 * self-heals on the very next retry. Surfacing that as a "System Error"
 * modal on the first attempt was pure noise for something usually gone by
 * the second retry; only a genuinely persistent outage (still failing
 * after this many consecutive attempts) is worth interrupting the user
 * about. */
const SILENT_RETRY_ATTEMPTS = 2;

interface RecentActivityState {
  kills: KillEntry[];
  loading: boolean;
  /** Last time the visible kill list actually changed (a poll returned new
   * kills) - what RecentKillsFeed's own "Updated Ns ago" means: how fresh is
   * what's on screen. */
  lastUpdated: string | null;
  /** Last time a poll of this feed *succeeded*, whether or not it returned
   * anything new - a real kill lull (e.g. around downtime) can go a long
   * time with a perfectly healthy feed and zero new kills, during which
   * lastUpdated correctly stops advancing but this should keep advancing.
   * TopBar's KillSyncIndicator reads this one - it's asking "is the feed
   * alive", not "did the list change". */
  lastPolledAt: string | null;
  refreshCount: number;
  refresh: () => void;
}

const RecentActivityContext = createContext<RecentActivityState | null>(null);

/**
 * The live "Most Recent Kills" feed, kept in a provider at the app root
 * (not owned by the Kills & Intel screen) so it keeps streaming for the
 * whole session - switching tabs, drilling into a kill, or leaving Kills &
 * Intel entirely no longer stops it. Whatever screen reads this always
 * sees the most up-to-date state the moment it's opened.
 */
export function useRecentActivity(): RecentActivityState {
  const ctx = useContext(RecentActivityContext);
  if (!ctx) {
    throw new Error("useRecentActivity must be used within a RecentActivityProvider");
  }
  return ctx;
}

interface RecentActivityProviderProps {
  children: ReactNode;
}

export function RecentActivityProvider({ children }: RecentActivityProviderProps) {
  const [kills, setKills] = useState<KillEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [lastPolledAt, setLastPolledAt] = useState<string | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);
  const reportError = useErrorReporter();

  async function loadSnapshot() {
    try {
      const results = await getRecentActivityKills();
      setKills((prev) => mergeKillFeeds(prev, results));
      setLastUpdated(new Date().toISOString());
      setLastPolledAt(new Date().toISOString());
      setRefreshCount((n) => n + 1);
    } catch (err) {
      reportError(`Failed to load recent kills: ${String(err)}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    let consecutiveFailures = 0;

    async function pollLoop() {
      while (active) {
        try {
          const incoming = await pollRecentActivityKills();
          if (!active) break;
          consecutiveFailures = 0;
          setLastPolledAt(new Date().toISOString());
          if (incoming.length > 0) {
            setKills((prev) => mergeKillFeeds(prev, incoming));
            setLastUpdated(new Date().toISOString());
            setRefreshCount((n) => n + 1);
          }
          setLoading(false);
        } catch (err) {
          if (!active) break;
          consecutiveFailures++;
          if (consecutiveFailures > SILENT_RETRY_ATTEMPTS) {
            reportError(`Live kill stream error: ${String(err)}`);
          }
          await new Promise((resolve) => setTimeout(resolve, POLL_RETRY_DELAY_MS));
        }
      }
    }

    loadSnapshot();
    pollLoop();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <RecentActivityContext.Provider value={{ kills, loading, lastUpdated, lastPolledAt, refreshCount, refresh: loadSnapshot }}>
      {children}
    </RecentActivityContext.Provider>
  );
}
