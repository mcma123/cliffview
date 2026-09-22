import { useState } from "react";
import { useConvexMutation } from "@convex-dev/react-query";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { api } from "../../convex/_generated/api";
import {
  MODULE_CATEGORIES,
  type ModuleCategory,
  type ModuleLessonKind,
} from "@/domain/academy/entities";
import { AdminShell } from "@/components/admin-shell";
import { useAdminViewer } from "@/hooks/use-admin-viewer";
import {
  ArrowRight,
  BookOpen,
  FileText,
  Headphones,
  LayoutTemplate,
  Plus,
  Sparkles,
  Video,
} from "lucide-react";
import { AddLessonDialog } from "@/components/add-lesson-dialog";
import { AddObjectiveDialog } from "@/components/add-objective-dialog";
import { errorMessage } from "@/lib/convex-error";
import { toast } from "sonner";

export const Route = createFileRoute("/academy/admin/modules/create")({
  head: () => ({ meta: [{ title: "Create Module · Cliffview Academy" }] }),
  component: CreateModulePage,
});

// Removed mock lessonDrafts

/**
 * What kinds of asset this module will want, as guidance only.
 *
 * Was `assetDrafts`, feeding three drag-and-drop zones on a screen where no
 * asset row exists yet, so nothing could have been uploaded. Kept as a list
 * because the guidance is genuinely useful; the zones are gone.
 */
const ASSET_KINDS_PLANNED = [
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

/**
 * A whole number, or a thrown message the caller will toast.
 *
 * Mirrors `assertModuleNumbers` in `convex/modules.ts`. The server is the
 * enforcement — it has to be, because `cptdPoints` is incremented onto a
 * teacher's XP and never recomputed — but catching it here names the field.
 */
function wholeNumber(raw: string, label: string, max?: number): number {
  const value = Number(raw.trim());
  if (raw.trim().length === 0 || !Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a whole number, zero or more.`);
  }
  if (max !== undefined && value > max) {
    throw new Error(`${label} cannot be more than ${max}.`);
  }
  return value;
}

function CreateModulePage() {
  const viewer = useAdminViewer();
  const navigate = useNavigate();
  const [objectives, setObjectives] = useState<string[]>([]);
  const [lessons, setLessons] = useState<
    { title: string; meta: string; description: string; kind: string }[]
  >([]);

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<ModuleCategory>("Core Policies");
  // Strings, so a cleared box is empty rather than NaN. Defaults match what
  // `modules.create` would fall back to, so what the form shows is what gets
  // stored — the old screen silently created every module on 0 CPTD points,
  // which meant finishing it paid no XP at all.
  const [durationMinutes, setDurationMinutes] = useState("30");
  const [cptdPoints, setCptdPoints] = useState("2");
  const [passMark, setPassMark] = useState("80");
  const [format, setFormat] = useState("Self-paced");
  const [audience, setAudience] = useState("");
  const [outcome, setOutcome] = useState("");
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);

  const createModule = useMutation({ mutationFn: useConvexMutation(api.modules.create) });
  const addObjective = useMutation({ mutationFn: useConvexMutation(api.objectives.add) });
  const createLesson = useMutation({ mutationFn: useConvexMutation(api.lessons.create) });

  /**
   * Create the module as a draft, then flush the objectives and lessons this
   * page collected against the id it returns.
   *
   * Order matters: there has to be a real parent before children can attach to
   * it. The old page held all of this in local state and threw it away on
   * navigate.
   */
  async function saveDraft(): Promise<string | null> {
    if (title.trim().length === 0) {
      toast.error("Give the module a name first.");
      return null;
    }
    setPending(true);
    try {
      const { moduleId, slug } = await createModule.mutateAsync({
        title,
        category,
        audience,
        outcome,
        description,
        durationMinutes: wholeNumber(durationMinutes, "Duration"),
        cptdPoints: wholeNumber(cptdPoints, "CPTD points"),
        passMark: wholeNumber(passMark, "Pass mark", 100),
        format,
      });
      for (const text of objectives) {
        await addObjective.mutateAsync({ moduleId, text });
      }
      for (const lesson of lessons) {
        await createLesson.mutateAsync({
          moduleId,
          title: lesson.title,
          kind: lesson.kind as ModuleLessonKind,
          summary: lesson.description,
        });
      }
      return slug;
    } catch (caught) {
      toast.error(errorMessage(caught, "Could not save the module."));
      return null;
    } finally {
      setPending(false);
    }
  }

  return (
    <AdminShell viewer={viewer}>
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold">Module builder</p>
            <h1 className="mt-2 text-3xl font-bold text-foreground">Create a new academy module</h1>
            <p className="mt-3 max-w-3xl text-sm text-muted-foreground">
              Define the module structure, naming, and learner-facing copy. Saving creates a real
              draft module along with its objectives and lessons; assets and their files are added
              afterwards from the module editor.
            </p>
          </div>

          <Link
            to="/academy/modules/$moduleSlug"
            params={{ moduleSlug: "parent-communication-protocol" }}
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
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Parent Communication Protocol"
                  className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none ring-0 focus:border-primary"
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Category
                </span>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as ModuleCategory)}
                  className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm text-foreground focus:border-primary outline-none"
                >
                  {MODULE_CATEGORIES.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <label className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Duration (minutes)
                </span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(e.target.value)}
                  className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none focus:border-primary"
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  CPTD points
                </span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={cptdPoints}
                  onChange={(e) => setCptdPoints(e.target.value)}
                  className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none focus:border-primary"
                />
                <span className="block text-[11px] text-muted-foreground">
                  Worth {Number(cptdPoints || 0) * 100} XP on completion.
                </span>
              </label>
              <label className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Delivery format
                </span>
                <input
                  value={format}
                  onChange={(e) => setFormat(e.target.value)}
                  placeholder="e.g. Self-paced"
                  className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none focus:border-primary"
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Pass mark (%)
                </span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={passMark}
                  onChange={(e) => setPassMark(e.target.value)}
                  className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none focus:border-primary"
                />
                <span className="block text-[11px] text-muted-foreground">
                  What the assessment is graded against.
                </span>
              </label>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Audience
                </span>
                <textarea
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                  placeholder="e.g. Teachers, grade leads, front office staff..."
                  className="min-h-28 w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none focus:border-primary"
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Outcome
                </span>
                <textarea
                  value={outcome}
                  onChange={(e) => setOutcome(e.target.value)}
                  placeholder="e.g. Give staff a clear communication structure..."
                  className="min-h-28 w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none focus:border-primary"
                />
              </label>
            </div>

            <label className="mt-4 block space-y-2">
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Learner-facing description
              </span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="A practical communication module for handling sensitive parent messages..."
                className="min-h-32 w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none focus:border-primary"
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
                <AddObjectiveDialog
                  onAddObjective={(obj) => setObjectives((prev) => [...prev, obj])}
                >
                  <button className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted">
                    <Plus className="h-4 w-4" /> Add objective
                  </button>
                </AddObjectiveDialog>
              </div>

              <div className="mt-5 space-y-3">
                {objectives.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
                    No learning objectives added yet. Click "Add objective" to define one.
                  </div>
                ) : (
                  objectives.map((objective, idx) => (
                    <div
                      key={idx}
                      className="rounded-2xl border border-border bg-card px-4 py-3 text-sm text-foreground"
                    >
                      {objective}
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>

          <section className="space-y-6">
            <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold">
                Upload content
              </p>
              {/*
                Three drop zones used to sit here, driven by a static literal.
                They could not have worked: a file has to attach to an asset
                row, and no asset row exists until the module does. Rather than
                fake the upload, the panel now says where uploads actually
                happen.
              */}
              <p className="mt-2 text-sm text-muted-foreground">
                Files attach to asset rows, and those exist only once the module does. Create the
                module first, then add its assets and upload their files from the module editor.
              </p>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                {ASSET_KINDS_PLANNED.map((kind) => (
                  <li key={kind.title} className="flex items-start gap-3">
                    <kind.icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>
                      <span className="font-semibold text-foreground">{kind.title}</span> —{" "}
                      {kind.description}
                    </span>
                  </li>
                ))}
              </ul>
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
                to="/academy/modules/$moduleSlug"
                params={{ moduleSlug: "parent-communication-protocol" }}
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
            <AddLessonDialog onAddLesson={(lesson) => setLessons((prev) => [...prev, lesson])}>
              <button className="inline-flex items-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-deep">
                <Plus className="h-4 w-4" /> Add lesson
              </button>
            </AddLessonDialog>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {lessons.length === 0 ? (
              <div className="col-span-full rounded-3xl border border-dashed border-border bg-muted/30 px-6 py-12 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-background shadow-sm">
                  <BookOpen className="h-6 w-6 text-muted-foreground" />
                </div>
                <h3 className="mt-4 font-semibold text-foreground">No lessons yet</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Get started by adding the first lesson to your module journey.
                </p>
              </div>
            ) : (
              lessons.map((lesson, index) => (
                <div
                  key={index}
                  className="rounded-2xl border border-border bg-background p-5 shadow-sm"
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
              ))
            )}
          </div>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-gold-soft px-4 py-2 text-sm font-semibold text-primary-deep">
            <Sparkles className="h-4 w-4" /> Draft mode
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              disabled={pending}
              onClick={async () => {
                const slug = await saveDraft();
                if (slug === null) return;
                toast.success("Draft saved.");
                await navigate({
                  to: "/academy/admin/modules/$moduleSlug",
                  params: { moduleSlug: slug },
                });
              }}
              className="rounded-2xl border border-border bg-card px-5 py-3 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-60"
            >
              {pending ? "Saving..." : "Save draft"}
            </button>
            <button
              disabled={pending}
              onClick={async () => {
                const slug = await saveDraft();
                if (slug === null) return;
                // Publishing has real preconditions now, including at least one
                // published lesson, so a brand-new module cannot publish from
                // here. Send the author to the editor rather than claiming it
                // published.
                toast.success("Draft saved. Publish it from the editor once a lesson is ready.");
                await navigate({
                  to: "/academy/admin/modules/$moduleSlug",
                  params: { moduleSlug: slug },
                });
              }}
              className="rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary-deep disabled:opacity-60"
            >
              {pending ? "Saving..." : "Save and continue"}
            </button>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
