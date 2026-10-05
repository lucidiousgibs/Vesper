import { useMemo } from "react";
import { useTheme, isPremiumTheme } from "../../hooks/useTheme";
import { useNowCoarse } from "../../hooks/useNow";
import { formatTimeRemainingFull, formatTimeElapsedFull } from "../../lib/format";
import type { PlanetEntry, PlanetPin } from "../../lib/eve";
import StatusLamp from "./StatusLamp";
import TimerBar from "./TimerBar";

export interface PiBoardColony {
  key: string;
  characterName: string;
  planet: PlanetEntry;
  pins: PlanetPin[] | null;
}

/** An extractor with less than this long left counts as "expiring soon". */
const SOON_MS = 6 * 60 * 60 * 1000;

type ExtractorState = "idle" | "soon" | "running";

function stateOf(pin: PlanetPin, now: number): ExtractorState {
  const end = pin.expiry_time ? Date.parse(pin.expiry_time) : NaN;
  if (!Number.isFinite(end) || end <= now) return "idle";
  return end - now < SOON_MS ? "soon" : "running";
}

const STATE_WORD: Record<ExtractorState, string> = { idle: "Needs restart", soon: "Expiring soon", running: "Running" };

/** A board of the pilot's planetary colonies, most urgent first: each tile is a planet with a
 * lamp for every extractor on it (grey while it runs, amber when it is about to expire, red
 * when it has stopped and needs restarting in-game) and a progress bar for the program
 * that finishes first. Built from the pins the colony table already loads. It does not draw
 * the links between pins or storage fill, because the backend does not read those from ESI.
 * Premium decks only. */
function PiBoard({ colonies }: { colonies: PiBoardColony[] }) {
  const [theme] = useTheme();
  const premium = isPremiumTheme(theme);
  const now = useNowCoarse(premium);

  const tiles = useMemo(() => {
    return colonies
      .map((colony) => {
        const extractors = (colony.pins ?? []).filter((p) => p.is_extractor && p.expiry_time);
        const states = extractors.map((pin) => ({ pin, state: stateOf(pin, now) }));
        const urgent = states.some((s) => s.state === "idle") ? 0 : states.some((s) => s.state === "soon") ? 1 : 2;
        const next = states
          .filter((s) => s.state !== "idle")
          .sort((a, b) => Date.parse(a.pin.expiry_time!) - Date.parse(b.pin.expiry_time!))[0];
        const stoppedSince = states
          .filter((s) => s.state === "idle")
          .sort((a, b) => Date.parse(a.pin.expiry_time!) - Date.parse(b.pin.expiry_time!))[0];
        return { colony, states, urgent, next, stoppedSince };
      })
      .sort((a, b) => a.urgent - b.urgent || a.colony.planet.planet_name.localeCompare(b.colony.planet.planet_name));
  }, [colonies, now]);

  if (!premium || tiles.length === 0) return null;

  return (
    <div className="pi-board" aria-label="Planetary colonies, most urgent first">
      {tiles.map(({ colony, states, urgent, next, stoppedSince }) => (
        <div className={`pi-tile pi-tile-${urgent === 0 ? "idle" : urgent === 1 ? "soon" : "ok"}`} key={colony.key}>
          <div className="pi-tile-head">
            <span className="pi-tile-planet">{colony.planet.planet_name}</span>
            <span className="pi-tile-type">{colony.planet.planet_type}</span>
          </div>
          <div className="pi-tile-sub">
            {colony.planet.solar_system_name} &middot; {colony.characterName}
          </div>
          {states.length === 0 ? (
            <div className="pi-tile-note">No extractors on this planet.</div>
          ) : (
            <>
              <div className="pi-tile-lamps" role="list">
                {states.map(({ pin, state }) => (
                  <span
                    className={`pi-tile-lamp pi-tile-lamp-${state}`}
                    role="listitem"
                    key={pin.pin_id}
                    title={`${pin.type_name}${pin.product_type_name ? `, ${pin.product_type_name}` : ""}: ${STATE_WORD[state]}`}
                    aria-label={`${pin.type_name}: ${STATE_WORD[state]}`}
                  >
                    <StatusLamp
                      tone={state === "idle" ? "danger" : state === "soon" ? "attention" : "neutral"}
                      lit
                      className={state === "running" ? "status-lamp-calm" : undefined}
                    />
                    <span className="pi-tile-lamp-shape" aria-hidden="true">
                      {state === "idle" ? "■" : state === "soon" ? "▲" : ""}
                    </span>
                  </span>
                ))}
                <span className="pi-tile-count">
                  {states.filter((s) => s.state === "running").length} running
                  {states.some((s) => s.state === "soon") ? `, ${states.filter((s) => s.state === "soon").length} expiring soon` : ""}
                  {states.some((s) => s.state === "idle") ? `, ${states.filter((s) => s.state === "idle").length} stopped` : ""}
                </span>
              </div>
              {next && next.pin.install_time && next.pin.expiry_time && (
                <div className="pi-tile-timer">
                  <TimerBar start={next.pin.install_time} end={next.pin.expiry_time} label="Next extraction program to finish" />
                  <span className="pi-tile-left">{formatTimeRemainingFull(next.pin.expiry_time)} left</span>
                </div>
              )}
              {stoppedSince && (
                <div className="pi-tile-note pi-tile-note-idle">
                  &#9632; Stopped {formatTimeElapsedFull(stoppedSince.pin.expiry_time!)} ago, restart it in-game.
                </div>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  );
}

export default PiBoard;
