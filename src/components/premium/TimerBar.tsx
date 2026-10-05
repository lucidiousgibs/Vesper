import { useTheme, isPremiumTheme } from "../../hooks/useTheme";
import { useNow } from "../../hooks/useNow";
import SegmentBar from "./SegmentBar";

interface TimerBarProps {
  /** ISO timestamps for when the timed thing began and when it finishes. */
  start: string;
  end: string;
  /** What is being timed, for assistive technology, e.g. "Industry job progress". */
  label: string;
}

const SEGMENTS = 10;

function LiveTimerBar({ start, end, label }: TimerBarProps) {
  const now = useNow();
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  const total = endMs - startMs;
  if (!Number.isFinite(total) || total <= 0) return null;
  const elapsed = Math.min(total, Math.max(0, now - startMs));
  const percent = Math.floor((elapsed / total) * 100);
  return (
    <span className="timer-bar">
      <SegmentBar
        value={elapsed}
        max={total}
        bands={[{ upTo: total, tone: "progress" }]}
        segments={SEGMENTS}
        label={label}
        valueText={`${percent} percent complete`}
      />
      <span className="timer-bar-pct">{percent}%</span>
    </span>
  );
}

/** A segmented progress readout for a timer that has a real start and a real
 * end (an industry job, a PI extraction program): the elapsed share of the
 * whole, as lit cells plus a percentage. Premium decks only; renders nothing
 * under the standard themes, or when the timestamps do not describe a span,
 * so it never shows progress it cannot back up. The one-second clock is only
 * subscribed to under a premium deck. */
function TimerBar(props: TimerBarProps) {
  const [theme] = useTheme();
  if (!isPremiumTheme(theme)) return null;
  return <LiveTimerBar {...props} />;
}

export default TimerBar;
