import { Link } from "@tanstack/react-router";
import { ArrowLeft, Eye } from "lucide-react";

/**
 * Shown on the learner screens while an admin previews a module.
 *
 * Prop-driven and Convex-free. The server decides whether this is a preview —
 * an admin reading a module they are not assigned — and the route only passes
 * the flag through, so the banner cannot claim "nothing is recorded" on a page
 * that is in fact recording.
 */
export function PreviewBanner({ adminHref }: { adminHref: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gold/40 bg-gold-soft/40 px-5 py-4">
      <p className="flex items-center gap-2 text-sm text-foreground">
        <Eye className="h-4 w-4 shrink-0 text-gold" />
        <span>
          <span className="font-semibold">Learner preview.</span>{" "}
          <span className="text-muted-foreground">
            This is what staff see. Nothing you do here is recorded.
          </span>
        </span>
      </p>
      <Link
        to={adminHref}
        className="inline-flex items-center gap-2 rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-deep"
      >
        <ArrowLeft className="h-4 w-4" /> Back to admin
      </Link>
    </div>
  );
}
