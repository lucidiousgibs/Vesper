import welcomeVoiceUrl from "../assets/sounds/data-sequenced-connected.wav";

/** The ship computer's voice for the end of the startup sequence: the line "Data sequenced,
 * connected to Vesper." as a short audio clip, played through the same audio engine as the console sounds.
 *
 * The clip is a recording rather than live speech on purpose: the app's webview has no speech
 * voices of its own, and a clip sounds the same on every machine. It was made once from a system
 * voice (Microsoft Hazel, British English) with a pause after "sequenced", then processed toward the calm,
 * warm, slightly synthetic voice of a ship's AI: a little slower and lower, some warmth and air in
 * the tone, the faintest ring-modulated edge and a doubled comb for a synthetic sheen, and a long,
 * soft room. It is not a copy of any particular game's voice. The steps are in the project notes, so
 * it can be re-made or swapped for another voice. */

let loading: Promise<AudioBuffer | null> | null = null;

/** Fetches and decodes the clip once, ahead of when it is needed. Resolves to null if it cannot. */
export function loadWelcomeVoice(ctx: BaseAudioContext): Promise<AudioBuffer | null> {
  if (!loading) {
    loading = fetch(welcomeVoiceUrl)
      .then((response) => response.arrayBuffer())
      .then((bytes) => ctx.decodeAudioData(bytes))
      .catch(() => null);
  }
  return loading;
}

export interface WelcomeVoice {
  durationMs: number;
  stop(): void;
}

/** Plays the decoded clip at `volume` (0 to 1) and returns how long it runs and a way to cut it. */
export function playWelcomeVoice(ctx: AudioContext, buffer: AudioBuffer, volume: number): WelcomeVoice {
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.value = Math.min(1, volume * 1.1);
  source.connect(gain);
  gain.connect(ctx.destination);
  source.start();
  return {
    durationMs: buffer.duration * 1000,
    stop() {
      try {
        source.stop();
      } catch {
        // Already finished.
      }
    },
  };
}
