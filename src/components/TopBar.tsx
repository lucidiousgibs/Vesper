import { useEffect, useRef, useState } from "react";
import { MapPin, Satellite, Star, X } from "lucide-react";
import { getServerStatus, type Session, type SessionCharacter } from "../lib/eve";
import { searchSystemsLive, type SystemSearchMatch } from "../lib/map";
import { useLocationTracking, type ProximityRadius } from "../hooks/useLocationTracking";
import { useRecentActivity } from "../hooks/useRecentActivity";
import { useTheme, isPremiumTheme, THEMES } from "../hooks/useTheme";
import { useNow } from "../hooks/useNow";
import { useEventLog } from "../lib/eventLog";
import SignalLamp from "./premium/SignalLamp";
import SegmentDisplay from "./premium/SegmentDisplay";
import Sparkline from "./premium/Sparkline";
import { getKillRateBins } from "../lib/route";
import { useNetActivity } from "../hooks/useNetActivity";
import StatusLamp from "./premium/StatusLamp";
import { OPEN_SYSTEM_LOG_EVENT } from "./premium/SystemLogPanel";
import { OPEN_COMMAND_PALETTE_EVENT } from "./premium/CommandPalette";
import { useFavouritePages } from "../hooks/useFavouritePages";
import { SUB_TABS } from "../lib/subTabs";
import StatusChip from "./StatusChip";
import HelpBadge from "./HelpBadge";
import NotificationBell from "./NotificationBell";
import { HELP_CONTENT } from "../lib/helpContent";
import { formatSecondsAgo } from "../lib/format";

interface TopBarProps {
  title: string;
  activeId: string;
  session: Session;
  onSwitch: (id: number) => void;
  onAdd: () => void;
  onLogout: (id: number) => void;
  /** Passed straight through to NotificationBell - see its own prop of the
   * same name. */
  onOpenKillmail: (killmailId: number) => void;
  /** Passed straight through to NotificationBell - see its own prop of the
   * same name. */
  onOpenWhatsNew?: () => void;
}

/** EVE's in-game clock is always UTC, no timezone offset - shown so time-sensitive
 * things (skill queue finishes, market order expiry) can be read against it directly. */
function EveTimeClock() {
  const [theme] = useTheme();
  // A few premium decks draw the clock as a seven-segment readout instead of text.
  const segmented = THEMES.find((t) => t.id === theme)?.segmentClock === true;
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <div className="eve-time-clock">
      <span className="eve-time-label">EVE Time</span>
      <span className="eve-time-value">
        {segmented ? (
          <SegmentDisplay
            text={`${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}`}
            label={`EVE time ${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}`}
          />
        ) : (
          <>
            {pad(now.getUTCHours())}:{pad(now.getUTCMinutes())}:{pad(now.getUTCSeconds())}
          </>
        )}
      </span>
    </div>
  );
}

/** EVE's daily downtime is a fixed, well-known schedule (11:00 UTC, ~30min) -
 * not something ESI exposes, so this is just computed from the clock. */
function nextDowntime(now: Date): Date {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 11, 0, 0));
  if (next.getTime() <= now.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next;
}

function timeUntilDowntime(now: Date): string {
  const diffMs = nextDowntime(now).getTime() - now.getTime();
  const totalSeconds = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (hours >= 1) return `${hours}h ${minutes}m`;
  return `${pad(minutes)}:${pad(seconds)}`;
}

/** Once Tranquility's own login server is back up, ESI (the API this badge
 * actually checks) can lag several minutes behind before it stops 503ing
 * with "maintenance mode" - a real, separate CCP-side delay, not something
 * we can shortcut. This just makes sure recovery is *noticed* fast once ESI
 * genuinely does come back, by checking far more often while offline than
 * once things are healthy. */
const SERVER_STATUS_POLL_ONLINE_MS = 60000;
const SERVER_STATUS_POLL_OFFLINE_MS = 15000;

/** Shared by ServerStatusBadge and CapsuleersOnlineBadge so both boxes read
 * off one poll instead of each hitting the server-status endpoint on its
 * own timer. */
function useServerStatus() {
  const [status, setStatus] = useState<{ online: boolean; players: number | null; ms: number | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    function scheduleNext(online: boolean) {
      timeoutId = setTimeout(poll, online ? SERVER_STATUS_POLL_ONLINE_MS : SERVER_STATUS_POLL_OFFLINE_MS);
    }

    function poll() {
      const started = performance.now();
      getServerStatus()
        .then((s) => {
          if (cancelled) return;
          // The round trip of this request is the app's real ESI latency, shown on premium decks.
          setStatus({ ...s, ms: Math.round(performance.now() - started) });
          scheduleNext(s.online);
        })
        .catch(() => {
          if (cancelled) return;
          setStatus({ online: false, players: null, ms: null });
          scheduleNext(false);
        });
    }

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, []);

  return status;
}

function ServerStatusBadge() {
  const status = useServerStatus();
  const [theme] = useTheme();
  const premium = isPremiumTheme(theme);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="server-status-badge">
      <StatusChip
        label="Tranquility"
        value={status == null ? "..." : status.online ? "Online" : "Offline"}
        tone={status == null ? "neutral" : status.online ? "online" : "danger"}
      />
      <span className="status-chip-sep">·</span>
      <span
        className={(() => {
          const msLeft = nextDowntime(now).getTime() - now.getTime();
          if (msLeft < 300000) return "server-status-downtime-soon server-status-downtime-critical";
          if (msLeft < 3600000) return "server-status-downtime-soon";
          return undefined;
        })()}
      >
        Downtime in {timeUntilDowntime(now)}
      </span>
      {premium && status?.ms != null && (
        <span className="server-status-latency" title="Round trip of the last ESI status request">
          <span className="status-chip-sep">·</span> {status.ms} ms
        </span>
      )}
    </div>
  );
}

/** Split out of ServerStatusBadge into its own box - same server-status poll
 * (via useServerStatus), just its own chip so it can sit between the Server
 * and Connected boxes instead of crowding onto one line with the downtime
 * countdown. */
function CapsuleersOnlineBadge() {
  const status = useServerStatus();
  return (
    <div className="capsuleers-online-badge">
      <span className="capsuleers-online-count">{status?.players != null ? new Intl.NumberFormat("en-US").format(status.players) : "..."}</span>
      <span className="capsuleers-online-label">Capsuleers Online</span>
    </div>
  );
}

export const RADIUS_OPTIONS: { value: ProximityRadius; label: string }[] = [
  { value: 0, label: "Here" },
  { value: 1, label: "1" },
  { value: 2, label: "2" },
  { value: 3, label: "3" },
  { value: 5, label: "5" },
  { value: 7, label: "7" },
  { value: 9, label: "9" },
  { value: "region", label: "Region" },
];

/** Shared by both radius pickers (here and MapView's own) so the tooltip
 * wording can't drift between them. */
export function radiusTitle(value: ProximityRadius): string {
  if (value === "region") return "Track the whole region";
  if (value === 0) return "Track only this system - no neighbors";
  return `Track ${value} jumps out`;
}

/** Lets the pilot say "I'm here" - either a manually-set current system, or
 * (via the satellite toggle) one that follows a chosen character's real
 * in-game location automatically as they move - both drive the same
 * proximity kill scan (Map ticker highlight + app-wide flash). Sits next to
 * the server status badge so it's always visible/settable regardless of
 * which page is open. */
function LocationTracker({ characters }: { characters: SessionCharacter[] }) {
  const {
    currentSystem,
    setCurrentSystem,
    liveTrackingCharacterId,
    setLiveTrackingCharacterId,
    liveTrackingNeedsReauth,
    radius,
    setRadius,
  } = useLocationTracking();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SystemSearchMatch[]>([]);
  const [characterPickerOpen, setCharacterPickerOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setResults([]);
        setCharacterPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    searchSystemsLive(trimmed)
      .then((matches) => {
        if (!cancelled) setResults(matches);
      })
      .catch(() => {
        if (!cancelled) setResults([]);
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  function pickSystem(system: SystemSearchMatch) {
    setCurrentSystem({ id: system.id, name: system.name });
    setQuery("");
    setResults([]);
  }

  const trackedCharacter = liveTrackingCharacterId != null ? characters.find((c) => c.id === liveTrackingCharacterId) ?? null : null;

  return (
    <div className="location-tracker" ref={containerRef}>
      {currentSystem ? (
        <div className="location-tracker-current">
          {trackedCharacter ? (
            <span className="location-tracker-live-dot" title={`Following ${trackedCharacter.name}'s live location`} />
          ) : (
            <MapPin size={13} strokeWidth={2} />
          )}
          <span>
            {currentSystem.name}
            {trackedCharacter && <span className="location-tracker-live-label"> · {trackedCharacter.name}</span>}
          </span>
          <button
            type="button"
            className="location-tracker-clear"
            onClick={() => setCurrentSystem(null)}
            aria-label="Clear tracked location"
            title="Clear tracked location"
          >
            <X size={12} strokeWidth={2} className="icon-danger" />
          </button>
          <div className="location-tracker-radius">
            {RADIUS_OPTIONS.map((option) => (
              <button
                key={option.label}
                type="button"
                className={`location-tracker-radius-btn${radius === option.value ? " location-tracker-radius-active" : ""}`}
                onClick={() => setRadius(option.value)}
                title={radiusTitle(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="location-tracker-search">
          <MapPin size={13} strokeWidth={2} />
          <input
            type="text"
            name="location-search"
            placeholder="Set my location..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {results.length > 0 && (
            <div className="location-tracker-results">
              {results.map((system) => (
                <button key={system.id} type="button" onClick={() => pickSystem(system)}>
                  {system.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {characters.length > 0 && (
        <div className="location-tracker-live-wrap">
          <button
            type="button"
            className={`location-tracker-live-toggle${trackedCharacter ? " location-tracker-live-toggle-active" : ""}`}
            onClick={() => setCharacterPickerOpen((open) => !open)}
            aria-label="Track live based on a character's location"
            title={trackedCharacter ? `Tracking ${trackedCharacter.name} live - click to change` : "Track live based on a character's real in-game location"}
          >
            <Satellite size={13} strokeWidth={2} />
          </button>
          {characterPickerOpen && (
            <div className="location-tracker-results location-tracker-character-picker">
              {characters.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={c.id === liveTrackingCharacterId ? "location-tracker-character-active" : ""}
                  onClick={() => {
                    setLiveTrackingCharacterId(c.id);
                    setCharacterPickerOpen(false);
                  }}
                >
                  {c.name}
                </button>
              ))}
              {trackedCharacter && (
                <button
                  type="button"
                  className="location-tracker-character-stop"
                  onClick={() => {
                    setLiveTrackingCharacterId(null);
                    setCharacterPickerOpen(false);
                  }}
                >
                  Stop live tracking
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {liveTrackingNeedsReauth && trackedCharacter && (
        <span className="location-tracker-reauth-note" title="Sign in again to grant this character's location access">
          {trackedCharacter.name} needs reauth
        </span>
      )}
    </div>
  );
}

/** A poll taking this much longer than expected is "might actually be stuck",
 * not just a quiet moment - matches ServerStatusBadge's own 60s healthy-poll
 * convention above rather than inventing a new number. */
const KILL_SYNC_STALE_AFTER_MS = 60_000;

/** Persistent "data is actually live" readout, promoted from the same
 * live-dot/formatSecondsAgo pattern RecentKillsFeed/TrackedSystemsFeed use
 * per-widget - scoped to the one feed that's genuinely global (the kill
 * stream RecentActivityProvider polls from the app root regardless of which
 * tab is open), not an unscoped "everything is synced" claim.
 *
 * Reads lastPolledAt (last successful poll, whether or not it returned new
 * kills), not lastUpdated (last time the kill list itself changed) - a quiet
 * stretch with zero new kills is a healthy feed, not a stale one, and this
 * badge is answering "is the feed alive", not "did anything happen". Ticks
 * once a second so "Ns ago" stays live between polls, the same reason
 * RecentKillsFeed does the same thing for its own "Updated Ns ago" text. */
function KillSyncIndicator() {
  const { lastPolledAt } = useRecentActivity();
  // The shared one-second clock keeps "Ns ago" live (and, under a premium deck,
  // lets the lamp fade) without a timer of its own.
  const now = useNow();
  const [theme] = useTheme();
  const premium = isPremiumTheme(theme);
  // Premium decks add a small trace of how many kills New Eden produced in each five
  // minutes of the last hour, read from the local kill store once a minute.
  const [rate, setRate] = useState<number[] | null>(null);
  useEffect(() => {
    if (!premium) return;
    let cancelled = false;
    const load = () => {
      getKillRateBins()
        .then((bins) => {
          if (!cancelled) setRate(bins);
        })
        .catch(() => undefined);
    };
    load();
    const id = window.setInterval(load, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [premium]);

  if (!lastPolledAt) {
    return (
      <div className="server-status-badge topbar-sync-badge" title="Waiting for the first kill-stream poll to resolve">
        {premium ? <SignalLamp since={null} staleAfterMs={KILL_SYNC_STALE_AFTER_MS} /> : <span className="kills-live-dot topbar-sync-dot-idle" />}
        <span>Kills syncing...</span>
      </div>
    );
  }
  const polledAt = new Date(lastPolledAt).getTime();
  const stale = now - polledAt > KILL_SYNC_STALE_AFTER_MS;
  return (
    <div className="server-status-badge topbar-sync-badge" title="Most recent successful kill-stream poll">
      {premium ? (
        <SignalLamp since={polledAt} staleAfterMs={KILL_SYNC_STALE_AFTER_MS} />
      ) : (
        <span className={`kills-live-dot${stale ? " topbar-sync-dot-idle" : ""}`} />
      )}
      {premium && stale && (
        <span className="topbar-stale-glyph" title="The kill stream has not answered recently" aria-label="Stale">
          &#9650;
        </span>
      )}
      <span>Kills {formatSecondsAgo(lastPolledAt)}</span>
      {premium && rate && (
        <span className="topbar-kill-rate" title="Kills across New Eden per five minutes, last hour">
          <Sparkline values={rate} label="Kills across New Eden per five minutes over the last hour" width={58} height={16} minMax={4} />
        </span>
      )}
    </div>
  );
}

/** Premium decks: one readout of the app's real ESI traffic. A TX light flashes when a
 * request went out in the last second, an RX light when an answer came back, and the
 * count is every ESI request this session. Both lights go red while requests are failing. */
function NetActivityIndicator() {
  const [theme] = useTheme();
  const premium = isPremiumTheme(theme);
  const net = useNetActivity(premium);
  if (!premium || !net) return null;
  const fmt = (n: number) => new Intl.NumberFormat("en-US").format(n);
  return (
    <div
      className="server-status-badge topbar-sync-badge topbar-net-badge"
      title={`ESI requests this session: ${fmt(net.sent)} sent, ${fmt(net.received)} answered, ${fmt(net.failed)} failed. The lights show activity in the last second.`}
    >
      <span className="topbar-net-label">NET</span>
      <span className="topbar-net-light">
        <StatusLamp tone={net.failing ? "danger" : "online"} lit={net.txActive} />
        TX
      </span>
      <span className="topbar-net-light">
        <StatusLamp tone={net.failing ? "danger" : "online"} lit={net.rxActive} />
        RX
      </span>
      <span className="topbar-net-count">{fmt(net.sent)}</span>
    </div>
  );
}

/** A small chip that opens the command line (Ctrl+K), premium decks only. */
function CommandHint() {
  const [theme] = useTheme();
  if (!isPremiumTheme(theme)) return null;
  function open() {
    window.dispatchEvent(new CustomEvent(OPEN_COMMAND_PALETTE_EVENT));
  }
  return (
    <div
      className="server-status-badge topbar-sync-badge topbar-clickable-badge topbar-cmd-hint"
      title="Open the command line to jump to any page, tab, character or system"
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
    >
      <span className="status-chip-label">Cmd</span>
      <span className="status-chip-sep">//</span>
      <span className="status-chip-value">Ctrl+K</span>
    </div>
  );
}

/** How far back an error still counts toward the SYS lamp. */
const SYS_FAULT_WINDOW_MS = 10 * 60_000;

/** Premium decks only: one lamp for "has anything gone wrong recently?",
 * counted from the real error log (every error a user is shown goes through
 * the error reporter, which records it). Nominal with none in the last ten
 * minutes, Degraded for one or two, Faulted for three or more. The tooltip
 * names the latest one. Never decorative: it only leaves Nominal because a
 * real error was reported. */
function SystemHealthIndicator() {
  const [theme] = useTheme();
  const events = useEventLog();
  const now = useNow();
  if (!isPremiumTheme(theme)) return null;

  const recent = events.filter((e) => e.level === "error" && now - e.at < SYS_FAULT_WINDOW_MS);
  const tone = recent.length === 0 ? "online" : recent.length < 3 ? "warning" : "danger";
  const label = recent.length === 0 ? "Nominal" : recent.length < 3 ? "Degraded" : "Faulted";
  const latest = recent[recent.length - 1];
  const title = latest
    ? `${recent.length} error${recent.length === 1 ? "" : "s"} in the last 10 minutes. Latest: ${latest.message}`
    : "No errors reported in the last 10 minutes";
  function openLog() {
    window.dispatchEvent(new CustomEvent(OPEN_SYSTEM_LOG_EVENT));
  }
  return (
    <div
      className="server-status-badge topbar-sync-badge topbar-clickable-badge topbar-sys-badge"
      title={`${title}. Click to open the system log.`}
      role="button"
      tabIndex={0}
      onClick={openLog}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openLog();
        }
      }}
    >
      <span className={`status-chip status-chip-${tone}`}>
        <span className="status-chip-label">Sys</span>
        <span className="status-chip-sep">//</span>
        <span className="status-chip-value">
          <StatusLamp tone={tone} />
          {label}
        </span>
      </span>
    </div>
  );
}

function TopBar({ title, activeId, session, onSwitch, onAdd, onLogout, onOpenKillmail, onOpenWhatsNew }: TopBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const active =
    session.characters.find((c) => c.id === session.active_character_id) ??
    session.characters[0];
  const helpContent = HELP_CONTENT[activeId];
  const { isFavouritePage, toggleFavouritePage } = useFavouritePages();
  // Multi-tab pages favourite a specific tab ("wallet.lpstore"), not the page
  // as a whole - that star lives right on the page's own tab bar/header
  // (FavouriteTabButton) instead of up here, since this button has no idea
  // which internal tab is currently open. Single-tab pages still favourite
  // themselves from here, same as always.
  const hasSubTabs = SUB_TABS[activeId] != null;
  const favourited = isFavouritePage(activeId);

  return (
    <header className="topbar">
      <div className="topbar-row topbar-row-primary">
        <div className="topbar-title-group">
          <h1 className="topbar-title">{title}</h1>
          {!hasSubTabs && (
            <button
              type="button"
              className={`topbar-favourite-toggle${favourited ? " topbar-favourite-toggle-active" : ""}`}
              onClick={() => toggleFavouritePage(activeId)}
              aria-label={favourited ? `Remove ${title} from Favourites` : `Add ${title} to Favourites`}
              title={favourited ? "Remove from Favourites" : "Add to Favourites - starred pages show in the Sidebar's Favourites view"}
            >
              <Star size={16} strokeWidth={2} fill={favourited ? "currentColor" : "none"} />
            </button>
          )}
          {helpContent && <HelpBadge content={helpContent} />}
        </div>
        <div className="topbar-account-group">
          <div className="account-menu">
            <button
              type="button"
              className="account-trigger"
              onClick={() => setMenuOpen((open) => !open)}
            >
              {active ? (
                <>
                  <img className="account-portrait" src={active.portrait_url} alt="" />
                  <StatusChip label={active.name} value="Connected" tone="online" />
                </>
              ) : (
                <StatusChip label="Session" value="Offline" tone="neutral" />
              )}
            </button>
            {menuOpen && (
              <div className="account-panel">
                {session.characters.map((character) => (
                  <div key={character.id} className="account-row">
                    <button
                      type="button"
                      className={`account-row-select${
                        character.id === session.active_character_id ? " account-row-active" : ""
                      }`}
                      onClick={() => {
                        onSwitch(character.id);
                        setMenuOpen(false);
                      }}
                    >
                      <img className="account-portrait" src={character.portrait_url} alt="" />
                      <span>{character.name}</span>
                    </button>
                    <button
                      type="button"
                      className="account-row-logout"
                      onClick={() => onLogout(character.id)}
                    >
                      Log out
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="account-add"
                  onClick={() => {
                    onAdd();
                    setMenuOpen(false);
                  }}
                >
                  + Add character
                </button>
              </div>
            )}
          </div>
          <EveTimeClock />
          <NotificationBell onOpenKillmail={onOpenKillmail} onOpenWhatsNew={onOpenWhatsNew} />
        </div>
      </div>
      <div className="topbar-row topbar-row-status">
        <div className="topbar-status-group">
          <LocationTracker characters={session.characters} />
          <KillSyncIndicator />
          <SystemHealthIndicator />
          <NetActivityIndicator />
          <CommandHint />
        </div>
        <div className="topbar-status-group">
          <ServerStatusBadge />
          <CapsuleersOnlineBadge />
        </div>
      </div>
    </header>
  );
}

export default TopBar;
