import { convexQuery, useConvexMutation } from "@convex-dev/react-query";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Award, ChevronRight, Search, TrendingUp, UserPlus, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { presentAdminStaffDirectory } from "@/application/academy/presenters";
import { AddStaffDialog } from "@/components/add-staff-dialog";
import { AdminShell } from "@/components/admin-shell";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export const Route = createFileRoute("/academy/admin/staff/")({
  head: () => ({ meta: [{ title: "Staff Directory · Cliffview Academy" }] }),
  // No loader prefetch: this is a gated query and Convex Auth keeps its token
  // in localStorage, so there is no identity on the server. Loaders may return
  // only request-local values.
  loader: () => ({ now: Date.now() }),
  component: AdminStaffIndexComponent,
});

function AdminStaffIndexComponent() {
  const { now } = Route.useLoaderData();
  const { data: directory } = useSuspenseQuery(convexQuery(api.staff.directory, {}));
  const data = presentAdminStaffDirectory(directory, now);

  const createStaff = useMutation({ mutationFn: useConvexMutation(api.staff.create) });
  const [search, setSearch] = useState("");

  // The search box was decorative before. Filtering here rather than in the
  // backend keeps it instant and needs no index: the whole directory is already
  // in memory and a primary school has a few dozen staff.
  const needle = search.trim().toLowerCase();
  const rows =
    needle.length === 0
      ? data.rows
      : data.rows.filter((row) =>
          [row.name, row.email, row.jobTitle, row.phaseName]
            .join(" ")
            .toLowerCase()
            .includes(needle),
        );

  return (
    <AdminShell>
      <div className="mx-auto max-w-6xl space-y-8 animate-in fade-in duration-500">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-gold">
              Staff Management
            </p>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-foreground sm:text-4xl">
              Staff Directory
            </h1>
            <p className="mt-2 text-base text-muted-foreground">
              Create and edit staff profiles, and track compliance across all phases.
            </p>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search staff..."
                className="w-full rounded-xl border border-border bg-card py-2 pl-9 pr-4 text-sm font-medium text-foreground outline-none transition-colors hover:border-gold focus:border-gold focus:ring-1 focus:ring-gold"
              />
            </div>
            <AddStaffDialog
              phases={data.phaseOptions}
              onCreate={async (input) => {
                try {
                  await createStaff.mutateAsync({
                    firstName: input.firstName,
                    lastName: input.lastName,
                    email: input.email,
                    jobTitle: input.jobTitle,
                    accessRole: input.accessRole,
                    phaseId: input.phaseId as Id<"phases">,
                    ...(input.honorific.trim() === "" ? {} : { honorific: input.honorific }),
                    ...(input.preferredName.trim() === ""
                      ? {}
                      : { preferredName: input.preferredName }),
                  });
                  toast.success(`${input.firstName} ${input.lastName} added.`);
                } catch (caught) {
                  toast.error(
                    caught instanceof Error ? caught.message : "Could not create the profile.",
                  );
                  // Rethrown so the dialog stays open with the values intact.
                  throw caught;
                }
              }}
            >
              <button className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-deep">
                <UserPlus className="h-4 w-4" /> Add staff
              </button>
            </AddStaffDialog>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-3">
          <article className="rounded-3xl border border-border bg-card p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                Active Staff
              </p>
            </div>
            <p className="mt-4 text-4xl font-black text-foreground">{data.summary.totalStaff}</p>
            <p className="mt-1 text-sm font-medium text-muted-foreground">
              {data.summary.inactiveStaff === 0
                ? "Nobody deactivated"
                : `${data.summary.inactiveStaff} deactivated`}
            </p>
          </article>

          <article className="rounded-3xl border border-border bg-card p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-soft">
                <TrendingUp className="h-5 w-5 text-gold" />
              </div>
              <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                Avg. Compliance
              </p>
            </div>
            <p className="mt-4 text-4xl font-black text-foreground">
              {data.summary.avgCompliance}%
            </p>
            <p className="mt-1 text-sm font-medium text-muted-foreground">Active staff only</p>
          </article>

          <article className="rounded-3xl border border-border bg-card p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-success/15">
                <Award className="h-5 w-5 text-success" />
              </div>
              <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                High Performers
              </p>
            </div>
            <p className="mt-4 text-4xl font-black text-foreground">
              {data.summary.highPerformers}
            </p>
            <p className="mt-1 text-sm font-medium text-success">Staff with &gt; 80% compliance</p>
          </article>
        </section>

        <section className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="whitespace-nowrap px-6 py-4 font-bold uppercase tracking-wider text-muted-foreground">
                    Staff Member
                  </th>
                  <th className="whitespace-nowrap px-6 py-4 font-bold uppercase tracking-wider text-muted-foreground">
                    Role &amp; Phase
                  </th>
                  <th className="whitespace-nowrap px-6 py-4 font-bold uppercase tracking-wider text-muted-foreground">
                    Compliance
                  </th>
                  <th className="whitespace-nowrap px-6 py-4 font-bold uppercase tracking-wider text-muted-foreground">
                    Modules
                  </th>
                  <th className="whitespace-nowrap px-6 py-4 font-bold uppercase tracking-wider text-muted-foreground">
                    Last Active
                  </th>
                  <th className="whitespace-nowrap px-6 py-4 text-right font-bold uppercase tracking-wider text-muted-foreground">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-muted-foreground">
                      {data.rows.length === 0
                        ? "No staff profiles yet. Use Add staff to create the first one."
                        : `Nobody matches "${search.trim()}".`}
                    </td>
                  </tr>
                ) : (
                  rows.map((staff) => (
                    <tr key={staff.id} className="group transition-colors hover:bg-muted/40">
                      <td className="whitespace-nowrap px-6 py-4">
                        <div className="flex items-center gap-3">
                          {/* Both initials, from the two name fields. The old
                              avatar showed only name[0] — the honorific's
                              first letter for anyone with one. */}
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                            {staff.initials}
                          </div>
                          <div>
                            <p className="font-bold text-foreground">{staff.name}</p>
                            <p className="text-xs text-muted-foreground">{staff.email}</p>
                          </div>
                          {staff.isActive ? null : (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                              Inactive
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <p className="font-medium text-foreground">{staff.jobTitle}</p>
                        <p className="text-xs text-muted-foreground">
                          {staff.accessRoleLabel} · {staff.phaseName}
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        {staff.assignedModules === 0 ? (
                          <span className="text-muted-foreground">{staff.complianceLabel}</span>
                        ) : (
                          <div className="flex items-center gap-3">
                            <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
                              <div
                                className={`h-full rounded-full ${
                                  staff.compliancePercent >= 80
                                    ? "bg-success"
                                    : staff.compliancePercent >= 50
                                      ? "bg-gold"
                                      : "bg-destructive"
                                }`}
                                style={{ width: `${staff.compliancePercent}%` }}
                              />
                            </div>
                            <span className="font-bold text-foreground">
                              {staff.compliancePercent}%
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 font-medium text-foreground">
                        {staff.completedModules} / {staff.assignedModules}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-muted-foreground">
                        {staff.lastActiveLabel}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-right">
                        <Link
                          to={staff.href}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background text-foreground transition-colors hover:border-gold hover:text-gold"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AdminShell>
  );
}
