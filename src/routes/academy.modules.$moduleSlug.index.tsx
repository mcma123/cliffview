import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Circle,
  Clock,
  Download,
  FileText,
  Headphones,
  Play,
  Sparkles,
  Video,
} from "lucide-react";

import { presentLearnerModuleDetail } from "@/application/academy/presenters";
import { PageNotice } from "@/components/page-notice";
import { StaffShell } from "@/components/staff-shell";
import { useStaffViewer } from "@/hooks/use-staff-viewer";
import { api } from "../../convex/_generated/api";

/**
 * One assigned module, read from Convex.
 *
 * No loader prefetch: this is a `requireStaff` query and Convex Auth keeps its
 * token in localStorage, so there is no identity on the server and a
 * prefetched query would throw UNAUTHENTICATED. Same rule the admin routes
 * follow. `now` is a render-time constant rather than loader data for the same
 * reason — nothing here is server-rendered.
 */
export const Route = createFileRoute("/academy/modules/$moduleSlug/")({
  head: () => ({ meta: [{ title: "Module · Cliffview Academy" }] }),
  component: ModuleOverview,
});

const KIND_ICONS: Record<string, typeof Video> = {
  video: Video,
  audio: Headphones,
  reading: FileText,
  "case-study": Sparkles,
  assessment: CheckCircle2,
};

function ModuleOverview() {
  const { moduleSlug } = Route.useParams();
  const gate = useStaffViewer();
  // Real name, initials, streak, sign-out, and the admin link only for
  // admins. Empty while the gate is still resolving, so the chrome shows
  // nothing rather than a placeholder identity.
  const shell = gate.status === "ready" ? gate.shellProps : {};
  const now = Date.now();

  const { data, isPending, error } = useQuery({
    ...convexQuery(api.learn.moduleDetail, { slug: moduleSlug }),
    enabled: gate.status === "ready",
    retry: false,
  });

  if (gate.status === "loading" || (gate.status === "ready" && isPending)) {
    return (
      <StaffShell {...shell}>
        <PageNotice title="Loading your module…" />
      </StaffShell>
    );
  }
  if (gate.status === "signed-out") {
    return (
      <StaffShell {...shell}>
        <PageNotice
          title="Sign in to continue"
          body="Your training record is private to you."
          action={{ label: "Go to sign in", to: "/academy/sign-in" }}
        />
      </StaffShell>
    );
  }
  if (gate.status === "error" || error !== null || data === undefined) {
    return (
      <StaffShell {...shell}>
        <PageNotice
          title="We could not open this module"
          body={
            error instanceof Error
              ? error.message.replace(/^\[.*?\]\s*/, "")
              : "Ask an administrator to check it is assigned to you."
          }
          action={{ label: "Back to my modules", to: "/academy/modules" }}
        />
      </StaffShell>
    );
  }

  const module = presentLearnerModuleDetail(data, now);
  const featured = module.featured;

  return (
    <StaffShell {...shell}>
      <div className="mx-auto max-w-5xl space-y-8">
        <Link
          to="/academy/modules"
          className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-gold"
        >
          <ArrowLeft className="h-4 w-4" /> My modules
        </Link>

        <header className="rounded-3xl border border-border bg-card p-8 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold">
            Module {module.number} · {module.category}
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-foreground">
            {module.title}
          </h1>
          <p className="mt-3 max-w-3xl text-muted-foreground">{module.description}</p>

          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <Clock className="h-4 w-4" /> {module.durationMinutes} min
            </span>
            <span>{module.cptdPoints} CPTD points</span>
            <span>Pass mark {module.passMark}%</span>
            <span>{module.format}</span>
          </div>

          <div className="mt-6 flex items-center gap-4">
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-success transition-[width]"
                style={{ width: `${module.progressPercent}%` }}
              />
            </div>
            <span className="text-sm font-bold text-foreground">{module.progressPercent}%</span>
            <span className="rounded-full bg-muted px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              {module.statusLabel}
            </span>
          </div>
        </header>

        {/*
          The module hero. This is where an uploaded module video actually
          lives — `modules.featuredAssetId`, not the per-lesson attachment
          list. The URL is a short-lived signed R2 link resolved per read, so
          it is rendered straight into the player and never cached anywhere.
        */}
        {featured === null ? null : (
          <section className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
            {featured.url !== null && featured.kind === "video" ? (
              <video
                controls
                playsInline
                preload="metadata"
                className="aspect-video w-full bg-black"
                src={featured.url}
              >
                Your browser cannot play this video.
              </video>
            ) : featured.url !== null && featured.kind === "audio" ? (
              <div className="p-6">
                <audio controls preload="metadata" className="w-full" src={featured.url}>
                  Your browser cannot play this audio.
                </audio>
              </div>
            ) : null}

            <div className="flex flex-wrap items-start justify-between gap-4 p-6">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Featured {featured.kind}
                </p>
                <h2 className="mt-1 text-lg font-bold text-foreground">{featured.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{featured.description}</p>
                <p className="mt-2 text-xs text-muted-foreground">{featured.meta}</p>
              </div>
              {featured.url === null ? (
                <span className="rounded-full bg-muted px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  No file uploaded yet
                </span>
              ) : (
                <a
                  href={featured.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-2xl border border-border px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted"
                >
                  <Download className="h-4 w-4" /> Open
                </a>
              )}
            </div>
          </section>
        )}

        {module.objectives.length === 0 ? null : (
          <section className="rounded-3xl border border-border bg-card p-8 shadow-sm">
            <h2 className="text-lg font-black tracking-tight text-foreground">
              What you will be able to do
            </h2>
            <ul className="mt-4 space-y-3">
              {module.objectives.map((objective) => (
                <li key={objective.id} className="flex items-start gap-3 text-sm text-foreground">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                  {objective.text}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="space-y-4">
          <h2 className="text-lg font-black tracking-tight text-foreground">
            Lessons ({module.lessons.length})
          </h2>
          {module.lessons.length === 0 ? (
            <PageNotice
              title="No lessons published yet"
              body="This module has been assigned to you, but the school has not published its lessons."
            />
          ) : (
            <ol className="space-y-3">
              {module.lessons.map((lesson) => {
                const Icon = KIND_ICONS[lesson.kind] ?? FileText;
                return (
                  <li key={lesson.id}>
                    <Link
                      to="/academy/modules/$moduleSlug/lesson/$lessonId"
                      params={{ moduleSlug: module.slug, lessonId: lesson.slug }}
                      className="group flex items-center gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm transition-colors hover:border-primary/50"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted">
                        {lesson.status === "completed" ? (
                          <CheckCircle2 className="h-5 w-5 text-success" />
                        ) : lesson.status === "in_progress" ? (
                          <Play className="h-5 w-5 text-gold" />
                        ) : (
                          <Circle className="h-5 w-5 text-muted-foreground" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-foreground">{lesson.title}</span>
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <Icon className="h-3.5 w-3.5" /> {lesson.durationLabel}
                          </span>
                        </span>
                        <span className="mt-1 block text-sm text-muted-foreground">
                          {lesson.summary}
                        </span>
                      </span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" />
                    </Link>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>
    </StaffShell>
  );
}
