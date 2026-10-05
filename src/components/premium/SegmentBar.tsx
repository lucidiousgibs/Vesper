/** Shared building blocks for showing "how much, and how bad" the way an
 * instrument panel does: a row of discrete cells with the danger zones marked
 * on the scale, instead of a dial. Used under premium decks only. */

export type SegmentTone = "ok" | "caution" | "critical";

/** A bar's cells can also take the neutral accent "progress" tone, for a bar
 * that measures completion rather than danger (see TimerBar). It has no
 * ThreatState: a threat word and glyph only make sense for the three above. */
export type BarTone = SegmentTone | "progress";

export interface SegmentBand {
  /** A cell whose position on the scale is at or below this belongs to the band. */
  upTo: number;
  tone: BarTone;
}

interface SegmentBarProps {
  value: number;
  max: number;
  /** Ascending. Positions above the last band take the last band's tone. */
  bands: SegmentBand[];
  segments?: number;
  /** What the bar measures, for assistive technology. */
  label: string;
  /** A spoken form of the value, e.g. "7 kills, high activity". */
  valueText?: string;
  /** Hatches the lit cells to say "thin data, treat with care". */
  hatched?: boolean;
}

function toneAt(position: number, bands: SegmentBand[]): BarTone {
  for (const band of bands) if (position <= band.upTo) return band.tone;
  return bands[bands.length - 1]?.tone ?? "ok";
}

/** A segmented bar with its thresholds visible: unlit cells are faintly tinted
 * with the zone they sit in, lit cells take the zone's full colour. Zone is
 * never the only cue; pair it with ThreatState's glyph and word. */
function SegmentBar({ value, max, bands, segments = 12, label, valueText, hatched = false }: SegmentBarProps) {
  const lit = value <= 0 ? 0 : Math.min(segments, Math.max(1, Math.ceil((value / max) * segments)));
  const cells = [];
  for (let i = 0; i < segments; i++) {
    const tone = toneAt(((i + 1) / segments) * max, bands);
    cells.push(<i key={i} className={`segment-bar-seg segment-bar-seg-${tone}${i < lit ? " segment-bar-seg-lit" : ""}`} />);
  }
  return (
    <span
      className={`segment-bar${hatched ? " segment-bar-hatched" : ""}`}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
      aria-valuetext={valueText}
    >
      {cells}
    </span>
  );
}

const GLYPH: Record<SegmentTone, string> = { ok: "●", caution: "▲", critical: "■" };

/** A shape and a word for a state, so colour never carries the meaning alone:
 * a circle, a triangle or a square, plus the text. */
export function ThreatState({ tone, text }: { tone: SegmentTone; text: string }) {
  return (
    <span className={`threat-state threat-state-${tone}`}>
      <span aria-hidden="true">{GLYPH[tone]}</span> {text}
    </span>
  );
}

export default SegmentBar;
