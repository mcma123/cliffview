import { Link } from "@tanstack/react-router";

/**
 * A full-page message: loading, signed out, refused, or empty.
 *
 * Prop-driven and Convex-free, like everything else in `src/components`. The
 * learner routes decide *when* to show one; this only decides what it looks
 * like, so the four states read consistently across every page.
 */
export function PageNotice({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: { label: string; to: string };
}) {
  return (
    <div className="mx-auto max-w-xl rounded-3xl border border-border bg-card p-10 text-center shadow-sm">
      <h2 className="text-xl font-bold text-foreground">{title}</h2>
      {body === undefined ? null : <p className="mt-3 text-sm text-muted-foreground">{body}</p>}
      {action === undefined ? null : (
        <Link
          to={action.to}
          className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary-deep"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}
