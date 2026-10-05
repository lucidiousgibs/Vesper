import { useMemo } from "react";
import { useTheme, isPremiumTheme } from "../../hooks/useTheme";
import { useNowCoarse } from "../../hooks/useNow";
import type { IndustryJobEntry } from "../../lib/eve";

const LANE_ORDER = [
  "Manufacturing",
  "Reaction",
  "Copying",
  "Invention",
  "Time Efficiency Research",
  "Material Efficiency Research",
  "Reverse Engineering",
];

const W = 560;
const LANE_H = 26;
const LABEL_W = 150;
const AXIS_H = 18;
const HOUR_MS = 3_600_000;
const MIN_SPAN_MS = 24 * HOUR_MS;
const MAX_SPAN_MS = 14 * 24 * HOUR_MS;

/** A job's state in the grammar of the rest of the app: quiet while it runs, amber once it
 * has finished and is waiting to be delivered (the one that needs a pilot), grey once it is
 * done with. */
function jobTone(job: IndustryJobEntry, now: number): "running" | "ready" | "closed" | "paused" {
  const status = job.status.toLowerCase();
  if (status === "delivered" || status === "cancelled" || status === "reverted") return "closed";
  if (status === "paused") return "paused";
  if (status === "ready" || Date.parse(job.end_date) <= now) return "ready";
  return "running";
}

/** Every industry job on one time axis, one lane per kind of work: a bar from the job's start
 * to its end, filled to the share already elapsed, with a marker for now. Built from the
 * jobs' own start and end times, so it shows exactly the jobs the table beneath it lists.
 * Premium decks only. */
function JobLanes({ jobs }: { jobs: IndustryJobEntry[] }) {
  const [theme] = useTheme();
  const premium = isPremiumTheme(theme);
  const now = useNowCoarse(premium);

  const model = useMemo(() => {
    const open = jobs.filter((j) => jobTone(j, now) !== "closed");
    if (open.length === 0) return null;
    const starts = open.map((j) => Date.parse(j.start_date)).filter(Number.isFinite);
    const ends = open.map((j) => Date.parse(j.end_date)).filter(Number.isFinite);
    if (starts.length === 0 || ends.length === 0) return null;
    let from = Math.min(Math.min(...starts), now - 6 * HOUR_MS);
    let to = Math.max(Math.max(...ends), now + 12 * HOUR_MS);
    if (to - from < MIN_SPAN_MS) to = from + MIN_SPAN_MS;
    if (to - from > MAX_SPAN_MS) {
      // Very long jobs: keep the window around now rather than squeezing everything.
      from = Math.max(from, now - 2 * 24 * HOUR_MS);
      to = Math.min(to, from + MAX_SPAN_MS);
    }
    const lanes = [...new Set(open.map((j) => j.activity_name))].sort((a, b) => {
      const ia = LANE_ORDER.indexOf(a);
      const ib = LANE_ORDER.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
    });
    return { open, from, to, lanes };
  }, [jobs, now]);

  if (!premium || !model) return null;

  const plotW = W - LABEL_W;
  const x = (t: number) => LABEL_W + ((Math.min(model.to, Math.max(model.from, t)) - model.from) / (model.to - model.from)) * plotW;
  const height = AXIS_H + model.lanes.length * LANE_H + 4;
  const ready = model.open.filter((j) => jobTone(j, now) === "ready").length;
  const summary = `${model.open.length} job${model.open.length === 1 ? "" : "s"} open across ${model.lanes.length} lane${model.lanes.length === 1 ? "" : "s"}${ready ? `, ${ready} finished and waiting to be delivered` : ""}`;

  // A tick every 12 hours for short windows, daily for long ones, labelled in UTC.
  const tickEvery = model.to - model.from > 4 * 24 * HOUR_MS ? 24 * HOUR_MS : 12 * HOUR_MS;
  const ticks: number[] = [];
  for (let t = Math.ceil(model.from / tickEvery) * tickEvery; t <= model.to; t += tickEvery) ticks.push(t);

  return (
    <div className="job-lanes">
      <div className="job-lanes-head">
        <span className="job-lanes-title">Job lanes</span>
        <span className="job-lanes-summary">{summary}</span>
      </div>
      <svg className="job-lanes-svg" viewBox={`0 0 ${W} ${height}`} role="img" aria-label={summary}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="job-lanes-grid" x1={x(t)} y1={AXIS_H - 4} x2={x(t)} y2={height - 2} />
            <text className="job-lanes-axis" x={x(t)} y={10} textAnchor="middle">
              {tickEvery >= 24 * HOUR_MS
                ? new Date(t).toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" })
                : `${new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })}`}
            </text>
          </g>
        ))}
        {model.lanes.map((lane, li) => {
          const y = AXIS_H + li * LANE_H;
          return (
            <g key={lane}>
              <text className="job-lanes-lane" x={4} y={y + LANE_H / 2 + 3}>
                {lane}
              </text>
              <line className="job-lanes-rule" x1={LABEL_W} y1={y + LANE_H - 1} x2={W} y2={y + LANE_H - 1} />
              {model.open
                .filter((j) => j.activity_name === lane)
                .map((j) => {
                  const start = Date.parse(j.start_date);
                  const end = Date.parse(j.end_date);
                  const tone = jobTone(j, now);
                  const x0 = x(start);
                  const x1 = Math.max(x0 + 3, x(end));
                  const elapsed = Math.min(1, Math.max(0, (now - start) / Math.max(1, end - start)));
                  const label = `${j.blueprint_type_name}${j.product_type_name ? ` to ${j.product_type_name}` : ""}, ${j.runs} run${j.runs === 1 ? "" : "s"}, ${tone === "ready" ? "finished, waiting to be delivered" : tone === "paused" ? "paused" : `${Math.round(elapsed * 100)}% done`}`;
                  return (
                    <g key={j.job_id} className={`job-lanes-job job-lanes-job-${tone}`}>
                      <title>{label}</title>
                      <rect className="job-lanes-bar" x={x0} y={y + 5} width={x1 - x0} height={LANE_H - 11} />
                      <rect className="job-lanes-fill" x={x0} y={y + 5} width={(x1 - x0) * (tone === "ready" ? 1 : elapsed)} height={LANE_H - 11} />
                      {tone === "ready" && (
                        <text className="job-lanes-glyph" x={Math.min(W - 10, x1 + 3)} y={y + LANE_H / 2 + 3}>
                          &#9650;
                        </text>
                      )}
                    </g>
                  );
                })}
            </g>
          );
        })}
        {now >= model.from && now <= model.to && (
          <g>
            <line className="job-lanes-now" x1={x(now)} y1={AXIS_H - 6} x2={x(now)} y2={height - 2} />
          </g>
        )}
      </svg>
      <div className="job-lanes-key">
        <span><i className="job-lanes-key-run" /> running (filled to the share done)</span>
        <span><i className="job-lanes-key-ready" /> &#9650; finished, waiting to be delivered</span>
        <span><i className="job-lanes-key-now" /> now (times in UTC)</span>
      </div>
    </div>
  );
}

export default JobLanes;
