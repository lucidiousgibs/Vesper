/** The startup sequence's console sounds: an old industrial computer coming up, all of it mechanical.
 * Everything is synthesised with the Web Audio API (oscillators and filtered noise), so there are no
 * sample files to ship or license. There is deliberately nothing melodic: no beeps, bells or chords
 * that would make it sound cheerful. The pieces:
 *   - a low, gritty mains hum with a slow tremolo and a little fan noise under the whole sequence,
 *   - key clacks, like a heavy typewriter or an old buckling-spring keyboard: a sharp strike, a
 *     body thock, a thud and a faint metal ring, varied from key to key, with a heavier space bar,
 *   - a printed line: a quick run of clacks and then a carriage return, a ratchet and a clunk,
 *   - heavy solenoid and contactor slams for the lamp bank and the stage changes,
 *   - a harsh buzzer and a slam for a check that failed, a single firm stamp for one that passed, and
 *   - a dark, hollow open fifth, low and slow, as the session goes operational.
 * Every method takes an optional start time on the audio clock (seconds); the default is "now". That
 * is what lets the same code be rendered offline to check its levels. */

export interface BootSound {
  /** The audio clock's current time, in seconds. */
  now(): number;
  /** Power-on: a heavy slam, a motor spinning up and the hum fading in. */
  start(at?: number): void;
  /** The crackle that goes with a glitch on the screen (a dip, a shake, a colour fringe or a burst of static). */
  staticCrackle(kind: "dip" | "jitter" | "fringe" | "burst", at?: number): void;
  /** One key clack. */
  key(at?: number): void;
  /** A lighter clack, for fast text. */
  printerTick(at?: number): void;
  /** One column of the lamp bank switching in. */
  lampColumn(index: number, at?: number): void;
  /** The lamp test finishing: two heavy slams, one for each flash. */
  lampTestDone(at?: number): void;
  /** A stage change: a cascade of slams and a low rumble. */
  sweep(at?: number): void;
  /** A subsystem line printing: a run of clacks and a carriage return. */
  lineIn(at?: number): void;
  /** A check answering: a firm stamp if it passed, a buzzer and a slam if it failed. */
  checkResult(ok: boolean, at?: number): void;
  /** An authentication line printing, with a stamp. */
  authLine(at?: number): void;
  /** The login window opening: a cascade, a slam and a low swell. */
  loginOpen(at?: number): void;
  /** The session going operational: a heavy slam, a carriage return and a dark drone. */
  operational(at?: number): void;
  /** The logo gliding to the middle of the screen: a servo whirr that rises and falls, and a soft stop. */
  logoFloat(at?: number): void;
  /** Fades the hum out over `ms` milliseconds, starting now or at `at`. */
  fadeOut(ms: number, at?: number): void;
  /** Silences everything at once. */
  stop(): void;
}

interface ToneOptions {
  f: number;
  /** End frequency for a glide. */
  f2?: number;
  dur: number;
  type: OscillatorType;
  gain: number;
  attack?: number;
  /** Low-pass cutoff, to soften a harsh waveform. */
  lp?: number;
}

interface NoiseOptions {
  dur: number;
  filter: BiquadFilterType;
  freq: number;
  q?: number;
  gain: number;
  attack?: number;
}

export function createBootSound(ctx: BaseAudioContext, volume: number): BootSound {
  const master = ctx.createGain();
  master.gain.value = volume;
  // A limiter on the way out, so layered sounds can never clip.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.knee.value = 6;
  limiter.ratio.value = 10;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.15;
  master.connect(limiter);
  limiter.connect(ctx.destination);

  const noiseBuffer = (() => {
    const length = Math.floor(ctx.sampleRate * 1.5);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  })();

  const when = (at?: number) => at ?? ctx.currentTime + 0.01;
  const jitter = (spread: number) => 1 + (Math.random() * 2 - 1) * spread;

  function tone(at: number, o: ToneOptions) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = o.type;
    osc.frequency.setValueAtTime(o.f, at);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, at + o.dur);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(o.gain, at + (o.attack ?? 0.004));
    gain.gain.exponentialRampToValueAtTime(0.0001, at + o.dur);
    if (o.lp) {
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = o.lp;
      osc.connect(filter);
      filter.connect(gain);
    } else {
      osc.connect(gain);
    }
    gain.connect(master);
    osc.start(at);
    osc.stop(at + o.dur + 0.05);
  }

  function noise(at: number, o: NoiseOptions) {
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = o.filter;
    filter.frequency.value = o.freq;
    filter.Q.value = o.q ?? 0.7;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(o.gain, at + (o.attack ?? 0.001));
    gain.gain.exponentialRampToValueAtTime(0.0001, at + o.dur);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    const offset = Math.random() * Math.max(0, noiseBuffer.duration - o.dur - 0.1);
    source.start(at, offset, o.dur + 0.05);
  }

  /** A key clack, the sharp, bright, metallic sound of a typebar slapping the platen or a buckling
   * spring snapping over: a hard strike, a knock, a snap of top end, two short rings of metal, a
   * rebound as the bar bounces, a small thud and the click of the key coming back up. Three voices
   * are mixed at random so no two keys sound the same. `weight` scales the whole thing. */
  function clack(at: number, weight = 1) {
    const voice = Math.floor(Math.random() * 3);
    const strikeFreq = [3300, 2700, 4300][voice] * jitter(0.18);
    const knockFreq = [1250, 980, 1500][voice] * jitter(0.2);
    noise(at, { dur: 0.005, filter: "bandpass", freq: strikeFreq, q: 2.2, gain: 0.9 * weight * jitter(0.2) });
    noise(at, { dur: 0.003, filter: "highpass", freq: 5500, gain: 0.4 * weight * jitter(0.25) });
    noise(at + 0.002, { dur: 0.018, filter: "bandpass", freq: knockFreq, q: 1.4, gain: 0.6 * weight * jitter(0.25) });
    tone(at + 0.001, { f: 2150 * jitter(0.08), dur: 0.032, type: "sine", gain: 0.07 * weight, attack: 0.001 });
    tone(at + 0.001, { f: 3650 * jitter(0.08), dur: 0.022, type: "sine", gain: 0.05 * weight, attack: 0.001 });
    tone(at, { f: 230 * jitter(0.15), f2: 110, dur: 0.025, type: "sine", gain: 0.07 * weight, attack: 0.002 });
    // The bar rebounds off the platen, and the key comes back up.
    noise(at + 0.011 + Math.random() * 0.006, { dur: 0.004, filter: "bandpass", freq: 2800, q: 2, gain: 0.3 * weight });
    noise(at + 0.07 + Math.random() * 0.02, { dur: 0.004, filter: "bandpass", freq: 3400, q: 1.5, gain: 0.17 * weight });
  }

  /** A heavy solenoid or contactor: a dull slam, a thump that falls away, and a clang of metal. */
  function slam(at: number, strength = 1, pitch = 1) {
    noise(at, { dur: 0.035, filter: "bandpass", freq: 320 * pitch, q: 0.8, gain: 0.6 * strength });
    noise(at, { dur: 0.01, filter: "bandpass", freq: 1500, q: 1.3, gain: 0.4 * strength });
    noise(at, { dur: 0.006, filter: "bandpass", freq: 2300 * pitch, q: 1.8, gain: 0.5 * strength });
    tone(at, { f: 90 * pitch, f2: 40, dur: 0.1, type: "sine", gain: 0.2 * strength, attack: 0.003 });
    tone(at + 0.004, { f: 430 * pitch, f2: 360 * pitch, dur: 0.09, type: "triangle", gain: 0.06 * strength });
  }

  /** The space bar: a lower, longer thock. */
  function spaceBar(at: number, weight = 1) {
    noise(at, { dur: 0.04, filter: "bandpass", freq: 380 * jitter(0.15), q: 0.7, gain: 0.45 * weight });
    tone(at, { f: 100, f2: 48, dur: 0.07, type: "sine", gain: 0.34 * weight, attack: 0.003 });
    noise(at, { dur: 0.005, filter: "bandpass", freq: 2400, q: 1.6, gain: 0.55 * weight });
    noise(at + 0.004, { dur: 0.012, filter: "bandpass", freq: 1100, q: 1.2, gain: 0.4 * weight });
  }

  /** A carriage return: a ratchet of quickening clicks as the carriage slides, then it hits the stop. */
  function carriageReturn(at: number, weight = 1) {
    let t = at;
    for (let i = 0; i < 13; i++) {
      noise(t, { dur: 0.004, filter: "bandpass", freq: 2300 * jitter(0.1), q: 2.4, gain: 0.4 * weight });
      t += 0.021 - i * 0.001;
    }
    noise(at, { dur: 0.18, filter: "bandpass", freq: 900, q: 0.6, gain: 0.05 * weight, attack: 0.04 });
    slam(t + 0.01, 0.55 * weight, 1.15);
  }

  /** A line printing: a quick run of clacks (with the odd space) and a carriage return after it. */
  function printLine(at: number, characters: number, weight = 1) {
    let t = at;
    for (let i = 0; i < characters; i++) {
      if (i > 0 && i % 5 === 4) spaceBar(t, weight);
      else clack(t, 0.7 * weight);
      t += 0.024 + Math.random() * 0.016;
    }
    carriageReturn(t + 0.02, weight);
  }

  /** A harsh buzzer: two flat saws a hair apart, so they grind against each other. */
  function buzzer(at: number, dur: number) {
    tone(at, { f: 98, dur, type: "sawtooth", gain: 0.13, attack: 0.01, lp: 700 });
    tone(at, { f: 104, dur, type: "sawtooth", gain: 0.11, attack: 0.01, lp: 700 });
  }

  /** A descending run of slams, quickening as it goes, with a low rumble under it. */
  function cascade(at: number, count: number) {
    let t = at;
    for (let i = 0; i < count; i++) {
      slam(t, 0.7 + (i === 0 ? 0.4 : 0), 1.15 - i * 0.07);
      t += 0.075 - i * 0.006;
    }
    tone(at, { f: 40, f2: 62, dur: 0.6, type: "sawtooth", gain: 0.05, attack: 0.15, lp: 160 });
  }

  // The hum under the sequence: low saws, a grinding second harmonic, a slow tremolo and fan noise.
  // Started by start(), faded by fadeOut(), cut by stop().
  let humStop: ((at: number, fadeSeconds: number) => void) | null = null;

  function startHum(at: number) {
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, at);
    out.gain.exponentialRampToValueAtTime(0.028, at + 2.2);
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 150;
    lowpass.Q.value = 0.9;
    const osc1 = ctx.createOscillator();
    osc1.type = "sawtooth";
    osc1.frequency.setValueAtTime(28, at);
    osc1.frequency.exponentialRampToValueAtTime(48, at + 1.8);
    const osc2 = ctx.createOscillator();
    osc2.type = "sawtooth";
    osc2.frequency.setValueAtTime(56, at);
    osc2.frequency.exponentialRampToValueAtTime(96, at + 1.8);
    osc2.detune.value = 9;
    const second = ctx.createGain();
    second.gain.value = 0.5;
    osc1.connect(lowpass);
    osc2.connect(second);
    second.connect(lowpass);
    lowpass.connect(out);
    out.connect(master);

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.19;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.004;
    lfo.connect(lfoDepth);
    lfoDepth.connect(out.gain);

    // Fan and ducting.
    const air = ctx.createBufferSource();
    air.buffer = noiseBuffer;
    air.loop = true;
    const airFilter = ctx.createBiquadFilter();
    airFilter.type = "bandpass";
    airFilter.frequency.value = 300;
    airFilter.Q.value = 0.45;
    const airGain = ctx.createGain();
    airGain.gain.setValueAtTime(0.0001, at);
    airGain.gain.exponentialRampToValueAtTime(0.012, at + 2.4);
    air.connect(airFilter);
    airFilter.connect(airGain);
    airGain.connect(master);

    for (const node of [osc1, osc2, lfo, air]) node.start(at);
    humStop = (time, fadeSeconds) => {
      // Approach silence from wherever the level is at `time`; the time constant makes the tail
      // about as long as the fade asked for.
      for (const g of [out.gain, airGain.gain]) {
        g.cancelScheduledValues(time);
        g.setTargetAtTime(0, time, fadeSeconds / 4);
      }
      for (const node of [osc1, osc2, lfo, air]) node.stop(time + fadeSeconds * 1.5 + 0.05);
    };
  }

  const api: BootSound = {
    now: () => ctx.currentTime,

    start(at) {
      const t = when(at);
      slam(t, 1.5, 0.9);
      // The tube's degauss coil: a deep whump as the picture comes up.
      tone(t, { f: 64, f2: 22, dur: 0.7, type: "sine", gain: 0.3, attack: 0.01 });
      noise(t, { dur: 0.3, filter: "lowpass", freq: 600, q: 0.5, gain: 0.3 });
      // A motor spinning up under the hum.
      tone(t + 0.1, { f: 30, f2: 90, dur: 1.2, type: "sawtooth", gain: 0.05, attack: 0.5, lp: 220 });
      startHum(t + 0.05);
    },

    staticCrackle(kind, at) {
      const t = when(at);
      const strength = kind === "burst" ? 1 : kind === "jitter" ? 0.55 : kind === "fringe" ? 0.35 : 0.2;
      noise(t, { dur: 0.05 + 0.15 * strength, filter: "highpass", freq: 1400, gain: 0.14 * strength });
      const clicks = Math.round(4 + 10 * strength);
      for (let i = 0; i < clicks; i++) {
        noise(t + Math.random() * (0.05 + 0.18 * strength), { dur: 0.004, filter: "bandpass", freq: 2500 + Math.random() * 2500, q: 1.5, gain: 0.3 * strength });
      }
      // A dip in brightness is the power sagging for an instant.
      if (kind === "dip") tone(t, { f: 90, f2: 50, dur: 0.08, type: "sine", gain: 0.12 });
    },

    key(at) {
      clack(when(at), 1.4);
    },

    printerTick(at) {
      clack(when(at), 0.8);
    },

    lampColumn(index, at) {
      const t = when(at);
      // Each column is a slightly heavier contactor than the last, with a short grind of current.
      slam(t, 0.7 + index * 0.06, 1 - index * 0.04);
      tone(t + 0.02, { f: 100, dur: 0.08, type: "sawtooth", gain: 0.04, lp: 500 });
    },

    lampTestDone(at) {
      const t = when(at);
      // The bank flashes twice; each flash gets a slam.
      slam(t, 1.2, 0.9);
      slam(t + 0.3, 1.2, 0.9);
      tone(t, { f: 100, dur: 0.5, type: "sawtooth", gain: 0.03, lp: 400 });
    },

    sweep(at) {
      cascade(when(at), 6);
    },

    lineIn(at) {
      printLine(when(at), 14, 0.9);
    },

    checkResult(ok, at) {
      const t = when(at);
      if (ok) {
        // One firm stamp.
        clack(t, 1.1);
        slam(t + 0.012, 0.35, 1.3);
      } else {
        buzzer(t, 0.4);
        slam(t + 0.02, 1.1, 0.85);
      }
    },

    authLine(at) {
      const t = when(at);
      printLine(t, 16, 1);
      slam(t + 0.5, 0.4, 1.2);
    },

    loginOpen(at) {
      const t = when(at);
      cascade(t, 7);
      slam(t + 0.5, 1.3, 0.8);
      tone(t, { f: 55, f2: 40, dur: 1.0, type: "sine", gain: 0.05, attack: 0.05 });
    },

    operational(at) {
      const t = when(at);
      slam(t, 1.6, 0.8);
      carriageReturn(t + 0.18, 1.1);
      // A hollow open fifth, low and slow: nothing in it to sound happy.
      [55, 82.4, 110].forEach((f, i) => tone(t + 0.1, { f: f * (i === 2 ? 1.003 : 1), dur: 3.2, type: "triangle", gain: 0.04, attack: 0.5, lp: 420 }));
      tone(t + 0.1, { f: 27.5, dur: 3.2, type: "sine", gain: 0.03, attack: 0.5 });
    },

    logoFloat(at) {
      const t = when(at);
      tone(t, { f: 70, f2: 150, dur: 0.75, type: "sawtooth", gain: 0.05, attack: 0.2, lp: 420 });
      tone(t + 0.75, { f: 150, f2: 62, dur: 0.75, type: "sawtooth", gain: 0.04, attack: 0.02, lp: 420 });
      noise(t, { dur: 1.4, filter: "bandpass", freq: 700, q: 0.6, gain: 0.02, attack: 0.3 });
      slam(t + 1.45, 0.5, 1.2);
    },

    fadeOut(ms, at) {
      humStop?.(at ?? ctx.currentTime, ms / 1000);
      humStop = null;
    },

    stop() {
      const t = ctx.currentTime;
      humStop?.(t, 0.05);
      humStop = null;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0, t + 0.04);
    },
  };

  return api;
}
