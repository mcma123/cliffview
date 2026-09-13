import { useEffect, useState } from "react";

import { CliffviewShield } from "@/components/cliffview-logo";
import { cn } from "@/lib/utils";

/**
 * What fills the screen while a route is still resolving.
 *
 * Every admin route reads with `useSuspenseQuery`, which suspends the component
 * on first render. Until this existed the router had no pending component and
 * therefore no Suspense fallback, so React rendered **nothing** — switching
 * between modules blanked the window to white for as long as the query took.
 *
 * Two deliberate details:
 *
 * - The background paints immediately, the mark only after `delayMs`. A fast
 *   navigation resolves inside that window and shows no spinner at all, so the
 *   logo never flashes on screens that were never slow. That is the difference
 *   between "loading feedback" and "a flicker on every click".
 * - It never claims progress it cannot measure. A bar that creeps to 90% and
 *   waits is a lie about a query whose duration is unknown; a rotating ring
 *   only says "still working", which is all that is true.
 */
export function LoadingScreen({
  label = "Loading",
  delayMs = 250,
  className,
}: {
  label?: string;
  /** How long to stay quietly blank before showing the mark. */
  delayMs?: number;
  className?: string;
}) {
  const [visible, setVisible] = useState(delayMs === 0);

  useEffect(() => {
    if (delayMs === 0) return;
    const timer = setTimeout(() => setVisible(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs]);

  return (
    <div
      // Painted from the first frame, so a slow route is never a white flash
      // against the app's own background.
      className={cn(
        "fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-background",
        className,
      )}
      // Announced, but only once there is something to announce. `polite` so it
      // never interrupts whatever a screen reader is already saying.
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div
        className={cn(
          "flex flex-col items-center gap-6 transition-opacity duration-500",
          visible ? "opacity-100" : "opacity-0",
        )}
      >
        <div className="relative flex h-24 w-24 items-center justify-center">
          {/* The track, so the moving arc reads as part of a ring rather than
              a stray comet. */}
          <span className="absolute inset-0 rounded-full border-2 border-border" />
          {/* One transparent side is what makes a rotating border look like an
              arc. `motion-reduce` stops it for anyone who asked for less. */}
          <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-gold motion-reduce:animate-none" />
          <CliffviewShield className="h-14 w-14 animate-pulse shadow-none motion-reduce:animate-none" />
        </div>

        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold">
            Cliffview Academy
          </p>
          <p className="mt-2 text-sm text-muted-foreground">{label}</p>
        </div>
      </div>

      {/* Present for assistive tech even before the mark fades in, so the wait
          is never silent. */}
      <span className="sr-only">{label}</span>
    </div>
  );
}
