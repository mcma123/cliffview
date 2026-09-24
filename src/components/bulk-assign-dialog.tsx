import { useState } from "react";
import { AlertTriangle, Loader2, Users } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Confirm giving every active staff member every published module.
 *
 * Prop-driven and Convex-free: the route owns the mutation and passes the two
 * counts in.
 *
 * It confirms rather than firing on click, and not because the action is
 * dangerous — granting is additive and never touches progress. It confirms
 * because it needs to state its arithmetic first. An admin pressing this will
 * watch the dashboard's average compliance drop, and unless the screen told
 * them why, that reads as a bug rather than as the honest consequence of
 * putting work on people's trackers.
 */
export function BulkAssignDialog({
  children,
  staffCount,
  moduleCount,
  onConfirm,
}: {
  children: React.ReactNode;
  staffCount: number;
  moduleCount: number;
  onConfirm: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const nothingToDo = staffCount === 0 || moduleCount === 0;

  async function confirm() {
    if (saving || nothingToDo) return;
    setSaving(true);
    try {
      await onConfirm();
      setOpen(false);
    } catch {
      // The route surfaces the server's own message as a toast. Staying open
      // means a refusal does not look like the dialog simply dismissed itself.
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Closing mid-write would hide a run that is still going.
        if (saving) return;
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-lg gap-0 overflow-hidden border-border bg-card p-0">
        <DialogHeader className="border-b border-border bg-gradient-to-br from-primary via-primary-deep to-[#173650] px-6 py-6 sm:px-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold text-primary-deep shadow-lg">
            <Users className="h-6 w-6" />
          </div>
          <DialogTitle className="mt-4 text-2xl font-bold text-white">
            Assign every module to every staff member
          </DialogTitle>
          <DialogDescription className="mt-2 text-primary-foreground/80">
            {nothingToDo
              ? "There is nothing to assign yet."
              : `Puts all ${moduleCount} published module${moduleCount === 1 ? "" : "s"} on the tracker of all ${staffCount} active staff member${staffCount === 1 ? "" : "s"}.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-6 py-6 sm:px-8">
          {nothingToDo ? (
            <p className="text-sm text-muted-foreground">
              {moduleCount === 0
                ? "No modules are published. Publish one first — drafts cannot be assigned."
                : "There are no active staff to assign modules to."}
            </p>
          ) : (
            <>
              <div className="flex items-start gap-3 rounded-2xl border border-gold/40 bg-gold-soft/40 p-5">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-primary-deep" />
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Average compliance will drop
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Compliance is the average across everything somebody has been given, so new work
                    lowers it until the work is done. That is the honest number, not a fault.
                  </p>
                </div>
              </div>

              <ul className="space-y-1.5 text-sm text-muted-foreground">
                <li>
                  Anyone who already has a module keeps their progress — only gaps are filled.
                </li>
                <li>Drafts and archived modules are skipped.</li>
                <li>Staff who have left, and operator logins, are not included.</li>
                <li>Safe to run again: it fills what is missing and adds nothing twice.</li>
              </ul>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-border bg-muted/30 px-6 py-4 sm:px-8">
          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={saving}
            className="rounded-2xl border border-border px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={saving || nothingToDo}
            className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-deep disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Assigning…
              </>
            ) : (
              <>Assign to all {staffCount}</>
            )}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
