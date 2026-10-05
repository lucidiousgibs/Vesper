import { useEffect, useRef, useState } from "react";
import { useLocationTracking } from "../hooks/useLocationTracking";
import { useSoundEnabled } from "../hooks/useSoundEnabled";
import { useSoundVolume } from "../hooks/useSoundVolume";
import { playProximityAlert } from "../lib/sound";
import { useTheme, isPremiumTheme } from "../hooks/useTheme";

const PULSE_DURATION_MS = 1800;
/** A new flash will not start sooner than this after the last one, so a burst of
 * nearby kills can never strobe the screen. Three flashes per second is the
 * accepted ceiling for photosensitivity; this keeps well under it. */
const MIN_FLASH_INTERVAL_MS = 600;
/** Under a premium deck a burst plays one alert sound, not one per kill. */
const MIN_SOUND_INTERVAL_MS = 3_000;

/**
 * A full-viewport flash mounted at the app root, so it's visible no matter
 * which page is open - Maps, Wallet, Intel, wherever - the instant a kill
 * lands within the tracked proximity radius. Amber for a kill somewhere else
 * within that radius, red for one in the exact system currently being
 * tracked - the one that actually means "you might be in danger right now"
 * (see pulseSeverity). Remounted (via `key`) on every pulseToken change so
 * back-to-back alerts each get their own full animation instead of getting
 * cut off mid-pulse.
 *
 * pulseToken lives in a root-level provider and never resets to 0, so a
 * plain `if (pulseToken === 0) return` guard isn't enough - a fresh mount
 * of THIS component (which can happen for reasons unrelated to a real
 * alert) would see whatever nonzero value already exists and flash for no
 * reason. lastSeenRef captures whatever pulseToken is AT MOUNT TIME as the
 * baseline, so only a genuine increase observed while mounted triggers the
 * flash - remounting alone never does.
 */
function ProximityFlashOverlay() {
  const { pulseToken, pulseSeverity, soundToken } = useLocationTracking();
  const [soundEnabled] = useSoundEnabled();
  const [soundVolume] = useSoundVolume();
  const [activeToken, setActiveToken] = useState<number | null>(null);
  // Captured alongside activeToken at the moment a pulse actually fires -
  // pulseSeverity itself doesn't reset between alerts, so reading it fresh
  // at render time would risk this pulse showing whatever severity happens
  // to be sitting there NOW rather than what it was AT the triggering pulse.
  const [activeSeverity, setActiveSeverity] = useState<"system" | "nearby">("nearby");
  const lastSeenRef = useRef(pulseToken);
  const lastFlashAtRef = useRef(0);
  const lastSoundAtRef = useRef(0);
  const [theme] = useTheme();
  const premium = isPremiumTheme(theme);
  // Same remount-safety concern as pulseToken above: soundToken never resets
  // to 0, so a fresh mount must baseline against whatever value already
  // exists rather than treating any nonzero token as a brand-new alert.
  const lastSoundSeenRef = useRef(soundToken);

  useEffect(() => {
    if (pulseToken === lastSeenRef.current) return;
    lastSeenRef.current = pulseToken;
    const now = Date.now();
    if (now - lastFlashAtRef.current < MIN_FLASH_INTERVAL_MS) return;
    lastFlashAtRef.current = now;
    setActiveToken(pulseToken);
    setActiveSeverity(pulseSeverity);
    const timeout = setTimeout(() => setActiveToken(null), PULSE_DURATION_MS);
    return () => clearTimeout(timeout);
  }, [pulseToken, pulseSeverity]);

  useEffect(() => {
    if (soundToken === lastSoundSeenRef.current) return;
    lastSoundSeenRef.current = soundToken;
    const now = Date.now();
    if (premium && now - lastSoundAtRef.current < MIN_SOUND_INTERVAL_MS) return;
    lastSoundAtRef.current = now;
    if (soundEnabled) playProximityAlert(soundVolume);
  }, [soundToken, soundEnabled, soundVolume, premium]);

  if (activeToken === null) return null;

  return (
    <div
      key={activeToken}
      className={`proximity-flash-overlay${activeSeverity === "system" ? " proximity-flash-overlay-system" : ""}`}
      aria-hidden="true"
    />
  );
}

export default ProximityFlashOverlay;
