import { useEffect, useRef, useState } from "react";
import { useTheme, isPremiumTheme } from "../../hooks/useTheme";

/** A single bright line that crosses its panel once when `trigger` changes, to
 * say "this data just refreshed". It does nothing on first mount (nothing has
 * refreshed yet), only under a premium deck, and the CSS drops it at Motion
 * Off. The host element needs `position: relative`; the premium stylesheet
 * gives the gate boards that. Put it only on the panel that has focus; one on
 * every panel every half minute would be noise. */
function ScanPulse({ trigger }: { trigger: number }) {
  const [theme] = useTheme();
  const premium = isPremiumTheme(theme);
  const first = useRef(true);
  const [run, setRun] = useState(0);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setRun((r) => r + 1);
  }, [trigger]);

  if (!premium || run === 0) return null;
  // Keyed by run so each refresh restarts the animation.
  return <span key={run} className="scan-pulse" aria-hidden="true" />;
}

export default ScanPulse;
