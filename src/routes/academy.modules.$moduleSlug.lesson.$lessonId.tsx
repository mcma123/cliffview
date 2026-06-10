import { createFileRoute, Link } from "@tanstack/react-router";
import { StaffShell } from "@/components/staff-shell";
import { academyQueries } from "@/infrastructure/academy/container";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Circle,
  CirclePlay,
  Download,
  FileText,
  Headphones,
  MonitorPlay,
  Play,
  Sparkles,
  Video,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export const Route = createFileRoute("/academy/modules/$moduleSlug/lesson/$lessonId")({
  head: () => ({ meta: [{ title: "Lesson View · Cliffview Academy" }] }),
  loader: ({ params }) =>
    academyQueries.getModuleLessonExperience(params.moduleSlug, params.lessonId),
  component: ModuleLessonRoute,
});

function ModuleLessonRoute() {
  const data = Route.useLoaderData();
  const resourceCountLabel =
    data.resources.length === 1 ? "1 supporting doc" : `${data.resources.length} supporting docs`;

  return (
    <StaffShell>
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="grid gap-6 xl:grid-cols-[300px_1fr]">
          <aside className="rounded-3xl border border-border bg-card p-5 shadow-sm">
            <Link
              to={data.modulePath}
              className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-gold"
            >
              {data.moduleTitle}
            </Link>
            <h2 className="mt-3 text-2xl font-bold text-foreground">Sections</h2>

            <ol className="mt-5 space-y-2">
              {data.sidebarLessons.map((lesson) => (
                <li key={lesson.id}>
                  <Link
                    to={lesson.href}
                    className={`flex items-start gap-3 rounded-2xl border px-4 py-3 transition-all ${
                      lesson.state === "current"
                        ? "border-primary bg-primary-soft"
                        : "border-transparent hover:border-border hover:bg-muted/30"
                    }`}
                  >
                    {lesson.state === "complete" ? (
                      <CheckCircle2 className="mt-0.5 h-5 w-5 text-success" />
                    ) : lesson.state === "current" ? (
                      <CirclePlay className="mt-0.5 h-5 w-5 text-primary" />
                    ) : (
                      <Circle className="mt-0.5 h-5 w-5 text-muted-foreground" />
                    )}
                    <div>
                      <p className="font-semibold text-foreground">{lesson.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {lesson.durationLabel}
                        {lesson.isAssessment ? " · assessment" : ""}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ol>
          </aside>

          <div className="space-y-6">
            <section className="overflow-hidden rounded-3xl bg-gradient-to-r from-primary to-primary-deep p-6 text-primary-foreground shadow-xl sm:p-8">
              <div className="flex flex-wrap items-start justify-between gap-6">
                <div className="flex items-center gap-5">
                  <button className="flex h-20 w-20 items-center justify-center rounded-full bg-gold text-primary-deep shadow-lg">
                    <Play className="h-9 w-9 fill-current" />
                  </button>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold">
                      {data.lessonOrderLabel}
                    </p>
                    <h1 className="mt-3 text-3xl font-bold">{data.lessonTitle}</h1>
                    <p className="mt-2 text-sm text-primary-foreground/80">
                      {data.mediaCard.typeLabel} · {data.mediaCard.durationLabel}
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-right">
                  <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-gold">
                    Progress
                  </p>
                  <p className="mt-2 text-2xl font-bold">{data.progressPercent}%</p>
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-white/10 bg-black/15 p-5">
                <div className="aspect-[16/7] rounded-2xl border border-dashed border-white/20 p-5">
                  <div className="flex h-full flex-col justify-between">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-gold">
                      {data.mediaCard.typeLabel.includes("Audio") ? (
                        <Headphones className="h-4 w-4" />
                      ) : (
                        <Video className="h-4 w-4" />
                      )}
                      Media placeholder
                    </div>
                    <div>
                      <h2 className="text-2xl font-semibold text-white">{data.mediaCard.title}</h2>
                      <p className="mt-3 max-w-2xl text-sm text-primary-foreground/80">
                        {data.mediaCard.description}
                      </p>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-gold to-[#f2cf71]"
                        style={{ width: `${Math.max(25, data.progressPercent)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
              <h2 className="text-3xl font-bold text-foreground">{data.scenarioTitle}</h2>
              <p className="mt-6 text-lg leading-8 text-foreground/90">{data.scenarioBody}</p>

              <div className="mt-8 rounded-2xl border-l-4 border-gold bg-gold-soft/50 p-5">
                <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-primary-deep">
                  What would you do?
                </p>
                <p className="mt-3 text-sm italic text-primary-deep/90">{data.reflectionPrompt}</p>
              </div>

              <Sheet>
                <div className="mt-8 rounded-3xl border border-border bg-background p-5 sm:p-6">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div className="max-w-2xl">
                      <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-gold">
                        Lesson resources
                      </p>
                      <h3 className="mt-2 text-2xl font-bold text-foreground">
                        Open the supporting docs when you need the detail
                      </h3>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Keep the lesson flow focused, then pull in templates, policy notes, and
                        guidance without leaving this page.
                      </p>
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <div className="rounded-2xl border border-border bg-card px-4 py-3">
                        <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-muted-foreground">
                          Available now
                        </p>
                        <p className="mt-1 text-base font-semibold text-foreground">
                          {resourceCountLabel}
                        </p>
                      </div>
                      <SheetTrigger asChild>
                        <button className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-deep">
                          More docs <ArrowRight className="h-4 w-4" />
                        </button>
                      </SheetTrigger>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 md:grid-cols-3">
                    {data.resources.slice(0, 3).map((resource) => (
                      <div
                        key={resource.title}
                        className="rounded-2xl border border-border bg-card p-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="rounded-full bg-primary-soft px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">
                            {resource.kind}
                          </span>
                          <FileText className="h-4 w-4 text-primary" />
                        </div>
                        <h4 className="mt-4 font-semibold text-foreground">{resource.title}</h4>
                        <p className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">
                          {resource.meta}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <SheetContent
                  side="right"
                  className="w-full overflow-y-auto border-l border-border bg-card p-0 sm:max-w-2xl"
                >
                  <div className="flex min-h-full flex-col">
                    <div className="border-b border-border bg-gradient-to-br from-primary via-primary-deep to-[#173650] px-6 py-8 text-primary-foreground sm:px-8">
                      <SheetHeader className="space-y-3 text-left">
                        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/8 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.25em] text-gold">
                          <Sparkles className="h-3.5 w-3.5" /> More docs
                        </div>
                        <SheetTitle className="pr-10 text-3xl font-bold text-white">
                          {data.lessonTitle}
                        </SheetTitle>
                        <SheetDescription className="max-w-xl text-sm leading-6 text-primary-foreground/80">
                          Supporting resources for this lesson, styled as placeholder actions for
                          viewing, downloading, and presenting to staff later when backend file
                          delivery is wired up.
                        </SheetDescription>
                      </SheetHeader>

                      <div className="mt-6 grid gap-3 sm:grid-cols-3">
                        <div className="rounded-2xl border border-white/10 bg-white/6 px-4 py-3">
                          <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-gold">
                            Resource pack
                          </p>
                          <p className="mt-1 text-lg font-semibold text-white">
                            {resourceCountLabel}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/6 px-4 py-3">
                          <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-gold">
                            Module
                          </p>
                          <p className="mt-1 text-sm font-semibold text-white">
                            {data.moduleTitle}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/6 px-4 py-3">
                          <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-gold">
                            Lesson
                          </p>
                          <p className="mt-1 text-sm font-semibold text-white">
                            {data.lessonOrderLabel}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex-1 space-y-4 px-6 py-6 sm:px-8">
                      {data.resources.map((resource) => (
                        <div
                          key={resource.title}
                          className="rounded-3xl border border-border bg-background p-5 shadow-sm"
                        >
                          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                            <div className="max-w-xl">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-full bg-primary-soft px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">
                                  {resource.kind}
                                </span>
                                <span className="rounded-full bg-gold-soft px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary-deep">
                                  {resource.meta}
                                </span>
                              </div>
                              <h3 className="mt-4 text-xl font-bold text-foreground">
                                {resource.title}
                              </h3>
                              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                                {resource.description}
                              </p>
                            </div>

                            <div className="grid gap-2 sm:min-w-44">
                              <button className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-deep">
                                <MonitorPlay className="h-4 w-4" /> View doc
                              </button>
                              <button className="inline-flex items-center justify-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted">
                                <Download className="h-4 w-4" /> Download
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </section>

            <div className="flex items-center justify-between">
              <Link
                to={data.previousPath}
                className="inline-flex items-center gap-2 rounded-2xl border border-border bg-card px-5 py-3 text-sm font-semibold text-foreground hover:bg-muted"
              >
                <ArrowLeft className="h-4 w-4" /> Previous
              </Link>
              <Link
                to={data.nextPath}
                className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary-deep"
              >
                Next <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </StaffShell>
  );
}
