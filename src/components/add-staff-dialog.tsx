import { useState } from "react";
import { UserPlus } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Create a staff profile.
 *
 * Prop-driven and Convex-free, like the other dialogs: the route owns the
 * mutation and passes the phase list in. `onCreate` is awaited so the dialog
 * closes only once the write has actually landed — a dialog that closes on
 * click looks identical to one that saved, which is how the old screens came to
 * report success for nothing.
 *
 * The fields here are exactly the ones a person can be *given*. Compliance,
 * CPTD points and XP are earned from enrollment rows, so there is deliberately
 * no input for them — a form that could type them in is a form that can make
 * the dashboard lie.
 */
export type PhaseOption = { id: string; name: string };

export type NewStaffInput = {
  honorific: string;
  firstName: string;
  lastName: string;
  preferredName: string;
  email: string;
  jobTitle: string;
  accessRole: "staff" | "smt_admin";
  phaseId: string;
};

const ROLE_OPTIONS: { id: NewStaffInput["accessRole"]; label: string; desc: string }[] = [
  { id: "staff", label: "Staff", desc: "Takes modules. No access to this console." },
  { id: "smt_admin", label: "SMT admin", desc: "Full access to the admin console." },
];

export function AddStaffDialog({
  children,
  phases,
  onCreate,
}: {
  children: React.ReactNode;
  phases: PhaseOption[];
  onCreate: (input: NewStaffInput) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const blank: NewStaffInput = {
    honorific: "",
    firstName: "",
    lastName: "",
    preferredName: "",
    email: "",
    jobTitle: "",
    accessRole: "staff",
    phaseId: phases[0]?.id ?? "",
  };
  const [form, setForm] = useState<NewStaffInput>(blank);

  const set = <K extends keyof NewStaffInput>(key: K, value: NewStaffInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const ready =
    form.firstName.trim().length > 0 &&
    form.lastName.trim().length > 0 &&
    form.email.trim().length > 0 &&
    form.jobTitle.trim().length > 0 &&
    form.phaseId.length > 0;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || saving) return;
    setSaving(true);
    try {
      await onCreate(form);
      setForm(blank);
      setOpen(false);
    } catch {
      // The route surfaces the server's message as a toast. Staying open with
      // the values intact is the point: a duplicate email should not cost
      // somebody the whole form.
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!saving) setOpen(next);
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-2xl gap-0 overflow-hidden border-border bg-card p-0">
        <DialogHeader className="border-b border-border bg-gradient-to-br from-primary via-primary-deep to-[#173650] px-6 py-6 sm:px-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold text-primary-deep shadow-lg">
            <UserPlus className="h-6 w-6" />
          </div>
          <DialogTitle className="mt-4 text-2xl font-bold text-white">
            Add a staff member
          </DialogTitle>
          <DialogDescription className="mt-2 text-primary-foreground/80">
            Creates the profile. It does not create a password — the staff member sets that up
            themselves at first sign-in, using this email address.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-6 p-6 sm:p-8">
          <div className="grid gap-4 sm:grid-cols-[6rem_1fr_1fr]">
            <label className="block space-y-2">
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Title
              </span>
              <input
                value={form.honorific}
                onChange={(e) => set("honorific", e.target.value)}
                placeholder="Mr."
                className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none focus:border-primary"
              />
            </label>
            <label className="block space-y-2">
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                First name
              </span>
              <input
                value={form.firstName}
                onChange={(e) => set("firstName", e.target.value)}
                required
                className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none focus:border-primary"
              />
            </label>
            <label className="block space-y-2">
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Last name
              </span>
              <input
                value={form.lastName}
                onChange={(e) => set("lastName", e.target.value)}
                required
                className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none focus:border-primary"
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-2">
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                School email
              </span>
              <input
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                required
                autoCapitalize="none"
                spellCheck={false}
                placeholder="name.surname@cliffview.example"
                className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none focus:border-primary"
              />
            </label>
            <label className="block space-y-2">
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Job title
              </span>
              <input
                value={form.jobTitle}
                onChange={(e) => set("jobTitle", e.target.value)}
                required
                placeholder="Teacher"
                className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none focus:border-primary"
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-2">
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Phase
              </span>
              <select
                value={form.phaseId}
                onChange={(e) => set("phaseId", e.target.value)}
                required
                className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none focus:border-primary"
              >
                {phases.map((phase) => (
                  <option key={phase.id} value={phase.id}>
                    {phase.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-2">
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Preferred name
              </span>
              <input
                value={form.preferredName}
                onChange={(e) => set("preferredName", e.target.value)}
                placeholder="Optional"
                className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none focus:border-primary"
              />
            </label>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Access
            </legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {ROLE_OPTIONS.map((role) => (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => set("accessRole", role.id)}
                  className={`rounded-2xl border p-4 text-left transition-colors ${
                    form.accessRole === role.id
                      ? "border-primary bg-primary/5"
                      : "border-border bg-background hover:border-primary/50"
                  }`}
                >
                  <p className="text-sm font-semibold text-foreground">{role.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{role.desc}</p>
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              An SMT admin still has to set up their own password before they can sign in, and an
              operator has to open that window for them.
            </p>
          </fieldset>

          <div className="flex justify-end gap-3 border-t border-border pt-6">
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
              disabled={!ready || saving}
              className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-deep disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Creating…" : "Create profile"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
