import { useMemo, useState } from "react";
import { BookOpen, Check, Search } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Assign modules to one staff member.
 *
 * Prop-driven and Convex-free, like `AddStaffDialog`: the route owns the
 * mutation and passes the catalogue in. `onAssign` is awaited so the dialog
 * closes only once the write has actually landed.
 *
 * Every module in the catalogue is listed, including the ones the person
 * already has and the ones that are still drafts. Both are shown ticked or
 * disabled with the reason on the row rather than filtered out — a picker that
 * silently omits a module the admin can see in the library reads as a bug, and
 * "why is Module 04 missing" is a support question nobody needs.
 */
export type AssignableModule = {
  id: string;
  number: string;
  title: string;
  category: string;
  durationMinutes: number;
  cptdPoints: number;
  publishState: "draft" | "published" | "archived";
  /** Already on this person's tracker. */
  assigned: boolean;
  /** Published and not yet assigned — the only rows that can be ticked. */
  canAssign: boolean;
};

export function AssignModulesDialog({
  children,
  modules,
  staffName,
  onAssign,
}: {
  children: React.ReactNode;
  modules: AssignableModule[];
  staffName: string;
  onAssign: (moduleIds: string[]) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle.length === 0) return modules;
    return modules.filter(
      (module) =>
        module.title.toLowerCase().includes(needle) ||
        module.category.toLowerCase().includes(needle) ||
        module.number.toLowerCase().includes(needle),
    );
  }, [modules, query]);

  const selectable = visible.filter((module) => module.canAssign);
  const allPicked = selectable.length > 0 && selectable.every((module) => picked.has(module.id));

  function toggle(id: string) {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Applies to the filtered rows only, so it never assigns something offscreen. */
  function toggleAll() {
    setPicked((current) => {
      const next = new Set(current);
      for (const module of selectable) {
        if (allPicked) next.delete(module.id);
        else next.add(module.id);
      }
      return next;
    });
  }

  function reset() {
    setPicked(new Set());
    setQuery("");
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (picked.size === 0 || saving) return;
    setSaving(true);
    try {
      await onAssign([...picked]);
      reset();
      setOpen(false);
    } catch {
      // The route surfaces the server's message as a toast. Staying open with
      // the ticks intact means one refused module does not cost the whole
      // selection.
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (saving) return;
        if (!next) reset();
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-2xl gap-0 overflow-hidden border-border bg-card p-0">
        <DialogHeader className="border-b border-border bg-gradient-to-br from-primary via-primary-deep to-[#173650] px-6 py-6 sm:px-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold text-primary-deep shadow-lg">
            <BookOpen className="h-6 w-6" />
          </div>
          <DialogTitle className="mt-4 text-2xl font-bold text-white">Assign modules</DialogTitle>
          <DialogDescription className="mt-2 text-primary-foreground/80">
            Adds every module you tick to the tracker for {staffName}, at nought percent. Compliance
            is the average across everything they have been given, so assigning work lowers it until
            the work is done.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex max-h-[65vh] flex-col">
          <div className="flex flex-wrap items-center gap-3 border-b border-border px-6 py-4 sm:px-8">
            <label className="relative flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search modules"
                className="w-full rounded-2xl border border-input bg-background py-2.5 pl-11 pr-4 text-sm outline-none focus:border-primary"
              />
            </label>
            <button
              type="button"
              onClick={toggleAll}
              disabled={selectable.length === 0}
              className="rounded-2xl border border-border px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50"
            >
              {allPicked ? "Clear all" : `Select all (${selectable.length})`}
            </button>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto px-6 py-4 sm:px-8">
            {visible.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {modules.length === 0
                  ? "There are no modules in the library yet."
                  : "No module matches that search."}
              </p>
            ) : (
              visible.map((module) => {
                const checked = picked.has(module.id);
                const reason = module.assigned
                  ? "Already assigned"
                  : module.publishState === "published"
                    ? null
                    : "Draft — publish it first";

                return (
                  <label
                    key={module.id}
                    className={`flex items-start gap-4 rounded-2xl border p-4 transition-colors ${
                      module.canAssign
                        ? checked
                          ? "cursor-pointer border-primary bg-primary/5"
                          : "cursor-pointer border-border bg-background hover:border-primary/50"
                        : "cursor-not-allowed border-border bg-muted/40 opacity-70"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked || module.assigned}
                      disabled={!module.canAssign}
                      onChange={() => toggle(module.id)}
                      className="mt-1 h-4 w-4 shrink-0"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                          {module.number}
                        </span>
                        <span className="text-sm font-semibold text-foreground">
                          {module.title}
                        </span>
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {module.category} · {module.durationMinutes} min · {module.cptdPoints} CPTD
                        {module.cptdPoints === 1 ? " point" : " points"}
                      </span>
                    </span>
                    {reason === null ? null : (
                      <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-muted px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                        {module.assigned ? <Check className="h-3 w-3" /> : null}
                        {reason}
                      </span>
                    )}
                  </label>
                );
              })
            )}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-5 sm:px-8">
            <p className="text-sm text-muted-foreground">
              {picked.size === 0
                ? "Nothing selected"
                : `${picked.size} module${picked.size === 1 ? "" : "s"} selected`}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={saving}
                className="rounded-2xl border border-border px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={picked.size === 0 || saving}
                className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-deep disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Assigning…" : "Assign selected"}
              </button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
