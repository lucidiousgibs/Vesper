/** Which of the seven segments (a top, b top-right, c bottom-right, d bottom,
 * e bottom-left, f top-left, g middle) are lit for each character. */
const LIT: Record<string, string> = {
  "0": "abcdef",
  "1": "bc",
  "2": "abdeg",
  "3": "abcdg",
  "4": "bcfg",
  "5": "acdfg",
  "6": "acdefg",
  "7": "abc",
  "8": "abcdefg",
  "9": "abcdfg",
  "-": "g",
  " ": "",
};

const DIGIT_W = 10;
const GAP = 2.2;
const COLON_W = 3.6;
const HEIGHT = 18;

/** A flat hexagonal bar: horizontal runs left to right, vertical top to bottom. */
function bar(cx: number, cy: number, horizontal: boolean): string {
  const half = 3.3;
  const t = 0.9;
  const pts = horizontal
    ? [[cx - half, cy], [cx - half + t, cy - t], [cx + half - t, cy - t], [cx + half, cy], [cx + half - t, cy + t], [cx - half + t, cy + t]]
    : [[cx, cy - half], [cx + t, cy - half + t], [cx + t, cy + half - t], [cx, cy + half], [cx - t, cy + half - t], [cx - t, cy - half + t]];
  return pts.map((p) => p.join(",")).join(" ");
}

const SEGMENT_SHAPES: Record<string, string> = {
  a: bar(5, 1.2, true),
  g: bar(5, 9, true),
  d: bar(5, 16.8, true),
  f: bar(1.2, 5.1, false),
  b: bar(8.8, 5.1, false),
  e: bar(1.2, 12.9, false),
  c: bar(8.8, 12.9, false),
};

interface SegmentDisplayProps {
  /** Digits, colons, dashes and spaces; anything else is drawn blank. */
  text: string;
  /** Spoken form, e.g. "EVE time 21:49:13". Defaults to the text itself. */
  label?: string;
}

/** A seven-segment readout drawn in SVG (no font to load): lit segments in the
 * accent with the deck's glow, unlit segments faintly ghosted the way a real LED
 * or vacuum-fluorescent display shows them. Colour comes from the theme through
 * `currentColor`-style CSS variables, so every deck that uses it tints it for free. */
function SegmentDisplay({ text, label }: SegmentDisplayProps) {
  let x = 0;
  const parts: React.ReactNode[] = [];
  [...text].forEach((ch, i) => {
    if (ch === ":") {
      parts.push(
        <g key={i} className="segment-display-colon" transform={`translate(${x} 0)`}>
          <circle cx={COLON_W / 2} cy={5.6} r={0.95} />
          <circle cx={COLON_W / 2} cy={12.4} r={0.95} />
        </g>,
      );
      x += COLON_W;
      return;
    }
    const lit = LIT[ch] ?? "";
    parts.push(
      <g key={i} transform={`translate(${x} 0)`}>
        {Object.entries(SEGMENT_SHAPES).map(([name, points]) => (
          <polygon key={name} points={points} className={lit.includes(name) ? "segment-display-on" : "segment-display-off"} />
        ))}
      </g>,
    );
    x += DIGIT_W + GAP;
  });
  const width = Math.max(x - GAP, 1);
  return (
    <svg
      className="segment-display"
      viewBox={`0 0 ${width} ${HEIGHT}`}
      role="img"
      aria-label={label ?? text}
      preserveAspectRatio="xMinYMid meet"
    >
      {parts}
    </svg>
  );
}

export default SegmentDisplay;
