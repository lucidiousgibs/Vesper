import StatusLamp, { type LampTone } from "./StatusLamp";
import { useNow } from "../../hooks/useNow";

interface SignalLampProps {
  /** When the last real signal arrived (epoch ms). null means none yet. */
  since: number | null;
  /** The colour while the signal is healthy. */
  tone?: LampTone;
  /** How long the lamp stays at full brightness after a signal. */
  freshMs?: number;
  /** Past this age the lamp turns amber: the signal is stale, not just old. */
  staleAfterMs: number;
  shape?: "circle" | "rect";
}

/** A status lamp that fades as its data ages: full brightness right after a
 * signal, dimming steadily until it is stale, then a steady amber. Decay is
 * the useful kind of motion for intel, since "how recent" is usually the
 * question, and it costs nothing: brightness is worked out from the age on
 * each shared one-second tick, never from an animation loop. A lamp with no
 * signal yet shows the housing unlit. */
function SignalLamp({ since, tone = "online", freshMs = 10_000, staleAfterMs, shape = "circle" }: SignalLampProps) {
  const now = useNow();
  if (since == null) return <StatusLamp tone="neutral" lit={false} shape={shape} />;

  const age = Math.max(0, now - since);
  if (age >= staleAfterMs) {
    return (
      <span className="signal-lamp" style={{ opacity: 0.75 }}>
        <StatusLamp tone="warning" shape={shape} />
      </span>
    );
  }
  const decay = age <= freshMs ? 0 : (age - freshMs) / Math.max(1, staleAfterMs - freshMs);
  return (
    <span className="signal-lamp" style={{ opacity: 1 - decay * 0.65 }}>
      <StatusLamp tone={tone} shape={shape} />
    </span>
  );
}

export default SignalLamp;
