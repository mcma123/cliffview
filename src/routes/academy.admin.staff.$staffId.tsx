import { convexQuery, useConvexMutation } from "@convex-dev/react-query";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, BookOpen, CheckCircle, Clock, Save, UserX } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { presentAdminStaffDetail } from "@/application/academy/presenters";
import { AdminShell } from "@/components/admin-shell";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export const Route = createFileRoute("/academy/admin/staff/$staffId")({
  head: () => ({ meta: [{ title: "Staff Profile · Cliffview Academy" }] }),
  // No loader prefetch: gated query, no server identity. See academy.admin.tsx.
  loader: () => ({ now: Date.now() }),
  component: AdminStaffDetailComponent,
});

type AssignableRole = "staff" | "smt_admin";

function AdminStaffDetailComponent() {
  const { staffId } = Route.useParams();
  const { now } = Route.useLoaderData();
  const { data: detail } = useSuspenseQuery(
    convexQuery(api.staff.detail, { staffId: staffId as Id<"users"> }),
  );
  const data = presentAdminStaffDetail(detail, now);
  const id = detail.user._id;

  const updateStaff = useMutation({ mutationFn: useConvexMutation(api.staff.update) });
  const setStatus = useMutation({ mutationFn: useConvexMutation(api.staff.setEmploymentStatus) });

  const [form, setForm] = useState(data.form);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function save() {
    setSaving(true);
    try {
      await updateStaff.mutateAsync({
        staffId: id,
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        jobTitle: form.jobTitle,
        accessRole: form.accessRole as AssignableRole,
        phaseId: form.phaseId,
        // Sent even when empty: the mutation reads an empty string as "clear
        // this", which is how a mistyped honorific gets removed.
        honorific: form.honorific,
        preferredName: form.preferredName,
      });
      toast.success("Profile saved.");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not save the profile.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus() {
    const next = data.isActive ? "inactive" : "active";
    try {
      await setStatus.mutateAsync({ staffId: id, employmentStatus: next });
      toast.success(next === "active" ? "Account reinstated." : "Account deactivated.");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "That did not work.");
    }
  }

  return (
    <AdminShell>
      <div className="mx-auto max-w-5xl space-y-8 animate-in fade-in duration-500">
        <Link
          to="/academy/admin/staff"
          className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-gold"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Staff Directory
        </Link>

        <header className="flex flex-col items-start gap-6 rounded-3xl border border-border bg-card p-8 shadow-sm sm:flex-row sm:items-center">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-primary text-3xl font-black text-primary-foreground">
            {data.initials}
          </div>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-black tracking-tight text-foreground">{data.name}</h1>
              {data.isActive ? null : (
                <span className="rounded-full bg-muted px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Inactive
                </span>
              )}
            </div>
            <p className="mt-1 text-lg font-medium text-muted-foreground">
              {data.jobTitle} · {data.accessRoleLabel} · {data.phaseName}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{data.email}</p>
          </div>
          <div className="mt-4 flex w-full flex-col items-start gap-1 sm:mt-0 sm:w-auto sm:items-end">
            <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Compliance Rating
            </p>
            {data.modules.length === 0 ? (
              <p className="text-sm text-muted-foreground">{data.complianceLabel}</p>
            ) : (
              <div className="flex w-full items-center gap-4">
                <div className="h-3 w-full flex-1 overflow-hidden rounded-full bg-muted sm:w-32">
                  <div
                    className={`h-full rounded-full ${
                      data.compliancePercent >= 80
                        ? "bg-success"
                        : data.compliancePercent >= 50
                          ? "bg-gold"
                          : "bg-destructive"
                    }`}
                    style={{ width: `${data.compliancePercent}%` }}
                  />
                </div>
                <span className="text-2xl font-black text-foreground">
                  {data.compliancePercent}%
                </span>
              </div>
            )}
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-4">
          {data.stats.map((stat) => (
            <article
              key={stat.label}
              className="rounded-3xl border border-border bg-card p-6 shadow-sm"
            >
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {stat.label}
              </p>
              <p className="mt-3 text-3xl font-black text-foreground">{stat.value}</p>
            </article>
          ))}
        </section>

        <section className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold">Profile</p>
              <h2 className="mt-2 text-2xl font-bold text-foreground">Edit this staff member</h2>
            </div>
            <button
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary-deep disabled:opacity-60"
            >
              <Save className="h-4 w-4" /> {saving ? "Saving..." : "Save changes"}
            </button>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-[6rem_1fr_1fr]">
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
                className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none focus:border-primary"
              />
            </label>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block space-y-2">
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                School email
              </span>
              <input
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                autoCapitalize="none"
                spellCheck={false}
                className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none focus:border-primary"
              />
              <span className="block text-xs text-muted-foreground">
                This is the address they sign in with. Changing it changes their login.
              </span>
            </label>
            <label className="block space-y-2">
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Job title
              </span>
              <input
                value={form.jobTitle}
                onChange={(e) => set("jobTitle", e.target.value)}
                className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none focus:border-primary"
              />
            </label>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <label className="block space-y-2">
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Phase
              </span>
              <select
                value={form.phaseId}
                onChange={(e) => set("phaseId", e.target.value as Id<"phases">)}
                className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none focus:border-primary"
              >
                {data.phaseOptions.map((phase) => (
                  <option key={phase.id} value={phase.id}>
                    {phase.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-2">
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Access role
              </span>
              <select
                value={form.accessRole}
                onChange={(e) => set("accessRole", e.target.value as AssignableRole)}
                className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none focus:border-primary"
              >
                <option value="staff">Staff</option>
                <option value="smt_admin">SMT admin</option>
              </select>
              <span className="block text-xs text-muted-foreground">
                You cannot change your own role.
              </span>
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

          <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6">
            <div>
              <p className="text-sm font-semibold text-foreground">
                {data.isActive ? "Deactivate this account" : "Reinstate this account"}
              </p>
              <p className="mt-1 max-w-xl text-xs text-muted-foreground">
                {data.isActive
                  ? "Ends access immediately and blocks sign-in, but keeps their training record. Profiles are never deleted — enrollments, progress and the audit log all reference them."
                  : "Restores access. Their password and training history were kept."}
              </p>
            </div>
            <button
              onClick={toggleStatus}
              className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-semibold ${
                data.isActive
                  ? "border-destructive/40 text-destructive hover:bg-destructive/10"
                  : "border-border text-foreground hover:bg-muted"
              }`}
            >
              <UserX className="h-4 w-4" /> {data.isActive ? "Deactivate" : "Reinstate"}
            </button>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="flex items-center gap-2 text-lg font-black tracking-tight text-foreground">
            <BookOpen className="h-5 w-5 text-gold" />
            Module Development Tracker
          </h2>

          <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="whitespace-nowrap px-6 py-4 font-bold uppercase tracking-wider text-muted-foreground">
                      Module Name
                    </th>
                    <th className="whitespace-nowrap px-6 py-4 font-bold uppercase tracking-wider text-muted-foreground">
                      Category
                    </th>
                    <th className="whitespace-nowrap px-6 py-4 font-bold uppercase tracking-wider text-muted-foreground">
                      Status
                    </th>
                    <th className="whitespace-nowrap px-6 py-4 font-bold uppercase tracking-wider text-muted-foreground">
                      Score
                    </th>
                    <th className="whitespace-nowrap px-6 py-4 font-bold uppercase tracking-wider text-muted-foreground">
                      Last Accessed
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.modules.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-10 text-center text-muted-foreground">
                        No modules are assigned to this staff member yet.
                      </td>
                    </tr>
                  ) : (
                    data.modules.map((mod) => (
                      <tr key={mod.id} className="group transition-colors hover:bg-muted/40">
                        <td className="px-6 py-4">
                          <Link
                            to={mod.href}
                            className="font-bold text-foreground transition-colors hover:text-primary"
                          >
                            {mod.moduleTitle}
                          </Link>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-muted-foreground">
                          {mod.category}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <div className="flex items-center gap-2">
                            {mod.status === "completed" ? (
                              <CheckCircle className="h-4 w-4 text-success" />
                            ) : mod.status === "in_progress" ? (
                              <Clock className="h-4 w-4 text-gold" />
                            ) : (
                              <div className="h-2 w-2 rounded-full bg-muted-foreground" />
                            )}
                            <span className="font-semibold text-foreground">{mod.statusLabel}</span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 font-bold text-foreground">
                          {mod.scoreLabel}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-muted-foreground">
                          {mod.lastAccessedLabel}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </AdminShell>
  );
}
