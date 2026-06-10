import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";

export function AddObjectiveDialog({
  children,
  onAddObjective,
}: {
  children: React.ReactNode;
  onAddObjective: (objective: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [objective, setObjective] = useState("");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-xl gap-0 p-0 overflow-hidden border-border bg-card">
        <DialogHeader className="border-b border-border bg-gradient-to-br from-primary via-primary-deep to-[#173650] px-6 py-6 sm:px-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold text-primary-deep shadow-lg">
            <Plus className="h-6 w-6" />
          </div>
          <DialogTitle className="mt-4 text-2xl font-bold text-white">Add learning objective</DialogTitle>
          <DialogDescription className="mt-2 text-primary-foreground/80">
            Define a specific outcome that staff will achieve by completing this module.
          </DialogDescription>
        </DialogHeader>

        <div className="p-6 sm:p-8 space-y-6">
          <label className="block space-y-2">
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Objective description
            </span>
            <textarea
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              placeholder="e.g. Identify when to escalate a parent conversation..."
              className="min-h-24 w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none transition-colors focus:border-primary"
            />
          </label>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-border bg-muted/20 px-6 py-4 sm:px-8">
          <button
            onClick={() => setOpen(false)}
            className="rounded-2xl border border-border px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (objective.trim()) {
                onAddObjective(objective.trim());
              }
              setOpen(false);
              setObjective("");
            }}
            className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-deep"
          >
            Add objective
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
