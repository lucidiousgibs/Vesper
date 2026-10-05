interface ProgressArcProps {
  value: number;
  max: number;
  /** What the arc measures, for assistive technology. */
  label: string;
  /** A spoken form of the value, e.g. "18 minutes of 30". */
  valueText: string;
  size?: number;
}

/** A small ring that fills clockwise: the share of `max` that `value` has reached. The
 * one place a radial display earns its keep, a single scalar in a small space (a jump
 * cooldown), where a bar would be wider than the number it carries. Premium decks only
 * (callers gate it); the value is always a real, already-computed figure. */
function ProgressArc({ value, max, label, valueText, size = 26 }: ProgressArcProps) {
  const stroke = 3;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const share = Math.min(1, Math.max(0, max > 0 ? value / max : 0));
  return (
    <svg className="progress-arc" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.min(value, max)} aria-valuetext={valueText}>
      <circle className="progress-arc-track" cx={size / 2} cy={size / 2} r={r} />
      <circle
        className="progress-arc-fill"
        cx={size / 2}
        cy={size / 2}
        r={r}
        strokeDasharray={`${circumference * share} ${circumference}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

export default ProgressArc;
