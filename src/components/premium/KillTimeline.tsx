import { useMemo } from "react";
import { useTheme, isPremiumTheme } from "../../hooks/useTheme";
import { useNowCoarse } from "../../hooks/useNow";
import { formatIskCompact } from "../../lib/format";
import type { KillEntry } from "../../lib/kills";

const HOURS = 24;
const HOUR_MS = 60 * 60 * 1000;
const W = 480;
const H = 92;
const PAD_L = 4;
const PAD_R = 4;
const PAD_T = 6;
const PAD_B = 16;

/** The last 24 hours of kills on one time axis: a column for each UTC hour (how many kills
 * landed in it) and a stepped line of ISK destroyed so far, climbing left to right like a
 * waterfall. Counted from the kills already loaded on the page, so it covers exactly the
 * kills the table beneath it lists and says how many that is; anything older than 24 hours
 * is left off. Premium decks only. */
function KillTimeline({ kills, subject }: { kills: KillEntry[]; subject: string }) {
  const [theme] = useTheme();
  const premium = isPremiumTheme(theme);
  const now = useNowCoarse(premium);

  const data = useMemo(() => {
    const counts = new Array<number>(HOURS).fill(0);
    const isk = new Array<number>(HOURS).fill(0);
    // Hour 0 is the current UTC hour, hour 23 is 23 hours earlier.
    const currentHourStart = Math.floor(now / HOUR_MS) * HOUR_MS;
    let used = 0;
    for (const kill of kills) {
      const t = Date.parse(kill.time);
      if (!Number.isFinite(t) || t > now + HOUR_MS) continue;
      const hoursAgo = Math.floor((currentHourStart - Math.floor(t / HOUR_MS) * HOUR_MS) / HOUR_MS);
      if (hoursAgo < 0 || hoursAgo >= HOURS) continue;
      counts[HOURS - 1 - hoursAgo] += 1;
      isk[HOURS - 1 - hoursAgo] += kill.total_value;
      used += 1;
    }
    let running = 0;
    const cumulative = isk.map((v) => (running += v));
    return { counts, cumulative, used, currentHourStart };
  }, [kills, now]);

  if (!premium || data.used === 0) return null;

  const maxCount = Math.max(...data.counts, 1);
  const totalIsk = data.cumulative[HOURS - 1] || 1;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const colW = plotW / HOURS;
  const busiestIndex = data.counts.indexOf(maxCount);
  const busiestHour = new Date(data.currentHourStart - (HOURS - 1 - busiestIndex) * HOUR_MS).getUTCHours();
  const linePoints = data.cumulative
    .map((v, i) => `${(PAD_L + i * colW + colW / 2).toFixed(1)},${(PAD_T + plotH - (v / totalIsk) * plotH).toFixed(1)}`)
    .join(" ");

  const summary = `${data.used} kill${data.used === 1 ? "" : "s"} in the last 24 hours, ${formatIskCompact(data.cumulative[HOURS - 1])} destroyed, busiest hour ${String(busiestHour).padStart(2, "0")}:00 UTC with ${maxCount}`;

  return (
    <div className="kill-timeline">
      <div className="kill-timeline-head">
        <span className="kill-timeline-title">{subject} · last 24 hours</span>
        <span className="kill-timeline-summary">{summary}</span>
      </div>
      <svg className="kill-timeline-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={summary}>
        <line className="kill-timeline-axis" x1={PAD_L} y1={PAD_T + plotH} x2={W - PAD_R} y2={PAD_T + plotH} />
        {data.counts.map((count, i) => {
          const h = (count / maxCount) * plotH;
          return (
            <rect
              key={i}
              className={`kill-timeline-bar${i === busiestIndex ? " kill-timeline-bar-peak" : ""}`}
              x={PAD_L + i * colW + 1}
              y={PAD_T + plotH - h}
              width={Math.max(1, colW - 2)}
              height={h}
            />
          );
        })}
        <polyline className="kill-timeline-line chart-trace" points={linePoints} pathLength={1} />
        <text className="kill-timeline-label" x={PAD_L} y={H - 3}>-24h</text>
        <text className="kill-timeline-label" x={W / 2} y={H - 3} textAnchor="middle">-12h</text>
        <text className="kill-timeline-label" x={W - PAD_R} y={H - 3} textAnchor="end">now</text>
      </svg>
      <div className="kill-timeline-key">
        <span><i className="kill-timeline-key-bar" /> kills per UTC hour (most {maxCount})</span>
        <span><i className="kill-timeline-key-line" /> ISK destroyed so far (to {formatIskCompact(data.cumulative[HOURS - 1])})</span>
      </div>
    </div>
  );
}

export default KillTimeline;
