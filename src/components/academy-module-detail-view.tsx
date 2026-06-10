import { Link } from "@tanstack/react-router";
import { StaffShell } from "@/components/staff-shell";
import {
  ArrowRight,
  BookOpen,
  ChevronRight,
  CirclePlay,
  Clock,
  FileText,
  Headphones,
  Target,
  Video,
} from "lucide-react";

type ModuleExperienceViewModel = {
  breadcrumb: string[];
  moduleNumberLabel: string;
  title: string;
  description: string;
  audience: string;
  outcome: string;
  objectives: string[];
  progressPercent: number;
  details: Array<{ label: string; value: string }>;
  featuredMedia: null | {
    title: string;
    typeLabel: string;
    description: string;
    meta: string;
  };
  lessons: Array<{
    id: string;
    order: number;
    title: string;
    kind: string;
    meta: string;
    href: string;
    isCurrent?: boolean;
    isComplete?: boolean;
  }>;
  resources: Array<{
    title: string;
    kind: string;
    meta: string;
    description: string;
  }>;
  continuePath: string;
  lastUpdatedLabel: string;
};

const lessonIcons = {
  video: Video,
  audio: Headphones,
  reading: BookOpen,
  "case-study": FileText,
  assessment: Target,
} as const;

const detailIcons = {
  Duration: Clock,
  Sections: BookOpen,
  "CPTD Points": Target,
  "Pass Mark": Target,
  Format: CirclePlay,
} as const;

export function AcademyModuleDetailView({ data }: { data: ModuleExperienceViewModel }) {
  return (
    <StaffShell>
      <div className="mx-auto max-w-7xl space-y-6">
        <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link to="/academy/modules" className="hover:text-foreground">
            {data.breadcrumb[0]}
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span>{data.breadcrumb[1]}</span>
          <ChevronRight className="h-3 w-3" />
          <span className="font-medium text-foreground">{data.breadcrumb[2]}</span>
        </nav>

        <section className="overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary via-primary-deep to-[#173650] text-primary-foreground shadow-xl">
          <div className="grid gap-8 p-8 lg:grid-cols-[1.5fr_0.9fr] lg:p-10">
            <div className="space-y-6">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.35em] text-gold">
                  {data.moduleNumberLabel}
                </p>
                <h1 className="mt-4 text-3xl font-bold sm:text-4xl">{data.title}</h1>
                <p className="mt-4 max-w-3xl text-sm leading-6 text-primary-foreground/85">
                  {data.description}
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                  <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-gold">
                    Audience
                  </p>
                  <p className="mt-3 text-sm text-primary-foreground/90">{data.audience}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                  <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-gold">
                    Outcome
                  </p>
                  <p className="mt-3 text-sm text-primary-foreground/90">{data.outcome}</p>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <div className="flex items-center justify-between text-xs text-primary-foreground/80">
                  <span className="font-semibold text-white">{data.progressPercent}% complete</span>
                  <span>{data.lastUpdatedLabel}</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-gold to-[#f6d57e]"
                    style={{ width: `${data.progressPercent}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/6 p-6 backdrop-blur">
              <div className="flex h-full flex-col justify-between gap-5">
                <div className="space-y-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gold text-primary-deep">
                      <CirclePlay className="h-7 w-7 fill-current" />
                    </div>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-gold">
                        Featured media
                      </p>
                      <h2 className="mt-1 text-xl font-semibold text-white">
                        {data.featuredMedia?.title}
                      </h2>
                    </div>
                  </div>

                  <div className="rounded-2xl bg-black/20 p-4">
                    <div className="aspect-video rounded-2xl border border-dashed border-white/20 bg-black/20 p-5">
                      <div className="flex h-full flex-col justify-between">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">
                          {data.featuredMedia?.typeLabel}
                        </p>
                        <div>
                          <p className="text-lg font-semibold text-white">
                            {data.featuredMedia?.title}
                          </p>
                          <p className="mt-2 text-sm text-primary-foreground/75">
                            {data.featuredMedia?.description}
                          </p>
                        </div>
                        <p className="text-xs text-primary-foreground/65">
                          {data.featuredMedia?.meta}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <Link
                  to={data.continuePath}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gold px-5 py-3.5 text-sm font-semibold text-primary-deep transition-colors hover:bg-[#f2cb58]"
                >
                  Continue Module <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
          <div className="space-y-6">
            <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold">
                    Lessons in this module
                  </p>
                  <h2 className="mt-2 text-2xl font-bold text-foreground">
                    What you&apos;ll cover
                  </h2>
                </div>
                <div className="hidden rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary sm:block">
                  {data.lessons.length} lesson items
                </div>
              </div>

              <ol className="mt-6 space-y-3">
                {data.lessons.map((lesson) => {
                  const Icon = lessonIcons[lesson.kind as keyof typeof lessonIcons] ?? BookOpen;

                  return (
                    <li key={lesson.id}>
                      <Link
                        to={lesson.href}
                        className={`flex items-start gap-4 rounded-2xl border p-4 transition-all ${
                          lesson.isCurrent
                            ? "border-primary bg-primary-soft shadow-sm"
                            : lesson.kind === "assessment"
                              ? "border-gold/40 bg-gold-soft/30"
                              : "border-border bg-card hover:border-primary/50 hover:bg-muted/20"
                        }`}
                      >
                        <div
                          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
                            lesson.kind === "assessment"
                              ? "bg-gold text-primary-deep"
                              : lesson.isCurrent
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-foreground"
                          }`}
                        >
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h3 className="text-lg font-semibold text-foreground">
                              {lesson.title}
                            </h3>
                            {lesson.isCurrent && (
                              <span className="rounded-full bg-primary px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary-foreground">
                                Current
                              </span>
                            )}
                            {!lesson.isCurrent && lesson.isComplete && (
                              <span className="rounded-full bg-success/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-success">
                                Complete
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">{lesson.meta}</p>
                        </div>
                        <ArrowRight className="mt-1 h-5 w-5 text-muted-foreground" />
                      </Link>
                    </li>
                  );
                })}
              </ol>
            </section>

            <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold">
                Learning objectives
              </p>
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {data.objectives.map((objective) => (
                  <div
                    key={objective}
                    className="rounded-2xl border border-border bg-background p-4"
                  >
                    <p className="text-sm leading-6 text-foreground">{objective}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <aside className="space-y-6">
            <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold">
                Module details
              </p>
              <dl className="mt-5 space-y-4">
                {data.details.map((detail) => {
                  const Icon = detailIcons[detail.label as keyof typeof detailIcons] ?? Clock;

                  return (
                    <div
                      key={detail.label}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <dt className="flex items-center gap-2 text-muted-foreground">
                        <Icon className="h-4 w-4" /> {detail.label}
                      </dt>
                      <dd className="font-semibold text-foreground">{detail.value}</dd>
                    </div>
                  );
                })}
              </dl>
            </section>

            <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold">
                Docs and downloads
              </p>
              <div className="mt-5 space-y-3">
                {data.resources.map((resource) => (
                  <div
                    key={resource.title}
                    className="rounded-2xl border border-border bg-background p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-foreground">{resource.title}</h3>
                        <p className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">
                          {resource.kind} · {resource.meta}
                        </p>
                      </div>
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <p className="mt-3 text-sm text-muted-foreground">{resource.description}</p>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </StaffShell>
  );
}
