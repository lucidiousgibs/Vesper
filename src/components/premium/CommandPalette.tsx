import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme, isPremiumTheme } from "../../hooks/useTheme";
import { searchSystemsLive, type SystemSearchMatch } from "../../lib/map";
import { formatSecurity } from "../../lib/format";
import { NAV_ITEMS } from "../Sidebar";
import { SUB_TABS } from "../../lib/subTabs";
import type { SessionCharacter } from "../../lib/eve";
import type { SystemSummary } from "../SystemKillboard";
import { OPEN_SYSTEM_LOG_EVENT } from "./SystemLogPanel";
import { playCue } from "../../lib/cues";
import { logEvent } from "../../lib/eventLog";
import { runConnectionChecks } from "../../lib/diagnostics";
import { useRecentActivity } from "../../hooks/useRecentActivity";
import { requestRoute, type RouteWaypoint } from "../../lib/routeRequest";

/** Event name TopBar's hint chip dispatches to open the palette. */
export const OPEN_COMMAND_PALETTE_EVENT = "vesper:open-command-palette";

interface CommandPaletteProps {
  characters: SessionCharacter[];
  activeCharacterId: number | null;
  /** A page id ("kills") or a sub-tab id ("kills.battles"), as Sidebar's onSelect takes. */
  onNavigate: (id: string) => void;
  onOpenSystem: (system: SystemSummary) => void;
  onSwitchCharacter: (id: number) => void;
}

interface Command {
  id: string;
  group: string;
  label: string;
  /** Right-aligned detail, e.g. a system's security. */
  hint?: string;
  run: () => void;
}

const MAX_RESULTS = 12;
const EMPTY_QUERY_RESULTS = 8;

/** Higher is a better match: exact, then prefix, then substring (earlier is
 * better), then letters in order. Zero means no match. */
function score(label: string, query: string): number {
  const l = label.toLowerCase();
  if (l === query) return 100;
  if (l.startsWith(query)) return 80;
  const index = l.indexOf(query);
  if (index >= 0) return 60 - Math.min(index, 30);
  let qi = 0;
  for (const ch of l) {
    if (ch === query[qi]) qi++;
    if (qi === query.length) return 20;
  }
  return 0;
}

/** A terminal-style command line (Ctrl+K) for jumping anywhere in the app:
 * pages, a page's tabs, switching character, or opening a system's killboard
 * by name. Premium decks only. Every entry is a real destination from the
 * app's own navigation tables; nothing is invented, and "System log" opens the
 * real event log. */
function CommandPalette({ characters, activeCharacterId, onNavigate, onOpenSystem, onSwitchCharacter }: CommandPaletteProps) {
  const [theme] = useTheme();
  const premium = isPremiumTheme(theme);
  const { lastPolledAt } = useRecentActivity();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [systems, setSystems] = useState<SystemSearchMatch[]>([]);
  /** Both ends of a typed "route A to B", once each has been looked up. */
  const [routeMatch, setRouteMatch] = useState<[RouteWaypoint, RouteWaypoint] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  // Open on Ctrl+K (or Cmd+K), from the keyboard or the TopBar hint chip.
  useEffect(() => {
    if (!premium) return;
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    function onOpenRequest() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpenRequest);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpenRequest);
    };
  }, [premium]);

  useEffect(() => {
    if (open) {
      playCue("panel");
      returnFocusRef.current = document.activeElement as HTMLElement | null;
      setQuery("");
      setActive(0);
      setSystems([]);
      setRouteMatch(null);
      // Wait a frame so the input exists before focusing it.
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      returnFocusRef.current?.focus?.();
    }
  }, [open]);

  // Look systems up by name once there is enough to search on.
  useEffect(() => {
    const trimmed = query.trim();
    if (!open || trimmed.length < 2) {
      setSystems([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      searchSystemsLive(trimmed)
        .then((matches) => {
          if (!cancelled) setSystems(matches.slice(0, 6));
        })
        .catch(() => {
          if (!cancelled) setSystems([]);
        });
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, open]);

  // "route Jita to Amarr" (also "route Jita > Amarr"): look both systems up by name.
  useEffect(() => {
    const match = /^route\s+(.+?)\s+(?:to|>|->)\s+(.+)$/i.exec(query.trim());
    if (!open || !match) {
      setRouteMatch(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      const pick = (matches: SystemSearchMatch[], typed: string): RouteWaypoint | null => {
        const exact = matches.find((m) => m.name.toLowerCase() === typed.trim().toLowerCase());
        const chosen = exact ?? matches[0];
        return chosen ? { id: chosen.id, name: chosen.name, security: chosen.security } : null;
      };
      Promise.all([searchSystemsLive(match[1].trim()), searchSystemsLive(match[2].trim())])
        .then(([from, to]) => {
          if (cancelled) return;
          const a = pick(from, match[1]);
          const b = pick(to, match[2]);
          setRouteMatch(a && b && a.id !== b.id ? [a, b] : null);
        })
        .catch(() => {
          if (!cancelled) setRouteMatch(null);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, open]);

  const baseCommands = useMemo<Command[]>(() => {
    const list: Command[] = [];
    for (const item of NAV_ITEMS) {
      list.push({ id: `page:${item.id}`, group: "Go to", label: item.label, run: () => onNavigate(item.id) });
    }
    for (const [pageId, tabs] of Object.entries(SUB_TABS)) {
      const page = NAV_ITEMS.find((n) => n.id === pageId);
      if (!page) continue;
      for (const tab of tabs) {
        list.push({ id: `tab:${pageId}.${tab.id}`, group: "Go to", label: `${page.label} > ${tab.label}`, run: () => onNavigate(`${pageId}.${tab.id}`) });
      }
    }
    for (const c of characters) {
      if (c.id === activeCharacterId) continue;
      list.push({ id: `char:${c.id}`, group: "Character", label: `Switch to ${c.name}`, run: () => onSwitchCharacter(c.id) });
    }
    list.push({
      id: "action:check",
      group: "System",
      label: "Check connections",
      hint: "re-run the startup checks",
      run: () => {
        const characterName = characters.find((c) => c.id === activeCharacterId)?.name ?? null;
        void runConnectionChecks({ characterName, killStreamLive: lastPolledAt != null }).then((results) => {
          for (const r of results) logEvent(r.ok ? "info" : "warn", "DIAG", `${r.key}: ${r.detail}`);
          const failed = results.filter((r) => !r.ok).length;
          logEvent(failed === 0 ? "info" : "warn", "DIAG", failed === 0 ? "Connection check passed" : `Connection check: ${failed} of ${results.length} need attention`);
          playCue(failed === 0 ? "scan" : "warn");
          window.dispatchEvent(new CustomEvent(OPEN_SYSTEM_LOG_EVENT));
        });
      },
    });
    list.push({
      id: "action:log",
      group: "System",
      label: "System log",
      hint: "real events this session",
      run: () => window.dispatchEvent(new CustomEvent(OPEN_SYSTEM_LOG_EVENT)),
    });
    return list;
  }, [characters, activeCharacterId, onNavigate, onSwitchCharacter, lastPolledAt]);

  const results = useMemo<Command[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return baseCommands.slice(0, EMPTY_QUERY_RESULTS);
    const matched = baseCommands
      .map((c) => ({ c, s: score(c.label, q) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.c);
    const systemCommands: Command[] = systems.map((s) => ({
      id: `sys:${s.id}`,
      group: "System",
      label: `${s.name} killboard`,
      hint: formatSecurity(s.security),
      run: () => onOpenSystem({ id: s.id, name: s.name, security: s.security, regionName: null }),
    }));
    const routeCommands: Command[] = routeMatch
      ? [
          {
            id: "route",
            group: "Route",
            label: `Check route ${routeMatch[0].name} to ${routeMatch[1].name}`,
            hint: "plans it in Gate Check",
            run: () => {
              requestRoute(routeMatch);
              onNavigate("map");
            },
          },
        ]
      : [];
    return [...routeCommands, ...matched, ...systemCommands].slice(0, MAX_RESULTS);
  }, [query, baseCommands, systems, onOpenSystem, routeMatch, onNavigate]);

  if (!premium || !open) return null;

  function close() {
    setOpen(false);
  }

  function runCommand(cmd: Command | undefined) {
    if (!cmd) return;
    close();
    cmd.run();
  }

  function onInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, Math.max(results.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      runCommand(results[active]);
    }
  }

  return (
    <div className="cmdk-backdrop" role="presentation" onMouseDown={close}>
      <div className="cmdk" role="dialog" aria-modal="true" aria-label="Command line" onMouseDown={(e) => e.stopPropagation()}>
        <div className="cmdk-input-row">
          <span className="cmdk-prompt" aria-hidden="true">
            &gt;
          </span>
          <input
            ref={inputRef}
            className="cmdk-input"
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="cmdk-list"
            aria-activedescendant={results[active] ? `cmdk-opt-${results[active].id}` : undefined}
            aria-label="Type a page, tab, character or system name"
            placeholder="Go to a page, tab, character or system, or try: route Jita to Amarr"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onInputKey}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <ul className="cmdk-list" id="cmdk-list" role="listbox">
          {results.length === 0 ? (
            <li className="cmdk-empty">Nothing matches &ldquo;{query.trim()}&rdquo;.</li>
          ) : (
            results.map((cmd, i) => (
              <li
                key={cmd.id}
                id={`cmdk-opt-${cmd.id}`}
                role="option"
                aria-selected={i === active}
                className={`cmdk-item${i === active ? " cmdk-item-active" : ""}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => runCommand(cmd)}
              >
                <span className="cmdk-group">{cmd.group}</span>
                <span className="cmdk-label">{cmd.label}</span>
                {cmd.hint && <span className="cmdk-hint">{cmd.hint}</span>}
              </li>
            ))
          )}
        </ul>
        <div className="cmdk-footer">
          <span>Up/Down move</span>
          <span>Enter run</span>
          <span>Esc close</span>
        </div>
      </div>
    </div>
  );
}

export default CommandPalette;
