import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2 } from "lucide-react";

import { presentDeletionImpact } from "@/application/academy/presenters";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

/**
 * What deleting one module would destroy.
 *
 * A component rather than a prop so the query is **lazy**: this is rendered as
 * a dialog's body, and Radix does not mount dialog content until it opens, so
 * the counts are read when somebody actually asks — not once per card on a
 * screen that lists the whole library.
 *
 * `useQuery` rather than `useSuspenseQuery` for the same reason: a suspending
 * read here would throw the whole grid into its loading state to fill in a
 * dialog nobody has agreed to yet.
 */
export function ModuleDeletionImpact({ moduleId }: { moduleId: Id<"modules"> }) {
  const { data } = useQuery(convexQuery(api.modules.deletionImpact, { moduleId }));

  if (data === undefined) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Checking what is in this module…
      </p>
    );
  }

  const impact = presentDeletionImpact(data);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{impact.contentLine}</p>

      {impact.peopleLine === null ? null : (
        <div className="flex items-start gap-3 rounded-2xl border border-gold/40 bg-gold-soft/40 p-5">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-primary-deep" />
          <div>
            <p className="text-sm font-semibold text-foreground">This module is in use</p>
            <p className="mt-1 text-sm text-muted-foreground">{impact.peopleLine}</p>
          </div>
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        Badges, XP and CPTD points people already earned are not taken back, and this cannot be
        undone.
      </p>
    </div>
  );
}
