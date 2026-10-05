import { useEffect, useRef, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { useTheme, isPremiumTheme, THEMES } from "../../hooks/useTheme";
import { useRecentActivity } from "../../hooks/useRecentActivity";
import { getKillRateBins } from "../../lib/route";
import { getCharacterLocation } from "../../lib/eve";
import { logEvent } from "../../lib/eventLog";
import { CHECK_TIMEOUT_MS, checkEsiLink, checkMapIndex, withTimeout, type CheckResult } from "../../lib/diagnostics";
import { consoleSoundEnvironment } from "../../lib/cues";
import { createBootSound, type BootSound } from "../../lib/bootSound";
import StatusLamp, { type LampTone } from "./StatusLamp";
import SegmentBar from "./SegmentBar";
import { loadWelcomeVoice, playWelcomeVoice, type WelcomeVoice } from "../../lib/bootVoice";
import { BootCrt, useCrtGlitches } from "./BootCrt";
import LoginWindow, { OUTRO_AT, FLOAT_AT, VOICE_AT, typedCount, useFitScale, type LoginAccess, type LoginNet, type LoginPilot } from "./LoginWindow";

/** Set once the first BootSequence has mounted, so the sequence plays at
 * launch only, never again because the theme was switched or the shell remounted. */
let bootConsumed = false;

/* The schedule, in milliseconds from the moment the sequence mounts. Three stages:
 *   1. Power-on test: the title and subtitle type on, then a bank of annunciator plates sweeps on
 *      one column at a time, one column for each state a lamp can show, and the whole bank flashes
 *      twice, the way an annunciator panel is tested.
 *   2. Subsystems: one line at a time. Each line starts its real check at the moment it appears,
 *      so a line that says "Checking" is genuinely waiting on something.
 *   3. Login: once every check has answered, the terminal gives way to the session window (see
 *      LoginWindow), which reads out the authentication result, welcomes the pilot back, holds,
 *      and fades out.
 * Then the ending: the final screen holds for four seconds, everything but the logo fades out, the logo
 * floats to the middle of the screen, the ship's voice says "Data sequenced, connected to Vesper", and the sequence fades
 * out as the app fades in. The whole thing is drawn as the screen of an old CRT (see BootCrt). It runs about
 * twenty-five seconds, and any key or click skips it. */
const TITLE_CHAR_MS = 110;
const SUB_START_MS = 700;
const SUB_CHAR_MS = 36;
const LAMP_START_MS = 1700;
/** One column of the bank lights per step; the plates in a column follow each other by a beat. */
const LAMP_STEP_MS = 380;
const BANK_ROW_STAGGER_MS = 70;
const LAMP_ALL_MS = 3800;
const LINES_START_MS = 4300;
const LINE_INTERVAL_MS = 360;
/** The login window never opens before this, even when every check was quick. */
const FINAL_MS = 7600;
/** The CRT takes this long to come up (a bright line opening out to the full picture) before the
 * sequence's clock starts. */
const POWER_ON_MS = 800;

/** How long the whole sequence takes to fade out, and the app to fade in behind it. */
const FADE_MS = 1100;
/** A beat of silence after the voice before the fade, and how long the voice's slot lasts if it is silent. */
const VOICE_TAIL_MS = 600;
const SILENT_VOICE_MS = 1200;
/** A hard stop, even if a check is still waiting on the network. */
const MAX_SHOW_MS = 45000;

const STAGE_NAMES = ["Power-on test", "Subsystems", "Login"];

type CheckState = "pending" | "ok" | "fail";

/** Each deck has its own vocabulary for the same real checks. Only the words change:
 * every line is still the live ESI request, the signed-in character, the systems lookup and
 * the kill stream, and a failing check still says so. */
interface BootVocab {
  sub: string;
  core: string;
  esi: string;
  tranquility: string;
  character: string;
  pilots: string;
  map: string;
  store: string;
  stream: string;
  deck: string;
}

const BASE_VOCAB: BootVocab = {
  sub: "Capsuleer operations system",
  core: "Core",
  esi: "ESI link",
  tranquility: "Tranquility",
  character: "Character",
  pilots: "Pilots",
  map: "Map index",
  store: "Kill store",
  stream: "Kill stream",
  deck: "Deck",
};

const DECK_VOCAB: Record<string, Partial<BootVocab>> = {
  tactical: { sub: "Tactical network", core: "Tac net", esi: "Data link", character: "Operator", map: "Nav index", stream: "Contact feed" },
  "amber-command": { sub: "Console ready", core: "Console", esi: "Uplink", character: "Pilot", map: "Chart tape", stream: "Telemetry" },
  cybernetic: { sub: "Diagnostic suite", core: "Neural core", esi: "Network", character: "Host", map: "Index", stream: "Signal feed" },
  "mecha-alert": { sub: "Command centre", core: "Command", esi: "Comms", character: "Pilot", map: "Sector map", stream: "Alert feed" },
  "deep-space": { sub: "Night watch", core: "Systems", esi: "Link", character: "Watch officer", map: "Charts", stream: "Sensors" },
  "cyber-neon": { sub: "Jacking in", core: "Deck", esi: "Net", character: "Handle", map: "Grid map", stream: "Feed" },
  "corporate-future": { sub: "Faction link", core: "Core services", esi: "Network", character: "Account", map: "Directory", stream: "Updates" },
  biotech: { sub: "Culture check", core: "Culture", esi: "Link", character: "Host", map: "Growth map", stream: "Pulse" },
  "mecha-90": { sub: "Cockpit systems", core: "Reactor", esi: "Data link", character: "Pilot", map: "Terrain map", stream: "Radar feed" },
  "white-phosphor": { sub: "tty1", core: "kernel", esi: "net0", character: "user", map: "index", stream: "stream" },
  "cassette-deck": { sub: "Tape loaded", core: "Transport", esi: "Line in", character: "Operator", map: "Index tape", stream: "Feed tape" },
  "phosphor-green": { sub: "Terminal ready", core: "Kernel", esi: "Link", character: "User", map: "Index", stream: "Feed" },
  holographic: { sub: "Optics online", core: "Optics", esi: "Link", character: "Pilot", map: "Chart", stream: "Feed" },
};

/** One column of the lamp bank for each state a lamp can show, with the word the app pairs with it. */
const LAMP_TEST_TONES: LampTone[] = ["online", "attention", "warning", "danger", "neutral"];
const LAMP_TEST_CAPTIONS = ["Online", "Attention", "Warning", "Danger", "OK"];
const BANK_ROWS = 4;

interface BootLine {
  key: string;
  /** The canonical name for the system log, whatever the deck calls it on screen. */
  logKey: string;
  value: string;
  state: CheckState;
}

const LINE_COUNT = 9;
const LAMP_BY_STATE: Record<CheckState, LampTone> = { ok: "online", fail: "danger", pending: "warning" };

type EsiResult = Awaited<ReturnType<typeof checkEsiLink>>;

/** Calls `onIncrease(from, to)` whenever `count` goes up while `active`, so each thing that appears
 * on screen can make its own sound. It forgets its place whenever it goes inactive, so nothing
 * carries over. */
function useCountEffect(count: number, active: boolean, onIncrease: (from: number, to: number) => void) {
  const previous = useRef(0);
  useEffect(() => {
    if (!active) {
      previous.current = 0;
      return;
    }
    if (count > previous.current) onIncrease(previous.current, count);
    previous.current = count;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, active]);
}

/** A staged startup sequence, shown once per launch under a premium deck at Motion Full.
 * Every line is a real check, and each one runs when its line appears: the ESI link is a live
 * status request (with its real round trip), Tranquility's player count comes back on that same
 * request, the map index is a lookup against the local systems cache, the kill store is a read of
 * the local kill history, the character and pilots are the signed-in session, the kill stream is
 * whether it has polled yet. A check that fails says so; the sequence is never allowed to report
 * success it did not get. */
function BootSequence({ characterName, pilots, activeId }: { characterName: string | null; pilots: LoginPilot[]; activeId: number | null }) {
  const pilotCount = pilots.length;
  const [theme] = useTheme();
  const { lastPolledAt } = useRecentActivity();
  // Decided once, at first mount: premium, and Motion at Full.
  const [show, setShow] = useState(
    () => !bootConsumed && isPremiumTheme(theme) && document.documentElement.dataset.fxMotion === "full",
  );
  const [elapsed, setElapsed] = useState(0);
  const [closing, setClosing] = useState(false);
  const [loginAt, setLoginAt] = useState<number | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const [esi, setEsi] = useState<EsiResult | null>(null);
  const [map, setMap] = useState<CheckResult | null>(null);
  const [store, setStore] = useState<{ ok: boolean; kills: number; bins: number[] | null } | null>(null);
  const [access, setAccess] = useState<LoginAccess>({ status: activeId == null ? "none" : "pending" });
  const [net, setNet] = useState<LoginNet | null>(null);
  const [voiceWindow, setVoiceWindow] = useState<{ from: number; to: number } | null>(null);
  const voiceBufferRef = useRef<AudioBuffer | null>(null);
  const voiceRef = useRef<WelcomeVoice | null>(null);
  const startRef = useRef(performance.now());
  const startedRef = useRef<Set<string>>(new Set());
  const aliveRef = useRef(true);
  const finishedRef = useRef(false);
  const soundRef = useRef<BootSound | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const burst = useCrtGlitches(overlayRef, show, (kind) => soundRef.current?.staticCrackle(kind));
  const [termFitRef, termScale] = useFitScale(3);

  useEffect(() => {
    bootConsumed = true;
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const vocab: BootVocab = { ...BASE_VOCAB, ...(DECK_VOCAB[theme] ?? {}) };
  const deckLabel = THEMES.find((t) => t.id === theme)?.label ?? theme;

  // What is on screen at this moment, all of it a function of the clock.
  const visible = Math.min(LINE_COUNT, Math.max(0, Math.floor((elapsed - LINES_START_MS) / LINE_INTERVAL_MS) + 1));
  const columnsLit = elapsed < LAMP_START_MS ? 0 : Math.min(LAMP_TEST_TONES.length, Math.floor((elapsed - LAMP_START_MS) / LAMP_STEP_MS) + 1);
  const lampBankFlash = elapsed >= LAMP_ALL_MS;
  const stage = elapsed >= LINES_START_MS ? 2 : 1;
  const progress = Math.min(0.97, elapsed / FINAL_MS);
  const titleText = "VΞSPER";
  const titleChars = typedCount(titleText, elapsed, 0, TITLE_CHAR_MS);
  const subChars = typedCount(vocab.sub, elapsed, SUB_START_MS, SUB_CHAR_MS);

  const lines: BootLine[] = [
    { key: vocab.core, logKey: "Core", value: version ? `Online, v${version}` : "Online", state: "ok" },
    {
      key: vocab.esi,
      logKey: "ESI link",
      value: !esi ? "Checking" : esi.ok ? `Connected, ${esi.ms} ms` : "Unreachable",
      state: !esi ? "pending" : esi.ok ? "ok" : "fail",
    },
    {
      key: vocab.tranquility,
      logKey: "Tranquility",
      value: !esi
        ? "Checking"
        : !esi.ok
          ? "Unknown"
          : esi.serverOnline === false
            ? "Offline"
            : esi.players != null
              ? `${esi.players.toLocaleString()} pilots online`
              : "Online",
      state: !esi ? "pending" : esi.ok && esi.serverOnline !== false ? "ok" : "fail",
    },
    { key: vocab.character, logKey: "Character", value: characterName ? characterName.toUpperCase() : "None", state: characterName ? "ok" : "fail" },
    { key: vocab.pilots, logKey: "Pilots", value: pilotCount > 0 ? `${pilotCount} signed in` : "None", state: pilotCount > 0 ? "ok" : "fail" },
    {
      key: vocab.map,
      logKey: "Map index",
      value: !map ? "Checking" : map.ok ? "Ready" : "Unavailable",
      state: !map ? "pending" : map.ok ? "ok" : "fail",
    },
    {
      key: vocab.store,
      logKey: "Kill store",
      value: !store ? "Checking" : store.ok ? `${store.kills.toLocaleString()} kills, last hour` : "Unavailable",
      state: !store ? "pending" : store.ok ? "ok" : "fail",
    },
    { key: vocab.stream, logKey: "Kill stream", value: lastPolledAt ? "Live" : "Waiting", state: lastPolledAt ? "ok" : "pending" },
    { key: vocab.deck, logKey: "Deck", value: deckLabel, state: "ok" },
  ];
  // The timers below were created in earlier renders; this ref lets them log the
  // state the pilot actually saw on screen when the sequence ended.
  const latestLinesRef = useRef(lines);
  latestLinesRef.current = lines;

  function finish() {
    if (finishedRef.current) return;
    finishedRef.current = true;
    voiceRef.current?.stop();
    voiceRef.current = null;
    delete document.documentElement.dataset.bootFade;
    setShow(false);
    const final = latestLinesRef.current;
    const summary = final.map((l) => `${l.logKey.toLowerCase()} ${l.value.toLowerCase()}`).join(", ");
    logEvent(final.some((l) => l.state === "fail") ? "warn" : "info", "SYS", `Startup check: ${summary}`);
  }

  // One clock drives everything on screen.
  useEffect(() => {
    if (!show) return;
    // The clock starts after the power-on, so it reads negative while the picture is coming up.
    startRef.current = performance.now() + POWER_ON_MS;
    const timer = window.setInterval(() => setElapsed(performance.now() - startRef.current), 40);
    return () => window.clearInterval(timer);
  }, [show]);

  // The console sounds for this run: made when the sequence starts, cut when it ends.
  useEffect(() => {
    if (!show) return;
    const env = consoleSoundEnvironment();
    const sound = env ? createBootSound(env.ctx, env.volume) : null;
    soundRef.current = sound;
    sound?.start();
    // The ship's voice is fetched and decoded now, so it is ready the moment it is needed.
    if (env) loadWelcomeVoice(env.ctx).then((buffer) => (voiceBufferRef.current = buffer));
    return () => {
      sound?.stop();
      voiceRef.current?.stop();
      if (soundRef.current === sound) soundRef.current = null;
    };
  }, [show]);

  useEffect(() => {
    if (!show) return;
    getVersion()
      .then((v) => aliveRef.current && setVersion(v))
      .catch(() => undefined);
  }, [show]);

  // Each real check starts when its line appears.
  useEffect(() => {
    if (!show) return;
    const begin = (id: string, lineNumber: number, run: () => void) => {
      if (visible >= lineNumber && !startedRef.current.has(id)) {
        startedRef.current.add(id);
        run();
      }
    };
    begin("esi", 2, () => {
      checkEsiLink().then((r) => aliveRef.current && setEsi(r));
    });
    begin("map", 6, () => {
      checkMapIndex().then((r) => aliveRef.current && setMap(r));
    });
    begin("store", 7, () => {
      withTimeout(getKillRateBins(), CHECK_TIMEOUT_MS)
        .then((bins) => aliveRef.current && setStore({ ok: true, kills: bins.reduce((sum, n) => sum + n, 0), bins }))
        .catch(() => aliveRef.current && setStore({ ok: false, kills: 0, bins: null }));
    });
    // Whether the active pilot's sign-in is still good: the location lookup says so, and it also
    // tells the login window which system and ship the pilot is in.
    begin("access", 5, () => {
      if (activeId == null) return;
      withTimeout(getCharacterLocation(activeId), 3000)
        .then((loc) => aliveRef.current && setAccess({ status: "done", needsReauth: loc.needs_reauth, system: loc.solar_system_name, ship: loc.ship_type_name }))
        .catch(() => aliveRef.current && setAccess({ status: "error" }));
    });
  }, [show, visible]);

  // The login window opens once every line is out, every check has answered and the schedule has
  // run its course. It holds, and then the whole sequence fades out.
  useEffect(() => {
    if (!show || loginAt != null) return;
    if (elapsed >= FINAL_MS && visible >= LINE_COUNT && esi && map && store && access.status !== "pending") setLoginAt(elapsed);
  }, [show, elapsed, visible, esi, map, store, access, loginAt]);

  // The request counters are read as the window opens, so they include every check above.
  useEffect(() => {
    if (loginAt == null) return;
    invoke<LoginNet>("get_net_stats")
      .then((n) => aliveRef.current && setNet(n))
      .catch(() => undefined);
  }, [loginAt]);

  // The ending, after the final screen has held: everything but the logo fades, the logo floats to the
  // middle, and the ship's voice speaks as it arrives. The sequence closes once it has finished.
  const sinceLogin = loginAt == null ? -1 : elapsed - loginAt;
  const outroOn = sinceLogin >= OUTRO_AT;
  const floatOn = sinceLogin >= FLOAT_AT;
  useEffect(() => {
    if (!show || loginAt == null || voiceWindow != null || sinceLogin < VOICE_AT) return;
    const env = consoleSoundEnvironment();
    const buffer = voiceBufferRef.current;
    if (env && buffer) {
      voiceRef.current = playWelcomeVoice(env.ctx, buffer, env.volume);
      setVoiceWindow({ from: elapsed, to: elapsed + voiceRef.current.durationMs });
    } else {
      // Sound is off or the clip is not ready: keep the same pacing, in silence.
      setVoiceWindow({ from: elapsed, to: elapsed + SILENT_VOICE_MS });
    }
  }, [show, loginAt, voiceWindow, sinceLogin, elapsed]);
  const speaking = voiceWindow != null && elapsed < voiceWindow.to;

  useEffect(() => {
    if (!show) return;
    if (!closing && voiceWindow != null && elapsed >= voiceWindow.to + VOICE_TAIL_MS) setClosing(true);
    if (elapsed >= MAX_SHOW_MS) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, elapsed, voiceWindow, closing]);

  useEffect(() => {
    if (!closing) return;
    const timer = window.setTimeout(finish, FADE_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closing]);

  // Sound: one event for each thing that appears. The login window makes its own.
  useCountEffect(titleChars, show, (from, to) => {
    const sound = soundRef.current;
    for (let i = from; i < to; i++) sound?.key(sound.now() + (i - from) * 0.014);
  });
  useCountEffect(subChars, show, (from, to) => {
    const sound = soundRef.current;
    for (let i = from; i < to; i++) sound?.printerTick(sound.now() + (i - from) * 0.012);
  });
  useCountEffect(columnsLit, show, (from, to) => {
    for (let i = from; i < to; i++) soundRef.current?.lampColumn(i);
  });
  useCountEffect(visible, show, (from, to) => {
    const sound = soundRef.current;
    for (let i = from; i < to; i++) sound?.lineIn(sound.now() + (i - from) * 0.06);
  });
  useEffect(() => {
    if (show && lampBankFlash) soundRef.current?.lampTestDone();
  }, [show, lampBankFlash]);
  useEffect(() => {
    if (show && stage === 2) soundRef.current?.sweep();
  }, [show, stage]);
  // A blast of static at each change between stages.
  useEffect(() => {
    if (show && (stage === 2 || loginAt != null)) burst();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, stage, loginAt != null]);
  // A check that has answered makes a pass or a fail sound as its line resolves.
  useEffect(() => {
    if (show && esi) soundRef.current?.checkResult(esi.ok);
  }, [show, esi]);
  useEffect(() => {
    if (show && map) soundRef.current?.checkResult(map.ok);
  }, [show, map]);
  useEffect(() => {
    if (show && store) soundRef.current?.checkResult(store.ok);
  }, [show, store]);
  useEffect(() => {
    if (show && (access.status === "done" || access.status === "error")) {
      soundRef.current?.checkResult(access.status === "done" && !access.needsReauth);
    }
  }, [show, access]);
  useEffect(() => {
    if (show && loginAt != null) soundRef.current?.loginOpen();
  }, [show, loginAt]);
  useEffect(() => {
    if (outroOn) soundRef.current?.fadeOut(1400);
  }, [outroOn]);
  useEffect(() => {
    if (floatOn) soundRef.current?.logoFloat();
  }, [floatOn]);
  // The app behind fades in as the sequence fades out (the stylesheet reads this).
  useEffect(() => {
    if (closing) document.documentElement.dataset.bootFade = "in";
  }, [closing]);

  // Skip on any key.
  useEffect(() => {
    if (!show) return;
    const onKey = () => finish();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  if (!show) return null;

  const versionText = version ? ` // v${version}` : "";
  const subText = vocab.sub;
  const titleDone = titleChars >= titleText.length;
  const subDone = subChars >= subText.length;

  return (
    <div
      ref={overlayRef}
      className={`boot-overlay${closing ? " boot-closing" : ""}`}
      role="dialog"
      aria-label="Starting VESPER"
      onMouseDown={finish}
    >
      <div className="crt-screen">
      {loginAt != null ? (
        <LoginWindow
          t={elapsed - loginAt}
          version={version}
          lines={lines}
          characterName={characterName}
          pilots={pilots}
          activeId={activeId}
          esi={esi}
          bins={store?.bins ?? null}
          net={net}
          access={access}
          sound={soundRef.current}
          speaking={speaking}
        />
      ) : (
      <div className="boot-term-fit" ref={termFitRef} style={{ transform: `scale(${termScale})` }}>
      <div className="boot-term">
        <div className="boot-title" aria-label="VESPER">
          {titleText.slice(0, titleChars)}
          {!titleDone && <span className="boot-caret" aria-hidden="true" />}
          <span className="boot-untyped" aria-hidden="true">{titleText.slice(titleChars)}</span>
        </div>
        <div className="boot-sub" aria-label={`${subText}${versionText}`}>
          {subText.slice(0, subChars)}
          {titleDone && !subDone && <span className="boot-caret" aria-hidden="true" />}
          <span className="boot-untyped" aria-hidden="true">{subText.slice(subChars)}</span>
          {subDone && versionText}
        </div>
        <div className="boot-stage" aria-live="polite">
          <span>
            Stage {stage} of {STAGE_NAMES.length}
          </span>
          <span>{STAGE_NAMES[stage - 1]}</span>
        </div>
        <div className="boot-progress">
          <SegmentBar
            value={progress * 100}
            max={100}
            bands={[{ upTo: 100, tone: "progress" }]}
            segments={36}
            label="Startup progress"
            valueText={`${Math.round(progress * 100)} percent, stage ${stage} of ${STAGE_NAMES.length}`}
          />
        </div>
        <div className="boot-panel">
          {stage === 1 ? (
            <div className={`boot-bank${lampBankFlash ? " boot-bank-flash" : ""}`} aria-hidden="true">
              <div className="boot-bank-label">{lampBankFlash ? "Lamp test complete" : "Lamp test"}</div>
              <div className="boot-bank-grid">
                {LAMP_TEST_TONES.map((tone, col) => (
                  <div key={tone} className="boot-bank-col">
                    {Array.from({ length: BANK_ROWS }, (_, row) => (
                      <StatusLamp
                        key={row}
                        tone={tone}
                        shape="rect"
                        lit={elapsed >= LAMP_START_MS + col * LAMP_STEP_MS + row * BANK_ROW_STAGGER_MS}
                        className="boot-bank-lamp"
                      />
                    ))}
                    <span className={`boot-bank-caption${col < columnsLit ? " boot-bank-caption-lit" : ""}`}>{LAMP_TEST_CAPTIONS[col]}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="boot-lines" aria-live="polite">
              {lines.slice(0, visible).map((l) => (
                <div key={l.logKey} className="boot-line">
                  <StatusLamp tone={LAMP_BY_STATE[l.state]} />
                  <span className="boot-key">{l.key}</span>
                  <span className="boot-dots" aria-hidden="true" />
                  <span className={`boot-val boot-val-${l.state}`}>{l.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="boot-skip">Press any key to skip</div>
      </div>
      </div>
      )}
      </div>
      <BootCrt />
    </div>
  );
}

export default BootSequence;
