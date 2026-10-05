import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { useTheme, isPremiumTheme } from "./useTheme";

export type ToastTier = "critical" | "normal";

export interface ToastItem {
  id: string;
  title: string;
  message?: string;
  /** Critical toasts (a tracked character or corp lost a ship) get the danger
   * treatment under a premium deck; everything else is normal. */
  tier?: ToastTier;
  /** True for the single summary toast that replaces a flood of individual ones. */
  flood?: boolean;
}

interface ToastState {
  toasts: ToastItem[];
  showToast: (title: string, message?: string, tier?: ToastTier) => void;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastState | null>(null);

/** How long a toast stays up before auto-dismissing itself. */
const TOAST_DURATION_MS = 10_000;

/** Flood control (premium decks only). Three or more toasts inside the window
 * stop being individually readable, the same way an alarm flood stops being
 * useful to a plant operator, so they collapse into one count toast. Nothing is
 * lost: every event is still in the notification bell, which is where the
 * summary points. Process-control practice calls more than ten alarms in ten
 * minutes a flood; a desktop toast stack saturates much sooner, hence three in
 * ten seconds. */
const FLOOD_WINDOW_MS = 10_000;
const FLOOD_THRESHOLD = 3;
const FLOOD_TOAST_ID = "toast-flood-summary";

export function useToast(): ToastState {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [theme] = useTheme();
  const premium = isPremiumTheme(theme);
  const recentRef = useRef<number[]>([]);
  const floodTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (title: string, message?: string, tier: ToastTier = "normal") => {
      if (premium) {
        const now = Date.now();
        recentRef.current = recentRef.current.filter((t) => now - t < FLOOD_WINDOW_MS);
        recentRef.current.push(now);
        if (recentRef.current.length >= FLOOD_THRESHOLD) {
          const count = recentRef.current.length;
          // Replace everything on screen with one summary that keeps counting.
          setToasts([
            {
              id: FLOOD_TOAST_ID,
              title: `${count} tracked events in the last 10 seconds`,
              message: "Collapsed so the screen stays readable. Every one is in the notification bell.",
              tier: "critical",
              flood: true,
            },
          ]);
          if (floodTimerRef.current) clearTimeout(floodTimerRef.current);
          floodTimerRef.current = setTimeout(() => dismissToast(FLOOD_TOAST_ID), TOAST_DURATION_MS);
          return;
        }
      }
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((prev) => [...prev, { id, title, message, tier }]);
      setTimeout(() => dismissToast(id), TOAST_DURATION_MS);
    },
    [dismissToast, premium],
  );

  return <ToastContext.Provider value={{ toasts, showToast, dismissToast }}>{children}</ToastContext.Provider>;
}
