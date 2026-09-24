import { useState } from "react";
import { Loader2, type LucideIcon } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * Confirm something that cannot be undone.
 *
 * The general form of `bulk-assign-dialog.tsx`, which stays as it is because
 * its body is an argument about compliance arithmetic rather than a warning.
 * This one is for deletes: it states what will go, in the house gradient, and
 * does nothing until the button is pressed.
 *
 * Prop-driven and Convex-free, like every other dialog here — the route owns
 * the mutation and the error toast.
 */
export function ConfirmDialog({
  children,
  icon: Icon,
  title,
  description,
  body,
  confirmLabel,
  tone = "destructive",
  disabled = false,
  onConfirm,
}: {
  children: React.ReactNode;
  icon: LucideIcon;
  title: string;
  description: string;
  /** Anything more the reader needs before agreeing. */
  body?: React.ReactNode;
  confirmLabel: string;
  tone?: "destructive" | "primary";
  disabled?: boolean;
  onConfirm: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  async function confirm() {
    if (saving) return;
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
        // Closing mid-write would hide a delete that is still going.
        if (saving) return;
        setOpen(next);
      }}
    >
      <DialogTrigger asChild disabled={disabled}>
        {children}
      </DialogTrigger>
      <DialogContent className="max-w-lg gap-0 overflow-hidden border-border bg-card p-0">
        <DialogHeader className="border-b border-border bg-gradient-to-br from-primary via-primary-deep to-[#173650] px-6 py-6 sm:px-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold text-primary-deep shadow-lg">
            <Icon className="h-6 w-6" />
          </div>
          <DialogTitle className="mt-4 text-2xl font-bold text-white">{title}</DialogTitle>
          <DialogDescription className="mt-2 text-primary-foreground/80">
            {description}
          </DialogDescription>
        </DialogHeader>

        {body === undefined ? null : <div className="px-6 py-6 sm:px-8">{body}</div>}

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
            onClick={() => void confirm()}
            disabled={saving}
            className={cn(
              "inline-flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-semibold disabled:opacity-60",
              tone === "destructive"
                ? "bg-destructive text-white hover:bg-destructive/90"
                : "bg-primary text-primary-foreground hover:bg-primary-deep",
            )}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {confirmLabel}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
