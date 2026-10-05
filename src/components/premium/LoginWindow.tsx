import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { checkEsiLink } from "../../lib/diagnostics";
import type { BootSound } from "../../lib/bootSound";
import StatusLamp, { type LampTone } from "./StatusLamp";
import Sparkline from "./Sparkline";

type EsiResult = Awaited<ReturnType<typeof checkEsiLink>>;
type LineState = "pending" | "ok" | "fail";

export interface LoginLine {
  logKey: string;
  value: string;
  state: LineState;
}

export interface LoginPilot {
  id: number;
  name: string;
  portraitUrl: string;
}

/** What the active pilot's location lookup said. "pending" while it is in flight, "error" when it
 * failed or timed out, "none" when there is no active pilot to ask about. */
export type LoginAccess =
  | { status: "pending" | "error" | "none" }
  | { status: "done"; needsReauth: boolean; system: string | null; ship: string | null };

export interface LoginNet {
  sent: number;
  received: number;
  failed: number;
}

/* The window's own schedule, in milliseconds from the moment it opens. */
const HEAD_AT = 350;
const AUTH_AT = 750;
const AUTH_STEP = 260;
const AUTH_COUNT = 6;
const FAULT_AT = AUTH_AT + AUTH_COUNT * AUTH_STEP + 150;
const WELCOME_AT = FAULT_AT + 400;
const WELCOME_CHAR_MS = 38;
const OPERATIONAL_AT = WELCOME_AT + 1000;
const SIDE_AT = [500, 800, 1100];
/* The ending. The final screen holds for four seconds; then everything but the logo fades out,
 * the logo floats to the middle of the screen, and the ship's voice speaks as it arrives. */
const HOLD_MS = 4000;
export const OUTRO_AT = OPERATIONAL_AT + HOLD_MS;
export const FLOAT_AT = OUTRO_AT + 600;
const FLOAT_MS = 1500;
export const VOICE_AT = FLOAT_AT + FLOAT_MS - 100;

/** Fits the sequence to the window it is showing in at this moment: it scales up to fill a 1080p or
 * 4K screen (or a full-screen window), and down to fit a small or windowed one, following the
 * window as it is resized, maximised, put full screen or dragged to a monitor with a different pixel
 * density (every one of those changes the viewport, which is what this measures). The wrapper the
 * ref goes on has the sequence's natural size; the scale leaves a margin round it and is held
 * between 0.5 and `maxScale`. Apply it as `transform: scale(...)` on that same wrapper. */
export function useFitScale(maxScale: number): [RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el || !el.offsetWidth || !el.offsetHeight) return;
    const next = Math.min(maxScale, Math.max(0.5, Math.min((window.innerWidth - 64) / el.offsetWidth, (window.innerHeight - 64) / el.offsetHeight)));
    setScale((prev) => (Math.abs(prev - next) < 0.01 ? prev : next));
  }, [maxScale]);
  // The content can change size as it plays, so look again after every render; it is cheap and
  // only sets state when the scale actually moves.
  useLayoutEffect(measure);
  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);
  return [ref, scale];
}

/** How many characters of `text` have appeared `elapsed` ms after `startMs`, at `charMs` apiece. */
export function typedCount(text: string, elapsed: number, startMs: number, charMs: number): number {
  return Math.min(text.length, Math.max(0, Math.floor((elapsed - startMs) / charMs)));
}

function utcStamp(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

const LAMP_BY_STATE: Record<LineState, LampTone> = { ok: "online", fail: "danger", pending: "warning" };

interface LoginWindowProps {
  /** Milliseconds since the window opened. */
  t: number;
  version: string | null;
  /** The subsystem checks as they stand, in the order they ran. */
  lines: LoginLine[];
  characterName: string | null;
  pilots: LoginPilot[];
  activeId: number | null;
  esi: EsiResult | null;
  /** Kills per five minutes over the last hour, oldest first, from the local kill store. */
  bins: number[] | null;
  net: LoginNet | null;
  access: LoginAccess;
  /** The startup sequence's console sounds, or null when they are off. */
  sound: BootSound | null;
  /** True while the ship's voice is speaking, so the logo can glow with it. */
  speaking: boolean;
}

function line(lines: LoginLine[], logKey: string): LoginLine | undefined {
  return lines.find((l) => l.logKey === logKey);
}

/** The "you are logged in" screen at the end of the startup sequence: the same kind of readout as
 * the checks before it, laid out as a console session opening. Everything on it is the app's real
 * state. IDENTITY is the signed-in character, ACCESS LEVEL is whether that character's sign-in is
 * still good (the location lookup says so), SENSOR NETWORK is the kill stream, TACTICAL
 * INTELLIGENCE is the local kill store, NAVIGATION CORE is the map index, and SYSTEM HEALTH is
 * every check passing. Anything that did not pass says so and the verdict follows it. */
function LoginWindow({ t, version, lines, characterName, pilots, activeId, esi, bins, net, access, sound, speaking }: LoginWindowProps) {
  const [fitRef, fitScale] = useFitScale(3.6);
  // When the logo starts to float, work out how far it has to go to reach the middle of the screen.
  // The window is scaled to fit, so the distance is divided back into the window's own units.
  const wordmarkRef = useRef<HTMLDivElement | null>(null);
  const [floatTo, setFloatTo] = useState<{ dx: number; dy: number } | null>(null);
  useEffect(() => {
    if (t < FLOAT_AT || floatTo != null || !wordmarkRef.current) return;
    const rect = wordmarkRef.current.getBoundingClientRect();
    setFloatTo({
      dx: (window.innerWidth / 2 - (rect.left + rect.width / 2)) / fitScale,
      dy: (window.innerHeight / 2 - (rect.top + rect.height / 2)) / fitScale,
    });
  }, [t, floatTo, fitScale]);
  const outro = t >= OUTRO_AT;
  // The active pilot always comes first, so a long roster can never push them out of the list.
  const orderedPilots = [...pilots].sort((a, b) => Number(b.id === activeId) - Number(a.id === activeId));
  const shownPilots = orderedPilots.slice(0, 4);
  const morePilots = orderedPilots.length - shownPilots.length;
  const faults = lines.filter((l) => l.state === "fail").map((l) => l.logKey.toUpperCase());
  const degraded = faults.length > 0;
  const checked = lines.filter((l) => l.state !== "pending").length;

  const stream = line(lines, "Kill stream");
  const store = line(lines, "Kill store");
  const map = line(lines, "Map index");

  let accessValue = "CHECKING";
  let accessState: LineState = "pending";
  if (access.status === "none") {
    accessValue = "NO PILOT";
    accessState = "fail";
  } else if (access.status === "error") {
    accessValue = "UNVERIFIED";
    accessState = "pending";
  } else if (access.status === "done") {
    accessValue = access.needsReauth ? "RE-AUTH NEEDED" : "ACCEPTED";
    accessState = access.needsReauth ? "fail" : "ok";
  }

  const auth: { key: string; value: string; state: LineState }[] = [
    { key: "Identity", value: characterName ? "VERIFIED" : "NOT SIGNED IN", state: characterName ? "ok" : "fail" },
    { key: "Access level", value: accessValue, state: accessState },
    { key: "System health", value: degraded ? "DEGRADED" : "NOMINAL", state: degraded ? "fail" : "ok" },
    { key: "Sensor network", value: stream?.state === "ok" ? "ONLINE" : "STANDBY", state: stream?.state === "ok" ? "ok" : "pending" },
    { key: "Tactical intelligence", value: store?.state === "ok" ? "ACTIVE" : "OFFLINE", state: store?.state === "ok" ? "ok" : "fail" },
    { key: "Navigation core", value: map?.state === "ok" ? "SYNCHRONISED" : "UNAVAILABLE", state: map?.state === "ok" ? "ok" : "fail" },
  ];

  const authVisible = Math.min(AUTH_COUNT, Math.max(0, Math.floor((t - AUTH_AT) / AUTH_STEP) + 1));
  const welcome = characterName ? "WELCOME BACK, CAPSULEER." : "NO PILOT SIGNED IN.";
  const welcomeChars = typedCount(welcome, t, WELCOME_AT, WELCOME_CHAR_MS);
  const operational = t >= OPERATIONAL_AT;
  const faultText = degraded ? `${faults.length} ${faults.length === 1 ? "FAULT" : "FAULTS"} DETECTED: ${faults.join(", ")}.` : "NO CRITICAL FAULTS DETECTED.";

  // Sound: a relay and a blip for each authentication line, a key clack for each letter of the
  // welcome, and the bell and chord when the session is operational.
  const authPlayedRef = useRef(0);
  useEffect(() => {
    if (sound) for (let i = authPlayedRef.current; i < authVisible; i++) sound.authLine(sound.now() + (i - authPlayedRef.current) * 0.05);
    authPlayedRef.current = authVisible;
  }, [authVisible, sound]);
  const welcomePlayedRef = useRef(0);
  useEffect(() => {
    if (sound) for (let i = welcomePlayedRef.current; i < welcomeChars; i++) sound.key(sound.now() + (i - welcomePlayedRef.current) * 0.014);
    welcomePlayedRef.current = welcomeChars;
  }, [welcomeChars, sound]);
  useEffect(() => {
    if (operational) sound?.operational();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operational]);

  const status: { label: string; value: string; state: LineState }[] = [
    { label: "Core", value: "ONLINE", state: "ok" },
    { label: "ESI link", value: esi?.ok ? "CONNECTED" : "UNREACHABLE", state: esi?.ok ? "ok" : "fail" },
    { label: "Tranquility", value: line(lines, "Tranquility")?.state === "ok" ? "ONLINE" : "OFFLINE", state: line(lines, "Tranquility")?.state === "ok" ? "ok" : "fail" },
    { label: "Map index", value: map?.state === "ok" ? "READY" : "UNAVAILABLE", state: map?.state === "ok" ? "ok" : "fail" },
    { label: "Kill store", value: store?.state === "ok" ? "ONLINE" : "UNAVAILABLE", state: store?.state === "ok" ? "ok" : "fail" },
    { label: "Kill stream", value: stream?.state === "ok" ? "LIVE" : "STANDBY", state: stream?.state === "ok" ? "ok" : "pending" },
  ];

  const killTotal = bins ? bins.reduce((sum, n) => sum + n, 0) : null;

  /** Every block is laid out from the first frame and only revealed on its cue, so the window is
   * its final size from the start: it never grows, jumps or clips as lines arrive. */
  const rev = (on: boolean) => (on ? "login-shown" : "login-hidden");
  const nameShown = Boolean(characterName) && welcomeChars >= welcome.length;

  return (
    <div className="boot-login-fit" ref={fitRef} style={{ transform: `scale(${fitScale})` }}>
    <div className={`boot-login${outro ? " login-outro" : ""}`} aria-label="Session opened" aria-live="polite">
      <div className="login-top">
        <div className="login-log">
          <span>VΞSPER CORE {version ? `v${version}` : ""}</span>
          <span className={rev(t >= 150)}>
            SUBSYSTEMS CHECKED {checked} OF {lines.length}
          </span>
          <span className={rev(t >= 250)}>{esi?.ok ? `SECURE LINK, ESI ${esi.ms} MS` : "SECURE LINK UNAVAILABLE"}</span>
        </div>
        <div className="login-clock">
          <span>UTC {utcStamp()}</span>
          {characterName && <span>PILOT {characterName.toUpperCase()}</span>}
          {access.status === "done" && access.system && <span>SYSTEM {access.system.toUpperCase()}</span>}
          {access.status === "done" && access.ship && <span>SHIP {access.ship.toUpperCase()}</span>}
          <span className={esi?.ok ? "login-link-ok" : "login-link-down"}>LINK {esi?.ok ? "\u25CF SECURE" : "\u25A0 DOWN"}</span>
        </div>
      </div>

      <div className="login-main">
        <div
          className={`login-wordmark${speaking ? " login-speaking" : ""}`}
          ref={wordmarkRef}
          aria-label="VESPER"
          style={floatTo ? { transform: `translate(${floatTo.dx}px, ${floatTo.dy}px) scale(1.12)`, transition: `transform ${FLOAT_MS}ms cubic-bezier(0.45, 0, 0.2, 1)` } : undefined}
        >
          VΞSPER
        </div>
        <div className="login-sub">
          <span>INDUSTRIAL SYSTEMS</span>
          <span>CAPSULEER OPERATIONS DIVISION</span>
        </div>
        <div className="login-rule" />
        <div className={`login-heading ${rev(t >= HEAD_AT)}`}>AUTHENTICATION SEQUENCE COMPLETE</div>
        <div className="login-auth">
          {auth.map((row, index) => (
            <div key={row.key} className={`login-auth-row ${rev(index < authVisible)}`}>
              <StatusLamp tone={LAMP_BY_STATE[row.state]} />
              <span className="login-auth-key">{row.key}</span>
              <span className="login-auth-dots" aria-hidden="true" />
              <span className={`login-auth-val login-val-${row.state}`}>{row.value}</span>
            </div>
          ))}
        </div>
        <div className={`login-faults${degraded ? " login-faults-bad" : ""} ${rev(t >= FAULT_AT)}`}>{faultText}</div>
        <div className="login-welcome">
          <div className={rev(t >= WELCOME_AT)}>
            {welcome.slice(0, welcomeChars)}
            {welcomeChars < welcome.length && t >= WELCOME_AT && <span className="boot-caret" aria-hidden="true" />}
            <span className="boot-untyped" aria-hidden="true">
              {welcome.slice(welcomeChars)}
            </span>
          </div>
          <div className={`login-name ${rev(nameShown)}`}>{characterName ? characterName.toUpperCase() : "\u00A0"}</div>
        </div>
        <div className={`login-banner${degraded ? " login-banner-degraded" : ""} ${rev(operational)}`}>
          <span aria-hidden="true">&#10148;</span> VΞSPER // {degraded ? "DEGRADED" : "OPERATIONAL"}
        </div>
      </div>

      <div className="login-side">
        <section className={`login-panel ${rev(t >= SIDE_AT[0])}`}>
          <h3>Pilots aboard</h3>
          <div className="login-pilots">
            {pilots.length === 0 ? (
              <span className="login-muted">NONE SIGNED IN</span>
            ) : (
              <>
                {shownPilots.map((p) => (
                  <div key={p.id} className={`login-pilot${p.id === activeId ? " login-pilot-active" : ""}`}>
                    <img src={p.portraitUrl} alt="" />
                    <span>{p.name.toUpperCase()}</span>
                    {p.id === activeId && <em>ACTIVE</em>}
                  </div>
                ))}
                {morePilots > 0 && <span className="login-muted login-more">+{morePilots} MORE SIGNED IN</span>}
              </>
            )}
          </div>
        </section>
        <section className={`login-panel ${rev(t >= SIDE_AT[1])}`}>
          <h3>System status</h3>
          <div className="login-status">
            {status.map((row) => (
              <div key={row.label} className="login-status-row">
                <StatusLamp tone={LAMP_BY_STATE[row.state]} />
                <span>{row.label}</span>
                <span className="login-auth-dots" aria-hidden="true" />
                <span className={`login-val-${row.state}`}>{row.value}</span>
              </div>
            ))}
          </div>
        </section>
        <section className={`login-panel ${rev(t >= SIDE_AT[2])}`}>
          <h3>Network</h3>
          <div className="login-net">
            <div>
              <span>ESI latency</span>
              <b>{esi?.ok && esi.ms != null ? `${esi.ms} MS` : "NO ANSWER"}</b>
            </div>
            <div>
              <span>Pilots online</span>
              <b>{esi?.players != null ? esi.players.toLocaleString() : "UNKNOWN"}</b>
            </div>
            <div>
              <span>Requests sent</span>
              <b>{net ? net.sent.toLocaleString() : "..."}</b>
            </div>
            <div>
              <span>Answered / failed</span>
              <b>{net ? `${net.received.toLocaleString()} / ${net.failed.toLocaleString()}` : "..."}</b>
            </div>
          </div>
          {bins && (
            <div className="login-trace">
              <Sparkline values={bins} label="Kills per five minutes over the last hour" width={200} height={34} />
              <span>{killTotal?.toLocaleString()} KILLS, LAST HOUR</span>
            </div>
          )}
        </section>
      </div>
      <div className="login-skip">{t >= OPERATIONAL_AT ? "Entering session" : "Press any key to skip"}</div>
    </div>
    </div>
  );
}

export default LoginWindow;
