interface SparklineProps {
  /** Oldest first. The last value gets the end dot. */
  values: number[];
  /** What the numbers are, for assistive technology, e.g. "Kills per ten minutes over the last hour". */
  label: string;
  /** Top of the scale. Defaults to the largest value, but never less than `minMax`,
   * so a gate with one stray kill does not draw as a towering spike. */
  max?: number;
  minMax?: number;
  width?: number;
  height?: number;
}

/** A tiny inline trend line: an area fill, the line, and an emphasised end point,
 * drawn in the deck's accent. Real values only; an empty or all-zero series draws
 * a flat baseline rather than inventing a shape. Premium decks only (callers gate it). */
function Sparkline({ values, label, max, minMax = 3, width = 72, height = 20 }: SparklineProps) {
  if (values.length === 0) return null;
  const top = Math.max(max ?? Math.max(...values), minMax);
  const pad = 2;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const step = values.length > 1 ? w / (values.length - 1) : 0;
  const points = values.map((v, i) => [pad + i * step, pad + h - (Math.max(0, v) / top) * h] as const);
  const line = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${pad},${pad + h} ${line} ${(pad + (values.length - 1) * step).toFixed(1)},${pad + h}`;
  const [lastX, lastY] = points[points.length - 1];
  return (
    <svg
      className="sparkline"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label={`${label}: ${values.join(", ")}, oldest to newest`}
    >
      <line className="sparkline-base" x1={pad} y1={pad + h} x2={pad + w} y2={pad + h} />
      <polygon className="sparkline-area" points={area} />
      <polyline className="sparkline-line chart-trace" points={line} pathLength={1} />
      <circle className="sparkline-end" cx={lastX} cy={lastY} r={2} />
    </svg>
  );
}

export default Sparkline;
