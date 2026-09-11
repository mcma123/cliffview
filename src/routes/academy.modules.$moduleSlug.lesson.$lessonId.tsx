import { convexQuery, useConvexMutation } from "@convex-dev/react-query";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Download,
  FileText,
  Headphones,
  Sparkles,
  Video,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { presentLearnerLesson } from "@/application/academy/presenters";
import { PageNotice } from "@/components/page-notice";
import { StaffShell } from "@/components/staff-shell";
import { useStaffViewer } from "@/hooks/use-staff-viewer";
import { api } from "../../convex/_generated/api";

/**
 * One lesson, read from Convex, with its media playable in place.
 *
 * The `$lessonId` param is the module-scoped lesson **slug**, which is what
 * the original learner URLs carried and why lesson slugs are deliberately not
 * globally unique.
 */
export const Route = createFileRoute("/academy/modules/$moduleSlug/lesson/$lessonId")({
  head: () => ({ meta: [{ title: "Lesson · Cliffview Academy" }] }),
  component: LessonPage,
});

const KIND_ICONS: Record<string, typeof Video> = {
  video: Video,
  audio: Headphones,
  document: FileText,
  worksheet: Sparkles,
};

function LessonPage() {
  const { moduleSlug, lessonId } = Route.useParams();
  const gate = useStaffViewer();
  const navigate = useNavigate();

  const { data, isPending, error } = useQuery({
    ...convexQuery(api.learn.lesson, { moduleSlug, lessonSlug: lessonId }),
    enabled: gate.status === "ready",
    retry: false,
  });

  const record = useMutation({ mutationFn: useConvexMutation(api.learn.recordLessonProgress) });

  // Opening a lesson is what moves it to "in progress", which is also what
  // starts the module and stamps `lastAccessedAt`. Fired once per lesson, not
  // on every render, or it would rewrite the row on each repaint.
  const marked = useRef<string | null>(null);
  const ready = gate.status === "ready" && data !== undefined;
  useEffect(() => {
    const key = `${moduleSlug}/${lessonId}`;
    if (!ready || marked.current === key) return;
    marked.current = key;
    record.mutate({ moduleSlug, lessonSlug: lessonId, completed: false });
    // `record` is a stable mutation handle; including it would refire on every
    // mutation state change, which is exactly the loop this guard prevents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, moduleSlug, lessonId]);

  if (gate.status === "loading" || (gate.status === "ready" && isPending)) {
    return (
      <StaffShell>
        <PageNotice title="Loading your lesson…" />
      </StaffShell>
    );
  }
  if (gate.status === "signed-out") {
    return (
      <StaffShell>
        <PageNotice
          title="Sign in to continue"
          body="Your training record is private to you."
          action={{ label: "Go to sign in", to: "/academy/sign-in" }}
        />
      </StaffShell>
    );
  }
  if (data === undefined || error !== null) {
    return (
      <StaffShell>
        <PageNotice
          title="We could not open this lesson"
          body={error instanceof Error ? error.message.replace(/^\[.*?\]\s*/, "") : undefined}
          action={{ label: "Back to my modules", to: "/academy/modules" }}
        />
      </StaffShell>
    );
  }

  const lesson = presentLearnerLesson(data);
  // Captured here so the async handler below does not close over a value
  // TypeScript can no longer prove is defined.
  const nextSlug = data.nextSlug;
  const previousSlug = data.previousSlug;

  async function complete() {
    try {
      const result = await record.mutateAsync({
        moduleSlug,
        lessonSlug: lessonId,
        completed: true,
      });
      toast.success(
        result.moduleCompleted
          ? "Module complete. Well done."
          : `Lesson complete — ${result.progressPercent}% of this module done.`,
      );
      if (nextSlug !== null) {
        await navigate({
          to: "/academy/modules/$moduleSlug/lesson/$lessonId",
          params: { moduleSlug, lessonId: nextSlug },
        });
      }
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not save your progress.");
    }
  }

  return (
    <StaffShell>
      <div className="mx-auto max-w-4xl space-y-6">
        <Link
          to="/academy/modules/$moduleSlug"
          params={{ moduleSlug }}
          className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-gold"
        >
          <ArrowLeft className="h-4 w-4" /> {lesson.moduleTitle}
        </Link>

        <header className="rounded-3xl border border-border bg-card p-8 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-bold uppercase tracking-[0.3em] text-gold">
              {lesson.positionLabel}
            </span>
            <span className="rounded-full bg-muted px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              {lesson.statusLabel}
            </span>
          </div>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-foreground">
            {lesson.title}
          </h1>
          <p className="mt-3 text-muted-foreground">{lesson.summary}</p>
          <p className="mt-2 text-sm text-muted-foreground">{lesson.durationLabel}</p>
        </header>

        {lesson.heroUrl === null ? null : (
          <video
            controls
            playsInline
            preload="metadata"
            className="aspect-video w-full overflow-hidden rounded-3xl border border-border bg-black"
            src={lesson.heroUrl}
          >
            Your browser cannot play this video.
          </video>
        )}

        {lesson.scenarioBody === null ? null : (
          <section className="rounded-3xl border border-border bg-card p-8 shadow-sm">
            <h2 className="text-lg font-black tracking-tight text-foreground">
              {lesson.scenarioTitle ?? "Scenario"}
            </h2>
            <p className="mt-3 whitespace-pre-line text-sm text-foreground">
              {lesson.scenarioBody}
            </p>
          </section>
        )}

        {lesson.assets.length === 0 ? null : (
          <section className="space-y-3">
            <h2 className="text-lg font-black tracking-tight text-foreground">
              Supporting material
            </h2>
            {lesson.assets.map((asset) => {
              const Icon = KIND_ICONS[asset.kind] ?? FileText;
              return (
                <article
                  key={asset.id}
                  className="rounded-3xl border border-border bg-card p-6 shadow-sm"
                >
                  {asset.url !== null && asset.kind === "video" ? (
                    <video
                      controls
                      playsInline
                      preload="metadata"
                      className="mb-4 aspect-video w-full rounded-2xl bg-black"
                      src={asset.url}
                    />
                  ) : asset.url !== null && asset.kind === "audio" ? (
                    <audio controls preload="metadata" className="mb-4 w-full" src={asset.url} />
                  ) : null}

                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-gold" />
                      <div>
                        <p className="font-bold text-foreground">{asset.title}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{asset.description}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{asset.meta}</p>
                      </div>
                    </div>
                    {asset.url === null ? (
                      <span className="rounded-full bg-muted px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                        No file yet
                      </span>
                    ) : (
                      <a
                        href={asset.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-2xl border border-border px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted"
                      >
                        <Download className="h-4 w-4" /> Open
                      </a>
                    )}
                  </div>
                </article>
              );
            })}
          </section>
        )}

        {lesson.reflectionPrompt === null ? null : (
          <section className="rounded-3xl border border-gold/40 bg-gold-soft/40 p-8">
            <h2 className="text-sm font-bold uppercase tracking-widest text-primary-deep">
              Reflect
            </h2>
            <p className="mt-2 text-sm text-foreground">{lesson.reflectionPrompt}</p>
          </section>
        )}

        <nav className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6">
          {lesson.previousHref === null ? (
            <span />
          ) : (
            <Link
              to="/academy/modules/$moduleSlug/lesson/$lessonId"
              params={{ moduleSlug, lessonId: previousSlug! }}
              className="inline-flex items-center gap-2 rounded-2xl border border-border px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted"
            >
              <ArrowLeft className="h-4 w-4" /> Previous
            </Link>
          )}
          <button
            onClick={complete}
            disabled={record.isPending}
            className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary-deep disabled:opacity-60"
          >
            <CheckCircle2 className="h-4 w-4" />
            {lesson.isComplete
              ? "Completed"
              : record.isPending
                ? "Saving…"
                : lesson.nextHref === null
                  ? "Mark complete"
                  : "Complete and continue"}
            {lesson.nextHref === null ? null : <ArrowRight className="h-4 w-4" />}
          </button>
        </nav>
      </div>
    </StaffShell>
  );
}
