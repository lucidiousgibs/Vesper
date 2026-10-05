import { useTheme, isPremiumTheme } from "../../hooks/useTheme";
import { useNowCoarse } from "../../hooks/useNow";

interface StaleMarkProps {
  /** When the data was last fetched successfully. */
  since: number | null;
  /** How old, in milliseconds, before the data counts as stale. */
  afterMs: number;
  /** What the data is, for the tooltip, e.g. "Gate camps". */
  what: string;
}

/** A small warning triangle that appears beside data that has not been refreshed for longer
 * than it should have been. A second channel next to any colour: the triangle and its tooltip
 * say it in words. Premium decks only; shows nothing while the data is fresh or not loaded. */
function StaleMark({ since, afterMs, what }: StaleMarkProps) {
  const [theme] = useTheme();
  const premium = isPremiumTheme(theme);
  const now = useNowCoarse(premium);
  if (!premium || since == null || now - since < afterMs) return null;
  const minutes = Math.max(1, Math.round((now - since) / 60_000));
  return (
    <span className="stale-mark" role="img" aria-label={`${what} has not refreshed for ${minutes} minutes`} title={`${what} has not refreshed for ${minutes} minute${minutes === 1 ? "" : "s"}`}>
      &#9650;
    </span>
  );
}

export default StaleMark;
