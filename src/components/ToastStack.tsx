import { X } from "lucide-react";
import { useToast } from "../hooks/useToast";
import { useTheme, isPremiumTheme } from "../hooks/useTheme";

function ToastStack() {
  const { toasts, dismissToast } = useToast();
  const [theme] = useTheme();
  const premium = isPremiumTheme(theme);
  if (toasts.length === 0) return null;

  // Under a premium deck, tier-1 events (a tracked loss, or a flood summary) get their
  // own strip across the top of the screen instead of a corner toast. Only the newest
  // is shown; any others inside the same ten seconds fold into "+N more", so a fight
  // never stacks strips. Everything else stays a normal toast.
  const critical = premium ? toasts.filter((t) => t.tier === "critical") : [];
  const strip = critical[critical.length - 1];
  const stack = premium ? toasts.filter((t) => t.tier !== "critical") : toasts;

  return (
    <>
      {strip && (
        <div key={strip.id} className="alert-strip" role="alert">
          <span className="alert-strip-tag">Alert</span>
          <div className="alert-strip-text">
            <strong>{strip.title}</strong>
            {strip.message && <span> {strip.message}</span>}
          </div>
          {critical.length > 1 && <span className="alert-strip-more">+{critical.length - 1} more</span>}
          <button
            type="button"
            className="alert-strip-dismiss"
            onClick={() => critical.forEach((t) => dismissToast(t.id))}
            aria-label="Dismiss alert"
          >
            <X size={14} strokeWidth={2} />
          </button>
        </div>
      )}
      {stack.length > 0 && (
        <div className="toast-stack">
          {stack.map((toast) => (
            <div key={toast.id} className={`toast-card${toast.tier === "critical" ? " toast-card-critical" : ""}${toast.flood ? " toast-card-flood" : ""}`}>
              <div className="toast-card-body">
                <p className="toast-card-title">{toast.title}</p>
                {toast.message && <p className="toast-card-message">{toast.message}</p>}
              </div>
              <button type="button" className="toast-card-dismiss" onClick={() => dismissToast(toast.id)} aria-label="Dismiss">
                <X size={13} strokeWidth={2} />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export default ToastStack;
