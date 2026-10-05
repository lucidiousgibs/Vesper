import { useId, type KeyboardEvent, type ReactNode } from "react";
import { typeIconUrl } from "../lib/format";
import { DIAL_GROUPS, arcPath, polar, slotAngles, type DialGroup } from "../lib/fittingDial";

export interface DialSlot {
  group: DialGroup;
  index: number;
  /** The fitted item's type id; null for an empty slot. */
  typeId: number | null;
  name?: string;
  quantity?: number;
  /** Killmail view only: whether the item was destroyed or dropped as loot. */
  state?: "destroyed" | "dropped" | null;
  /** Killmail view only: the charge loaded in the module (ammo, a crystal, a script). */
  ammo?: { typeId: number; name: string; quantity: number } | null;
}

export interface DialGauge {
  label: string;
  used: number;
  total: number;
  unit?: string;
  /** Extra tooltip text, e.g. a caveat about what the number leaves out. */
  note?: string;
}

export interface DialHardpoints {
  turret: { total: number; used: number | null };
  launcher: { total: number; used: number | null };
}

interface FittingDialProps {
  shipTypeId: number;
  shipTypeName: string;
  /** Slots the hull has in each rack; every one is drawn, filled or empty. */
  counts: Record<DialGroup, number>;
  /** The occupied slots only. */
  slots: DialSlot[];
  hardpoints?: DialHardpoints | null;
  calibration?: DialGauge | null;
  power?: DialGauge | null;
  cpu?: DialGauge | null;
  droneBay?: DialGauge | null;
  /** Total volume of the cargo hold's contents, with no capacity to compare it to. */
  cargoVolume?: number | null;
  /** "build": empty slots can be clicked to fill them. "view": read-only (a killmail). */
  mode: "build" | "view";
  selected?: { group: DialGroup; index: number } | null;
  onSlotClick?: (slot: DialSlot) => void;
  onShipClick?: () => void;
  /** Shown over the middle of the dial, e.g. a module search opened from an empty slot. */
  overlay?: ReactNode;
}

const SIZE = 660;
const C = SIZE / 2;
const R_FRAME = 304;
const R_DISC = 226;
const R_TRACK = 252;
const SLOT = 44;
const SHIP_RENDER = 462;

const GROUP_LABEL: Record<DialGroup, string> = {
  high: "High slot",
  mid: "Mid slot",
  low: "Low slot",
  rig: "Rig slot",
  subsystem: "Subsystem slot",
};

type GaugeTone = "ok" | "near" | "over";

function gaugeTone(gauge: DialGauge): GaugeTone {
  if (gauge.used > gauge.total) return "over";
  return gauge.total > 0 && gauge.used >= gauge.total * 0.9 ? "near" : "ok";
}

const TONE_WORD: Record<GaugeTone, string> = { ok: "within limits", near: "near the limit", over: "over the limit" };
const TONE_GLYPH: Record<GaugeTone, string> = { ok: "", near: " ▲", over: " ■" };

function fmt(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

/** One curved bar round the edge of the dial: a ribbed track, filled to the share used, and
 * turning amber near the limit and red over it. The word and the shape sit in the readout, so
 * the colour is never the only cue. */
function ArcGauge({ gauge, radius, from, to, width }: { gauge: DialGauge; radius: number; from: number; to: number; width: number }) {
  if (gauge.total <= 0) return null;
  const tone = gaugeTone(gauge);
  const share = Math.min(1, gauge.used / gauge.total);
  const d = arcPath(C, C, radius, from, to);
  return (
    <g className={`fit-dial-gauge fit-dial-gauge-${tone}`}>
      <title>{`${gauge.label}: ${fmt(gauge.used)} of ${fmt(gauge.total)}${gauge.unit ?? ""}, ${TONE_WORD[tone]}${gauge.note ? `. ${gauge.note}` : ""}`}</title>
      <path className="fit-dial-gauge-track" d={d} strokeWidth={width} pathLength={100} fill="none" />
      <path className="fit-dial-gauge-fill" d={d} strokeWidth={width} pathLength={100} strokeDasharray={`${share * 100} 100`} fill="none" />
      <path className="fit-dial-gauge-ribs" d={d} strokeWidth={width + 1} pathLength={100} strokeDasharray="0.45 1.55" fill="none" />
    </g>
  );
}

function Readout({ gauge, x, y, anchor }: { gauge: DialGauge; x: number; y: number; anchor: "start" | "end" }) {
  if (gauge.total <= 0) return null;
  const tone = gaugeTone(gauge);
  return (
    <text className={`fit-dial-readout fit-dial-readout-${tone}`} x={x} y={y} textAnchor={anchor}>
      <tspan className="fit-dial-readout-label">{gauge.label} </tspan>
      <tspan>
        {fmt(gauge.used)} / {fmt(gauge.total)}
        {gauge.unit ?? ""}
        {TONE_GLYPH[tone]}
      </tspan>
      <title>{`${gauge.label}: ${TONE_WORD[tone]}${gauge.note ? `. ${gauge.note}` : ""}`}</title>
    </text>
  );
}

function HardpointRow({ label, total, used, y }: { label: string; total: number; used: number | null; y: number }) {
  if (total <= 0) return null;
  const known = used != null;
  const summary = known ? `${label}: ${used} of ${total} hardpoints used` : `${label}: ${total} hardpoints`;
  return (
    <g transform={`translate(${C} ${y})`} role="img" aria-label={summary}>
      <title>{summary}</title>
      <rect className="fit-dial-hardpoint-plate" x={-(label.length * 7.4 + 16)} y={-11} width={label.length * 7.4 + 16 + 10 + total * 13} height={22} rx={11} />
      <text className="fit-dial-hardpoint-label" x={-8} y={4} textAnchor="end">
        {label}
      </text>
      {Array.from({ length: total }, (_, i) => (
        <circle key={i} className={known && i < used ? "fit-dial-hardpoint fit-dial-hardpoint-used" : "fit-dial-hardpoint"} cx={4 + i * 13} cy={0} r={4.5} />
      ))}
    </g>
  );
}

function activateOnKey(event: KeyboardEvent, action: () => void) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    action();
  }
}

/** The round ship-fitting display from EVE's fitting window, drawn with the app's own theme
 * colours. Every rack of the hull is laid out round the ring in the same places as in the game
 * (high slots top left, mid slots right, low slots bottom, rigs left), empty slots included,
 * with the ship in the middle, weapon hardpoints beneath the top of the ring, and calibration,
 * powergrid and CPU as curved bars on the rim. Used by the Fit Builder (click a slot to fill
 * it) and by the killmail detail page (read-only, showing what was destroyed and what
 * dropped). */
function FittingDial({
  shipTypeId,
  shipTypeName,
  counts,
  slots,
  hardpoints,
  calibration,
  power,
  cpu,
  droneBay,
  cargoVolume,
  mode,
  selected,
  onSlotClick,
  onShipClick,
  overlay,
}: FittingDialProps) {
  const uid = useId().replace(/:/g, "");
  const filled = new Map<string, DialSlot>();
  for (const slot of slots) filled.set(`${slot.group}:${slot.index}`, slot);

  const placed = DIAL_GROUPS.flatMap((group) => {
    const angles = slotAngles(group, counts[group]);
    return angles.map((angle, index) => {
      const slot = filled.get(`${group}:${index}`) ?? { group, index, typeId: null };
      return { slot, angle, ...polar(C, C, R_TRACK, angle) };
    });
  });

  const interactive = (slot: DialSlot) => Boolean(onSlotClick) && (slot.typeId != null || mode === "build");

  return (
    <div className="fit-dial-wrap">
      <svg className="fit-dial" viewBox={`0 0 ${SIZE} ${SIZE}`} role="group" aria-label={`${shipTypeName} fitting`}>
        <defs>
          <clipPath id={`${uid}-disc`}>
            <circle cx={C} cy={C} r={R_DISC - 3} />
          </clipPath>
          <radialGradient id={`${uid}-glow`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" className="fit-dial-glow-in" />
            <stop offset="100%" className="fit-dial-glow-out" />
          </radialGradient>
        </defs>

        <circle className="fit-dial-frame" cx={C} cy={C} r={R_FRAME} />
        <circle className="fit-dial-disc" cx={C} cy={C} r={R_DISC} fill={`url(#${uid}-glow)`} />
        <g
          className={onShipClick ? "fit-dial-ship fit-dial-clickable" : "fit-dial-ship"}
          role={onShipClick ? "button" : undefined}
          tabIndex={onShipClick ? 0 : undefined}
          aria-label={onShipClick ? `Open ${shipTypeName} in the Market Browser` : undefined}
          onClick={onShipClick}
          onKeyDown={onShipClick ? (e) => activateOnKey(e, onShipClick) : undefined}
        >
          <title>{shipTypeName}</title>
          <image
            href={`https://images.evetech.net/types/${shipTypeId}/render?size=512`}
            x={C - SHIP_RENDER / 2}
            y={C - SHIP_RENDER / 2}
            width={SHIP_RENDER}
            height={SHIP_RENDER}
            clipPath={`url(#${uid}-disc)`}
            preserveAspectRatio="xMidYMid meet"
          />
        </g>
        <circle className="fit-dial-disc-rim" cx={C} cy={C} r={R_DISC} />

        {hardpoints && (
          <g className="fit-dial-hardpoints">
            <HardpointRow label="Turrets" total={hardpoints.turret.total} used={hardpoints.turret.used} y={C - R_DISC + 70} />
            <HardpointRow label="Launchers" total={hardpoints.launcher.total} used={hardpoints.launcher.used} y={C - R_DISC + 92} />
          </g>
        )}

        {calibration && <ArcGauge gauge={calibration} radius={289} from={-120} to={-52} width={7} />}
        {power && <ArcGauge gauge={power} radius={283} from={98} to={174} width={5} />}
        {cpu && <ArcGauge gauge={cpu} radius={294} from={98} to={174} width={5} />}

        {placed.map(({ slot, angle, x, y }) => {
          const occupied = slot.typeId != null;
          const canClick = interactive(slot);
          const isSelected = selected?.group === slot.group && selected.index === slot.index;
          const label = occupied
            ? `${slot.name ?? "Item"}${slot.quantity && slot.quantity > 1 ? ` x${slot.quantity}` : ""}`
            : `${GROUP_LABEL[slot.group]} ${slot.index + 1}, empty`;
          const stateWord = slot.state === "destroyed" ? ", destroyed" : slot.state === "dropped" ? ", dropped" : "";
          const ammoPos = slot.ammo ? polar(C, C, R_TRACK - 38, angle) : null;
          return (
            <g key={`${slot.group}-${slot.index}`}>
              <g
                className={[
                  "fit-dial-slot",
                  `fit-dial-slot-${slot.group}`,
                  occupied ? "fit-dial-slot-filled" : "fit-dial-slot-empty",
                  slot.state ? `fit-dial-slot-${slot.state}` : "",
                  isSelected ? "fit-dial-slot-selected" : "",
                  canClick ? "fit-dial-clickable" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                transform={`translate(${x.toFixed(2)} ${y.toFixed(2)})`}
                role={canClick ? "button" : undefined}
                tabIndex={canClick ? 0 : undefined}
                aria-label={`${label}${stateWord}`}
                onClick={canClick ? () => onSlotClick?.(slot) : undefined}
                onKeyDown={canClick ? (e) => activateOnKey(e, () => onSlotClick?.(slot)) : undefined}
              >
                <title>{`${label}${stateWord}`}</title>
                <rect className="fit-dial-slot-frame" x={-SLOT / 2} y={-SLOT / 2} width={SLOT} height={SLOT} rx={5} transform={`rotate(${angle.toFixed(2)})`} />
                {occupied ? (
                  <image href={typeIconUrl(slot.typeId!, 64)} x={-17} y={-17} width={34} height={34} />
                ) : mode === "build" ? (
                  <path className="fit-dial-plus" d="M -6 0 H 6 M 0 -6 V 6" />
                ) : null}
                {slot.state && (
                  <text className="fit-dial-slot-state" x={SLOT / 2 - 3} y={-SLOT / 2 + 8} textAnchor="middle">
                    {slot.state === "destroyed" ? "✕" : "✓"}
                  </text>
                )}
                {slot.quantity != null && slot.quantity > 1 && (
                  <text className="fit-dial-slot-qty" x={SLOT / 2 - 2} y={SLOT / 2 - 2} textAnchor="end">
                    {slot.quantity}
                  </text>
                )}
              </g>
              {slot.ammo && ammoPos && (
                <g
                  className={onSlotClick ? "fit-dial-ammo fit-dial-clickable" : "fit-dial-ammo"}
                  transform={`translate(${ammoPos.x.toFixed(2)} ${ammoPos.y.toFixed(2)})`}
                  role={onSlotClick ? "button" : undefined}
                  tabIndex={onSlotClick ? 0 : undefined}
                  aria-label={`${slot.ammo.name} x${slot.ammo.quantity}, loaded`}
                  onClick={onSlotClick ? () => onSlotClick({ ...slot, typeId: slot.ammo!.typeId, name: slot.ammo!.name, quantity: slot.ammo!.quantity, ammo: null }) : undefined}
                  onKeyDown={
                    onSlotClick
                      ? (e) => activateOnKey(e, () => onSlotClick({ ...slot, typeId: slot.ammo!.typeId, name: slot.ammo!.name, quantity: slot.ammo!.quantity, ammo: null }))
                      : undefined
                  }
                >
                  <title>{`${slot.ammo.name} x${slot.ammo.quantity}`}</title>
                  <rect x={-14} y={-14} width={28} height={28} rx={4} />
                  <image href={typeIconUrl(slot.ammo.typeId, 32)} x={-11} y={-11} width={22} height={22} />
                </g>
              )}
            </g>
          );
        })}

        {calibration && <Readout gauge={calibration} x={14} y={26} anchor="start" />}
        {droneBay && <Readout gauge={droneBay} x={14} y={SIZE - 30} anchor="start" />}
        {cargoVolume != null && (
          <text className="fit-dial-readout" x={14} y={SIZE - 10} textAnchor="start">
            <tspan className="fit-dial-readout-label">Cargo </tspan>
            <tspan>{fmt(cargoVolume)} m3</tspan>
          </text>
        )}
        {power && <Readout gauge={power} x={SIZE - 14} y={SIZE - 30} anchor="end" />}
        {cpu && <Readout gauge={cpu} x={SIZE - 14} y={SIZE - 10} anchor="end" />}
      </svg>
      {overlay && <div className="fit-dial-overlay">{overlay}</div>}
    </div>
  );
}

export default FittingDial;
