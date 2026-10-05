import { useEffect, useRef, useState } from "react";
import { useTheme, isPremiumTheme } from "../../hooks/useTheme";

/** The last value each rolling number showed, by id, kept outside the component so a
 * number that is re-mounted (leaving a page and coming back) still rolls from what the
 * pilot last saw to what it is now, instead of jumping. */
const lastShown = new Map<string, number>();

const DURATION_MS = 400;

function easeOut(t: number): number {
  // cubic-bezier(.2,.8,.2,1)-like: quick start, soft landing.
  return 1 - Math.pow(1 - t, 3);
}

interface RollingNumberProps {
  /** Stable identity for this number, e.g. "wallet-12345". */
  id: string;
  value: number;
  format: (n: number) => string;
}

/** A number that eases from its previous value to a new one over 400ms when it really
 * changes. Premium decks only, and not at Motion Off. The first time a given number is
 * ever shown it simply appears, so nothing counts up from zero for show; only a genuine
 * change is animated, and the last frame is always the exact new value. */
function RollingNumber({ id, value, format }: RollingNumberProps) {
  const [theme] = useTheme();
  const premium = isPremiumTheme(theme);
  const [shown, setShown] = useState(() => lastShown.get(id) ?? value);
  const shownRef = useRef(shown);
  shownRef.current = shown;

  useEffect(() => {
    const from = shownRef.current;
    const motionOff = document.documentElement.dataset.fxMotion === "off";
    if (!premium || motionOff || from === value) {
      setShown(value);
      lastShown.set(id, value);
      return;
    }
    let frame = 0;
    const started = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / DURATION_MS);
      const current = t >= 1 ? value : from + (value - from) * easeOut(t);
      setShown(current);
      lastShown.set(id, current);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [id, value, premium]);

  return <>{format(shown)}</>;
}

export default RollingNumber;
