import { useEffect, useState } from "react";

/** A physical indicator lamp - housing, unlit material, illuminated core,
 * light bloom - instead of a flat colored dot with a box-shadow. Used by
 * StatusChip in place of its old .status-chip-dot whenever a premium deck
 * theme is active (see StatusChip.tsx); does nothing visually under any
 * standard theme, since none of its CSS classes are styled there - the
 * whole treatment lives in premium-structure.css, gated on
 * :root[data-theme="bulkhead"|"cold-ballast"|"command-deck"|"amber-exchange"|"phosphor-green"].
 *
 * Two housing shapes: a round bulb (`shape="circle"`, the default - most
 * status contexts) and a rectangular annunciator window (`shape="rect"`),
 * for the handful of places that want the "backlit legend plate" look
 * instead (see Annunciator, which uses this internally).
 *
 * `lit={false}` renders the housing in its dark, desaturated "unpowered"
 * material rather than just fading a lit one - an off lamp on real
 * equipment still has a visible physical presence, it just isn't glowing. */
export type LampTone = "online" | "warning" | "attention" | "danger" | "neutral";

/** Acknowledged blinking lamps, by the caller's `ackKey`, remembered with the tone that
 * was acknowledged. Kept outside the component so an acknowledged lamp stays quiet when
 * its page is left and revisited. An entry only counts while the lamp is still blinking
 * with that same tone; a lamp that stops blinking forgets it, so the next occurrence
 * blinks again. */
const acknowledged = new Map<string, LampTone>();

interface StatusLampProps {
  tone: LampTone;
  lit?: boolean;
  shape?: "circle" | "rect";
  /** Adds the hard, mechanical steps() blink used for caution/alert states -
   * never for a resting "online" lamp, which only gets the ambient bloom. */
  blink?: boolean;
  /** Makes a blinking lamp acknowledgeable: click it (or press Enter or Space) and the
   * blink stops while the lit state stays. A blink with no way to stop it is the kind of
   * alarm people learn to ignore. Give each lamp a stable, unique key. */
  ackKey?: string;
  className?: string;
}

function StatusLamp({ tone, lit = true, shape = "circle", blink = false, ackKey, className }: StatusLampProps) {
  const [, rerender] = useState(0);
  const isAcked = ackKey != null && blink && acknowledged.get(ackKey) === tone;

  useEffect(() => {
    // The condition cleared: forget the acknowledgement so the next one blinks again.
    if (ackKey != null && !blink) acknowledged.delete(ackKey);
  }, [ackKey, blink]);

  const blinking = blink && !isAcked;
  const ackable = ackKey != null && blinking;

  function acknowledge(e: { stopPropagation: () => void }) {
    if (ackKey == null) return;
    e.stopPropagation();
    acknowledged.set(ackKey, tone);
    rerender((n) => n + 1);
  }

  return (
    <span
      className={[
        "status-lamp",
        `status-lamp-${shape}`,
        `status-lamp-${tone}`,
        lit ? "status-lamp-lit" : "status-lamp-unlit",
        blinking ? "status-lamp-blink" : "",
        ackable ? "status-lamp-ackable" : "",
        isAcked ? "status-lamp-acked" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      {...(ackable
        ? {
            role: "button",
            tabIndex: 0,
            title: "Acknowledge: stops the blink, the state stays on screen",
            "aria-label": "Acknowledge this warning",
            onClick: acknowledge,
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                acknowledge(e);
              }
            },
          }
        : {})}
    >
      <span className="status-lamp-core" />
    </span>
  );
}

export default StatusLamp;
