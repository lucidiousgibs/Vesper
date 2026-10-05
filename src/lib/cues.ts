/** Short synthesised interface cues for the premium decks. Built from
 * oscillators with the Web Audio API, so there are no sample files to ship or
 * license, and each is a fraction of a second long.
 *
 * Which cues are audible follows the Sound setting (Settings > Display >
 * Effects), stamped on <html> as data-fx-sound by useEffects:
 *   Off     - silent.
 *   Minimal - only the cues that mean something needs attention (a fault, a
 *             risky route).
 *   Full    - every cue, including confirmations, target lock and startup.
 * Cues only play under a premium deck. The proximity alert and notification
 * ping keep their own sounds and settings; no cue duplicates them. */

export type CueId = "confirm" | "panel" | "lock" | "warn" | "scan" | "route" | "kill" | "camp";

interface Note {
  /** Start frequency in Hz. */
  f: number;
  /** End frequency for a sweep. */
  f2?: number;
  /** Start offset in seconds. */
  t: number;
  /** Duration in seconds. */
  d: number;
  type: OscillatorType;
  /** Peak gain. */
  g: number;
  /** Low-pass cutoff in Hz, to soften a harsh waveform. */
  lp?: number;
}

interface Cue {
  level: "minimal" | "full";
  notes: Note[];
}

const CUES: Record<CueId, Cue> = {
  confirm: { level: "full", notes: [{ f: 880, t: 0, d: 0.06, type: "sine", g: 0.07 }, { f: 1320, t: 0.06, d: 0.08, type: "sine", g: 0.07 }] },
  panel: { level: "full", notes: [{ f: 420, f2: 720, t: 0, d: 0.09, type: "sine", g: 0.05 }] },
  lock: {
    level: "full",
    notes: [
      { f: 1800, t: 0, d: 0.03, type: "square", g: 0.03 },
      { f: 1800, t: 0.07, d: 0.03, type: "square", g: 0.03 },
      { f: 1800, t: 0.14, d: 0.03, type: "square", g: 0.03 },
      { f: 1200, t: 0.21, d: 0.12, type: "sine", g: 0.06 },
    ],
  },
  warn: {
    level: "minimal",
    notes: [
      { f: 740, t: 0, d: 0.12, type: "triangle", g: 0.1 },
      { f: 520, t: 0.14, d: 0.12, type: "triangle", g: 0.1 },
      { f: 740, t: 0.3, d: 0.12, type: "triangle", g: 0.1 },
      { f: 520, t: 0.44, d: 0.12, type: "triangle", g: 0.1 },
    ],
  },
  scan: {
    level: "full",
    notes: [
      { f: 523, t: 0, d: 0.08, type: "sine", g: 0.06 },
      { f: 659, t: 0.08, d: 0.08, type: "sine", g: 0.06 },
      { f: 784, t: 0.16, d: 0.14, type: "sine", g: 0.06 },
    ],
  },
  route: {
    level: "minimal",
    notes: [
      { f: 330, t: 0, d: 0.15, type: "sawtooth", g: 0.05, lp: 800 },
      { f: 330, t: 0.22, d: 0.15, type: "sawtooth", g: 0.05, lp: 800 },
    ],
  },
  // A low thud with a click on top: a tracked pilot, corp or alliance just appeared on a killmail.
  kill: {
    level: "minimal",
    notes: [
      { f: 150, f2: 70, t: 0, d: 0.2, type: "sine", g: 0.16 },
      { f: 2200, t: 0, d: 0.012, type: "square", g: 0.04 },
    ],
  },
  // A falling three-note figure over a held low tone: a tracked gate just crossed the camp line.
  camp: {
    level: "minimal",
    notes: [
      { f: 880, t: 0, d: 0.12, type: "sine", g: 0.09 },
      { f: 659, t: 0.12, d: 0.12, type: "sine", g: 0.09 },
      { f: 494, t: 0.24, d: 0.16, type: "sine", g: 0.09 },
      { f: 110, t: 0, d: 0.4, type: "sine", g: 0.08 },
    ],
  },
};

/** Per-deck sound packs. Every deck plays the same eight cues (so a sound always means the
 * same thing), but each one voices them differently: a waveform, a pitch shift and a tempo.
 * Terminal decks are square-wave beeps, hardware decks are low and heavy, glass decks are
 * soft and high, the neon deck is quick and bright. Decks not listed play the cues as written. */
interface SoundPack {
  type?: OscillatorType;
  /** Multiplies every frequency. */
  pitch: number;
  /** Multiplies every start offset and duration (above 1 is slower). */
  tempo: number;
}

const TERMINAL: SoundPack = { type: "square", pitch: 0.9, tempo: 1 };
const HEAVY: SoundPack = { type: "triangle", pitch: 0.75, tempo: 1.15 };
const SOFT: SoundPack = { type: "sine", pitch: 1.1, tempo: 1.2 };

const SOUND_PACKS: Record<string, SoundPack> = {
  "phosphor-green": TERMINAL,
  "amber-command": TERMINAL,
  "white-phosphor": TERMINAL,
  bulkhead: HEAVY,
  "cassette-deck": HEAVY,
  "mecha-90": HEAVY,
  tactical: HEAVY,
  holographic: SOFT,
  "deep-space": { ...SOFT, pitch: 0.95, tempo: 1.35 },
  "corporate-future": SOFT,
  "cold-ballast": { type: "sine", pitch: 1, tempo: 1.05 },
  biotech: { type: "sine", pitch: 0.8, tempo: 1.3 },
  "cyber-neon": { pitch: 1.25, tempo: 0.8 },
  cybernetic: { pitch: 1.15, tempo: 0.9 },
  "mecha-alert": { type: "square", pitch: 1, tempo: 0.85 },
};

const VOLUME_KEY = "vesper.notificationCenter.soundVolume";

/** The same cue never plays twice inside this window, so a burst of events (a fight
 * with many tracked kills) is one sound, not a stack of them. */
const MIN_GAP_MS = 1200;
const lastPlayedAt = new Map<CueId, number>();

let context: AudioContext | null = null;

function getContext(): AudioContext | null {
  try {
    if (!context) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      context = new Ctor();
    }
    // Browsers keep audio suspended until the user has interacted; resuming is a no-op afterwards.
    if (context.state === "suspended") void context.resume();
    return context;
  } catch {
    return null;
  }
}

/** The user's existing notification volume (0 to 1), so cues follow the one
 * slider people already have instead of adding another. */
function cueVolume(): number {
  try {
    const raw = localStorage.getItem(VOLUME_KEY);
    const value = raw === null ? 0.5 : JSON.parse(raw);
    return typeof value === "number" ? Math.min(1, Math.max(0, value)) : 0.5;
  } catch {
    return 0.5;
  }
}

/** Plays a cue if the Sound setting allows it. `force` plays it regardless of
 * the setting, for the "test" button; it still needs audio to be available. */
export function playCue(id: CueId, options?: { force?: boolean }): void {
  const cue = CUES[id];
  if (!options?.force) {
    const root = document.documentElement;
    if (root.dataset.tier !== "premium") return;
    const level = root.dataset.fxSound ?? "off";
    if (level === "off") return;
    if (level === "minimal" && cue.level !== "minimal") return;
  }
  const nowMs = Date.now();
  if (!options?.force && nowMs - (lastPlayedAt.get(id) ?? 0) < MIN_GAP_MS) return;
  const audio = getContext();
  if (!audio) return;
  lastPlayedAt.set(id, nowMs);

  const start = audio.currentTime + 0.02;
  const master = audio.createGain();
  master.gain.value = Math.min(1, cueVolume() * 1.6);
  master.connect(audio.destination);

  const pack = SOUND_PACKS[document.documentElement.dataset.theme ?? ""];
  for (const raw of cue.notes) {
    // A pack re-voices the note; the cue keeps its shape and meaning.
    const note: Note = pack
      ? { ...raw, f: raw.f * pack.pitch, f2: raw.f2 ? raw.f2 * pack.pitch : undefined, t: raw.t * pack.tempo, d: raw.d * pack.tempo, type: raw.lp ? raw.type : (pack.type ?? raw.type) }
      : raw;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = note.type;
    osc.frequency.setValueAtTime(note.f, start + note.t);
    if (note.f2) osc.frequency.exponentialRampToValueAtTime(note.f2, start + note.t + note.d);
    // A short attack and decay so no note clicks.
    gain.gain.setValueAtTime(0.0001, start + note.t);
    gain.gain.exponentialRampToValueAtTime(note.g, start + note.t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + note.t + note.d);
    if (note.lp) {
      const filter = audio.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = note.lp;
      osc.connect(filter);
      filter.connect(gain);
    } else {
      osc.connect(gain);
    }
    gain.connect(master);
    osc.start(start + note.t);
    osc.stop(start + note.t + note.d + 0.05);
  }
}

/** What the startup sequence's console sounds need: the shared audio context and the volume to play
 * them at, or null when they should be silent (Sound set to Off, a standard theme, or no audio
 * available). Unlike the interface cues, they play at Minimal as well as Full, because the startup
 * sequence is a feature in its own right; Off silences them. */
export function consoleSoundEnvironment(): { ctx: AudioContext; volume: number } | null {
  const root = document.documentElement;
  if (root.dataset.tier !== "premium") return null;
  if ((root.dataset.fxSound ?? "off") === "off") return null;
  const ctx = getContext();
  if (!ctx) return null;
  return { ctx, volume: Math.min(1, cueVolume() * 1.6) };
}
