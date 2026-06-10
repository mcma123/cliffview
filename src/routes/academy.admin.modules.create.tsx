import { createFileRoute, Link } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin-shell";
import {
  ArrowRight,
  FileText,
  Headphones,
  LayoutTemplate,
  Plus,
  Sparkles,
  Upload,
  Video,
} from "lucide-react";

export const Route = createFileRoute("/academy/admin/modules/create")({
  head: () => ({ meta: [{ title: "Create Module · Cliffview Academy" }] }),
  component: CreateModulePage,
});

const lessonDrafts = [
  {
    title: "Message triage",
    meta: "Video placeholder · 6 min",
    description: "Sort incoming parent messages by urgency, channel, and escalation risk.",
  },
  {
    title: "Response language",
    meta: "Reading + examples · 8 min",
    description: "Write responses using approved school wording and calm escalation boundaries.",
  },
  {
    title: "Meeting preparation",
    meta: "Case-study placeholder · 7 min",
    description: "Prepare facts, participants, and meeting notes before a difficult conversation.",
  },
  {
    title: "Module assessment",
    meta: "Quiz placeholder",
    description: "Five-question sign-off before the learner can mark the module complete.",
  },
];

const assetDrafts = [
  {
    title: "Lesson video",
    icon: Video,
    description: "Upload the hero video or leave a placeholder until production is ready.",
  },
  {
    title: "Narration audio",
    icon: Headphones,
    description: "Attach optional audio recaps for staff who prefer listening on mobile.",
  },
  {
    title: "Policy docs and templates",
    icon: FileText,
    description: "Link PDFs, editable templates, and worksheets that appear in the staff view.",
  },
];

function CreateModulePage() {
  return (
    <AdminShell>
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold">Module builder</p>
            <h1 className="mt-2 text-3xl font-bold text-foreground">Create a new academy module</h1>
            <p className="mt-3 max-w-3xl text-sm text-muted-foreground">
              UI-only for now. This page is designed to be the admin workflow for defining module
              structure, naming, learner-facing copy, and media placeholders before the backend
              upload flow is wired up.
            </p>
          </div>

          <Link
            to="/academy/modules/parent-communication-protocol"
            className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary-deep"
          >
            Preview learner view <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-soft text-primary-deep">
                <LayoutTemplate className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.25em] text-gold">
                  Module design
                </p>
                <h2 className="mt-1 text-2xl font-bold text-foreground">
                  Structure and positioning
                </h2>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Module name
                </span>
                <input
                  defaultValue="Parent Communication Protocol"
                  className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none ring-0"
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Category
                </span>
                <div className="rounded-2xl border border-input bg-background px-4 py-3 text-sm text-foreground">
                  Staff Development
                </div>
              </label>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Audience
                </span>
                <textarea
                  defaultValue="Teachers, grade leads, front office staff, and pastoral teams"
                  className="min-h-28 w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none"
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Outcome
                </span>
                <textarea
                  defaultValue="Give staff a clear communication structure so parent interactions stay calm, documented, and aligned with school expectations."
                  className="min-h-28 w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none"
                />
              </label>
            </div>

            <label className="mt-4 block space-y-2">
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Learner-facing description
              </span>
              <textarea
                defaultValue="A practical communication module for handling sensitive parent messages, escalations, and follow-up documentation across email, WhatsApp, and meetings."
                className="min-h-32 w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none"
              />
            </label>

            <div className="mt-6 rounded-2xl border border-dashed border-border bg-background p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.25em] text-gold">
                    Learning objectives
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    These will appear as learner-side outcome cards.
                  </p>
                </div>
                <button className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted">
                  <Plus className="h-4 w-4" /> Add objective
                </button>
              </div>

              <div className="mt-5 space-y-3">
                {[
                  "Identify when to acknowledge, escalate, or move a parent conversation offline.",
                  "Use school-approved language when responding to emotional or high-risk messages.",
                  "Attach the right supporting documents and meeting notes after each interaction.",
                ].map((objective) => (
                  <div
                    key={objective}
                    className="rounded-2xl border border-border bg-card px-4 py-3 text-sm text-foreground"
                  >
                    {objective}
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="space-y-6">
            <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold">
                Upload content
              </p>
              <div className="mt-5 space-y-3">
                {assetDrafts.map((asset) => (
                  <div
                    key={asset.title}
                    className="rounded-2xl border border-dashed border-border bg-background p-5"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                        <asset.icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-foreground">{asset.title}</h3>
                        <p className="mt-2 text-sm text-muted-foreground">{asset.description}</p>
                        <button className="mt-4 inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted">
                          <Upload className="h-4 w-4" /> Choose file
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-primary/20 bg-gradient-to-br from-primary via-primary-deep to-[#173650] p-6 text-primary-foreground shadow-xl">
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold">
                Live preview target
              </p>
              <h2 className="mt-2 text-2xl font-bold">Client-side module demo</h2>
              <p className="mt-3 text-sm text-primary-foreground/85">
                The academy-side preview route uses the same shared content shape as this builder
                UI. That keeps the admin and learner screens visually aligned while the backend is
                still pending.
              </p>
              <Link
                to="/academy/modules/parent-communication-protocol"
                className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-gold px-4 py-3 text-sm font-semibold text-primary-deep hover:bg-[#f2cb58]"
              >
                Open learner demo <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </section>
        </div>

        <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold">
                Lesson builder
              </p>
              <h2 className="mt-2 text-2xl font-bold text-foreground">Design the module journey</h2>
            </div>
            <button className="inline-flex items-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-deep">
              <Plus className="h-4 w-4" /> Add lesson
            </button>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {lessonDrafts.map((lesson, index) => (
              <div
                key={lesson.title}
                className="rounded-2xl border border-border bg-background p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-gold">
                      Lesson {index + 1}
                    </p>
                    <h3 className="mt-2 text-lg font-semibold text-foreground">{lesson.title}</h3>
                    <p className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">
                      {lesson.meta}
                    </p>
                  </div>
                  <button className="rounded-xl border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted">
                    Edit
                  </button>
                </div>
                <p className="mt-4 text-sm text-muted-foreground">{lesson.description}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-gold-soft px-4 py-2 text-sm font-semibold text-primary-deep">
            <Sparkles className="h-4 w-4" /> Demo draft ready for preview
          </div>
          <div className="flex flex-wrap gap-3">
            <button className="rounded-2xl border border-border bg-card px-5 py-3 text-sm font-semibold text-foreground hover:bg-muted">
              Save draft
            </button>
            <Link
              to="/academy/admin/modules/parent-communication-protocol"
              className="rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary-deep"
            >
              Open module editor
            </Link>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
