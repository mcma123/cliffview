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
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  presentAssessmentResult,
  presentLearnerAssessment,
  presentLearnerLesson,
} from "@/application/academy/presenters";
import { AssessmentRunner, type RunnerResult } from "@/components/assessment-runner";
import { LessonMaterial } from "@/components/lesson-material";
import { PageNotice } from "@/components/page-notice";
import { StaffShell } from "@/components/staff-shell";
import { useStaffViewer } from "@/hooks/use-staff-viewer";
import { errorMessage } from "@/lib/convex-error";
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

function LessonPage() {
  const { moduleSlug, lessonId } = Route.useParams();
  const gate = useStaffViewer();
  // Real name, initials, streak, sign-out, and the admin link only for
  // admins. Empty while the gate is still resolving, so the chrome shows
  // nothing rather than a placeholder identity.
  const shell = gate.status === "ready" ? gate.shellProps : {};
  const navigate = useNavigate();

  const { data, isPending, error } = useQuery({
    ...convexQuery(api.learn.lesson, { moduleSlug, lessonSlug: lessonId }),
    enabled: gate.status === "ready",
    retry: false,
  });

  const record = useMutation({ mutationFn: useConvexMutation(api.learn.recordLessonProgress) });

  // A separate query rather than widening `learn.lesson`, which runs for every
  // lesson in the app and mints signed R2 URLs an assessment has no use for.
  const isAssessment = data?.lesson.kind === "assessment";
  const quiz = useQuery({
    ...convexQuery(api.learn.assessment, { moduleSlug, lessonSlug: lessonId }),
    enabled: gate.status === "ready" && isAssessment === true,
    retry: false,
  });
  const submit = useMutation({ mutationFn: useConvexMutation(api.learn.submitAssessment) });
  const [result, setResult] = useState<RunnerResult | null>(null);

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
      <StaffShell {...shell}>
        <PageNotice title="Loading your lesson…" />
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
  if (data === undefined || error !== null) {
    return (
      <StaffShell {...shell}>
        <PageNotice
          title="We could not open this lesson"
          body={errorMessage(error, "") || undefined}
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

  const view = isAssessment && quiz.data !== undefined ? presentLearnerAssessment(quiz.data) : null;

  async function submitAnswers(answers: Array<{ questionId: string; optionId: string }>) {
    try {
      const graded = await submit.mutateAsync({
        moduleSlug,
        lessonSlug: lessonId,
        // The ids came out of this very query, so the casts only restore the
        // branding the component props erased.
        answers: answers as Parameters<typeof submit.mutateAsync>[0]["answers"],
      });
      setResult(presentAssessmentResult(graded, view?.questions ?? []));
      toast[graded.passed ? "success" : "info"](
        graded.passed
          ? `Assessment passed — ${graded.scorePercent}%.`
          : `${graded.scorePercent}% — you need ${graded.passMark}% to pass.`,
      );
    } catch (caught) {
      toast.error(errorMessage(caught, "Could not mark your answers."));
    }
  }

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
      toast.error(errorMessage(caught, "Could not save your progress."));
    }
  }

  return (
    <StaffShell {...shell}>
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

        {/*
          Keyed, like the attachments below, because `LessonMaterial` pins the
          signed URL it is first given for the life of its mount. Without a key
          a genuinely different hero would inherit the previous one's URL.
        */}
        {lesson.hero === null ? null : (
          <LessonMaterial key={lesson.hero.id} material={lesson.hero} />
        )}

        {!isAssessment || view !== null ? null : (
          <section className="rounded-3xl border border-border bg-card p-8 text-center shadow-sm">
            <p className="text-sm text-muted-foreground">
              {quiz.error === null
                ? "Loading the questions…"
                : quiz.error instanceof Error
                  ? quiz.error.message.replace(/^\[.*?\]\s*/, "")
                  : "We could not load this assessment."}
            </p>
          </section>
        )}

        {view === null ? null : (
          <AssessmentRunner
            questions={view.questions}
            passMarkLabel={view.passMarkLabel}
            bestScoreLabel={view.bestScoreLabel}
            lastAttemptLabel={view.lastAttemptLabel}
            attemptLabel={view.attemptLabel}
            result={result}
            submitting={submit.isPending}
            onSubmit={submitAnswers}
            onRetake={() => setResult(null)}
            onContinue={
              result?.passed === true && nextSlug !== null
                ? () =>
                    void navigate({
                      to: "/academy/modules/$moduleSlug/lesson/$lessonId",
                      params: { moduleSlug, lessonId: nextSlug },
                    })
                : null
            }
            continueLabel="Next lesson"
          />
        )}

        {isAssessment || lesson.scenarioBody === null ? null : (
          <section className="rounded-3xl border border-border bg-card p-8 shadow-sm">
            <h2 className="text-lg font-black tracking-tight text-foreground">
              {lesson.scenarioTitle ?? "Scenario"}
            </h2>
            <p className="mt-3 whitespace-pre-line text-sm text-foreground">
              {lesson.scenarioBody}
            </p>
          </section>
        )}

        {isAssessment || lesson.assets.length === 0 ? null : (
          <section className="space-y-3">
            <h2 className="text-lg font-black tracking-tight text-foreground">
              Supporting material
            </h2>
            {lesson.assets.map((asset) => (
              <LessonMaterial key={asset.id} material={asset} />
            ))}
          </section>
        )}

        {isAssessment || lesson.reflectionPrompt === null ? null : (
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
          {/*
            No "mark complete" on an assessment: passing it is what completes
            it. `learn.recordLessonProgress` refuses this outright, so leaving
            the button here would only produce a refusal the learner cannot act
            on.
          */}
          {isAssessment ? null : (
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
          )}
        </nav>
      </div>
    </StaffShell>
  );
}
