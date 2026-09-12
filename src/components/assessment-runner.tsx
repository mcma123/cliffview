import { ArrowLeft, ArrowRight, Check, RotateCcw, Sparkles, X } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Sitting a module assessment.
 *
 * Prop-driven and Convex-free: the route owns `api.learn.submitAssessment` and
 * hands the graded result back.
 *
 * Three states, one component, because they share the question list and the
 * answers the learner has picked. What the results screen deliberately does
 * *not* show is which answer was the right one — that would make a retake a
 * memory test. Nothing here is ever told the correct answer anyway; the query
 * does not return it.
 */

export type RunnerQuestion = {
  id: string;
  prompt: string;
  kindLabel: string;
  options: Array<{ id: string; key: string; text: string }>;
};

export type RunnerResult = {
  scoreLabel: string;
  passed: boolean;
  headline: string;
  subline: string;
  rows: Array<{ id: string; number: number; prompt: string; correct: boolean }>;
  xpLabel: string | null;
  cptdLabel: string | null;
  badgeLabel: string | null;
};

export function AssessmentRunner({
  questions,
  passMarkLabel,
  bestScoreLabel,
  lastAttemptLabel,
  attemptLabel,
  result,
  submitting,
  onSubmit,
  onRetake,
  onContinue,
  continueLabel,
}: {
  questions: ReadonlyArray<RunnerQuestion>;
  passMarkLabel: string;
  bestScoreLabel: string | null;
  lastAttemptLabel: string | null;
  attemptLabel: string;
  /** Null while answering; the graded result once submitted. */
  result: RunnerResult | null;
  submitting: boolean;
  onSubmit: (answers: Array<{ questionId: string; optionId: string }>) => Promise<void>;
  onRetake: () => void;
  onContinue: (() => void) | null;
  continueLabel: string;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [index, setIndex] = useState(0);

  if (questions.length === 0) {
    return (
      <section className="rounded-3xl border border-border bg-card p-8 text-center shadow-sm">
        <h2 className="text-lg font-bold text-foreground">This assessment is not ready yet</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Nobody has written its questions. Your progress on this module is not affected — check
          back once the school has finished it.
        </p>
      </section>
    );
  }

  // --- results -------------------------------------------------------------
  if (result !== null) {
    return (
      <div className="space-y-6">
        <section
          className={cn(
            "rounded-3xl border p-8 text-center shadow-sm",
            result.passed ? "border-success/40 bg-success/10" : "border-gold/40 bg-gold-soft/40",
          )}
        >
          <p className="text-5xl font-black tracking-tight text-foreground">{result.scoreLabel}</p>
          <h2 className="mt-3 text-xl font-bold text-foreground">{result.headline}</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{result.subline}</p>

          {result.xpLabel === null &&
          result.cptdLabel === null &&
          result.badgeLabel === null ? null : (
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              {[result.xpLabel, result.cptdLabel, result.badgeLabel]
                .filter((label): label is string => label !== null)
                .map((label) => (
                  <span
                    key={label}
                    className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-primary-deep"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-gold" /> {label}
                  </span>
                ))}
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h3 className="text-lg font-black tracking-tight text-foreground">How you did</h3>
          {result.rows.map((row) => (
            <article
              key={row.id}
              className="flex items-start gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm"
            >
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                  row.correct ? "bg-success/15 text-success" : "bg-destructive/10 text-destructive",
                )}
              >
                {row.correct ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Question {row.number} · {row.correct ? "Correct" : "Not correct"}
                </p>
                <p className="mt-1 text-sm text-foreground">{row.prompt}</p>
              </div>
            </article>
          ))}
        </section>

        <nav className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6">
          <button
            onClick={() => {
              setAnswers({});
              setIndex(0);
              onRetake();
            }}
            className="inline-flex items-center gap-2 rounded-2xl border border-border px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted"
          >
            <RotateCcw className="h-4 w-4" /> {result.passed ? "Take it again" : "Try again"}
          </button>
          {onContinue === null ? (
            <span />
          ) : (
            <button
              onClick={onContinue}
              className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary-deep"
            >
              {continueLabel} <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </nav>
      </div>
    );
  }

  // --- answering -----------------------------------------------------------
  const question = questions[index];
  const answered = Object.keys(answers).length;
  const allAnswered = answered === questions.length;
  const isLast = index === questions.length - 1;

  return (
    <div className="space-y-6">
      {bestScoreLabel === null && lastAttemptLabel === null ? null : (
        <section className="rounded-2xl border border-border bg-card px-5 py-4 shadow-sm">
          <p className="text-sm font-semibold text-foreground">
            {[bestScoreLabel, lastAttemptLabel].filter(Boolean).join(" · ")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {attemptLabel} · {passMarkLabel}
          </p>
        </section>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          {passMarkLabel}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {questions.map((row, i) => {
            const done = answers[row.id] !== undefined;
            return (
              <button
                key={row.id}
                onClick={() => setIndex(i)}
                aria-label={`Go to question ${i + 1}`}
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors",
                  i === index
                    ? "bg-primary text-primary-foreground"
                    : done
                      ? "bg-success/15 text-success"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {done && i !== index ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </button>
            );
          })}
        </div>
      </div>

      <section className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold text-muted-foreground">
            Question {index + 1} of {questions.length}
          </p>
          <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {question.kindLabel}
          </span>
        </div>

        <h2 className="mt-4 text-xl font-bold leading-snug text-foreground sm:text-2xl">
          {question.prompt}
        </h2>

        <div className="mt-6 space-y-3">
          {question.options.map((option) => {
            const selected = answers[question.id] === option.id;
            return (
              <button
                key={option.id}
                onClick={() => setAnswers((c) => ({ ...c, [question.id]: option.id }))}
                className={cn(
                  "flex w-full items-start gap-4 rounded-xl border p-4 text-left transition-all",
                  selected
                    ? "border-primary bg-primary-soft shadow-sm"
                    : "border-border bg-card hover:border-primary/50 hover:bg-muted/40",
                )}
              >
                <span
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                    selected
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {option.key}
                </span>
                <span className="flex-1 text-sm text-foreground">{option.text}</span>
                {selected && <Check className="h-5 w-5 shrink-0 text-primary" />}
              </button>
            );
          })}
        </div>

        <p className="mt-5 text-xs text-muted-foreground">
          You can change your answer until you submit.
        </p>
      </section>

      <nav className="flex flex-wrap items-center justify-between gap-3">
        <button
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
          className="inline-flex items-center gap-2 rounded-2xl border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-40"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        {isLast ? (
          <button
            onClick={() =>
              void onSubmit(
                questions.map((row) => ({ questionId: row.id, optionId: answers[row.id] })),
              )
            }
            disabled={!allAnswered || submitting}
            className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary-deep disabled:opacity-60"
          >
            {submitting
              ? "Marking…"
              : allAnswered
                ? "Submit assessment"
                : `${questions.length - answered} still to answer`}
          </button>
        ) : (
          <button
            onClick={() => setIndex((i) => Math.min(questions.length - 1, i + 1))}
            className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-deep"
          >
            Next <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </nav>
    </div>
  );
}
