import { useCallback, useEffect, type RefObject } from "react";

/** The look of an old CRT, laid over the startup sequence: the way a ship's console of the 1980s
 * would show it. The layers sit above everything and take no clicks. From the back: scanlines, a
 * slow bar of brightness rolling down the tube, crawling static, a vignette with a sheen of glass,
 * and a rounded bezel that makes the screen corners round. The stylesheet does the rest (the
 * phosphor tint and glow, the power-on, the flicker). */
export function BootCrt() {
  return (
    <div className="crt-layers" aria-hidden="true">
      <div className="crt-scan" />
      <div className="crt-roll" />
      <div className="crt-noise" />
      <div className="crt-vignette" />
      <div className="crt-bezel" />
    </div>
  );
}

/** What the glitches are: "dip" is a brief drop in brightness, "jitter" a sideways shake of the whole
 * picture, "fringe" a flash of red and cyan round the letters, and "burst" a short blast of static
 * with a shake, used at the changes between stages. */
export type CrtGlitch = "dip" | "jitter" | "fringe" | "burst";

/** Gives the screen its random imperfections while the startup sequence runs: a flicker of dips now
 * and then, an occasional sideways shake, an occasional flash of colour fringing. Each is switched on
 * for a moment by a data attribute on the overlay (the stylesheet draws it), at random intervals, so
 * it never repeats the same way twice. Returns a function that fires a burst on demand. */
export function useCrtGlitches(
  overlayRef: RefObject<HTMLElement | null>,
  active: boolean,
  onGlitch?: (kind: CrtGlitch) => void,
): () => void {
  useEffect(() => {
    const el = overlayRef.current;
    if (!active || !el) return;
    const timers = new Set<number>();
    const attrFor = (kind: CrtGlitch) => `data-crt-${kind}`;
    const fire = (kind: CrtGlitch, ms: number) => {
      if (kind === "jitter" || kind === "burst") {
        el.style.setProperty("--crt-jx", `${((Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 5)).toFixed(1)}px`);
      }
      el.setAttribute(attrFor(kind), "");
      onGlitch?.(kind);
      const off = window.setTimeout(() => {
        el.removeAttribute(attrFor(kind));
        timers.delete(off);
      }, ms);
      timers.add(off);
    };
    const loop = (kind: CrtGlitch, minGap: number, maxGap: number, minLen: number, maxLen: number) => {
      const next = window.setTimeout(() => {
        timers.delete(next);
        fire(kind, minLen + Math.random() * (maxLen - minLen));
        loop(kind, minGap, maxGap, minLen, maxLen);
      }, minGap + Math.random() * (maxGap - minGap));
      timers.add(next);
    };
    // The power-on takes the first moments; the imperfections begin once the picture is up.
    const start = window.setTimeout(() => {
      loop("dip", 700, 2600, 50, 130);
      loop("jitter", 1800, 5200, 120, 260);
      loop("fringe", 2500, 7000, 140, 320);
    }, 1200);
    timers.add(start);
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      for (const kind of ["dip", "jitter", "fringe", "burst"] as const) el.removeAttribute(attrFor(kind));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, overlayRef]);

  return useCallback(() => {
    const el = overlayRef.current;
    if (!el) return;
    el.style.setProperty("--crt-jx", `${((Math.random() < 0.5 ? -1 : 1) * (4 + Math.random() * 6)).toFixed(1)}px`);
    el.setAttribute("data-crt-burst", "");
    onGlitch?.("burst");
    window.setTimeout(() => el.removeAttribute("data-crt-burst"), 240);
  }, [overlayRef, onGlitch]);
}
