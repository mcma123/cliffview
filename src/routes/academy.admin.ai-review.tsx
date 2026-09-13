import { convexQuery, useConvexAction, useConvexMutation } from "@convex-dev/react-query";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, Check, FileText, Loader2, Pencil, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { presentAiReviewQueue } from "@/application/academy/presenters";
import { AdminShell } from "@/components/admin-shell";
import { cn } from "@/lib/utils";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

/**
 * The AI review queue, reading and writing prod.
 *
 * What this replaced: a `setInterval` that animated a fake progress bar and
 * then injected two hardcoded questions with `Date.now()` ids, while decisions
 * lived in React state and vanished on refresh. Nothing it showed was real.
 *
 * The rule the screen exists to enforce: a generated question is a draft.
 * Approving it is what copies it into the module's live question bank, through
 * the same validation a hand-typed question passes.
 */
export const Route = createFileRoute("/academy/admin/ai-review")({
  head: () => ({ meta: [{ title: "AI Review Queue · Cliffview Academy" }] }),
  // No prefetch: admin screens are client-rendered behind the gate.
  loader: () => ({ now: Date.now() }),
  component: AIReview,
});

function AIReview() {
  const { now } = Route.useLoaderData();
  const { data: queue } = useSuspenseQuery(convexQuery(api.aiReviewQueue.queue, {}));
  const data = presentAiReviewQueue(queue, now);

  const [tab, setTab] = useState<"queue" | "generate">("queue");
  const [sourceId, setSourceId] = useState<string>("");
  const [count, setCount] = useState("8");
  const [editing, setEditing] = useState<{ id: string; prompt: string } | null>(null);

  const decide = useMutation({ mutationFn: useConvexMutation(api.aiReviewQueue.setDecision) });
  const generate = useMutation({ mutationFn: useConvexAction(api.aiReview.generateFromAsset) });

  async function run(label: string, action: () => Promise<unknown>) {
    try {
      await action();
      toast.success(label);
    } catch (caught) {
      // The server's own message: "Add at least one…", "exactly one option…",
      // or OpenRouter's refusal text. All more useful than a generic failure.
      toast.error(caught instanceof Error ? caught.message : "That did not work.");
    }
  }

  async function onGenerate() {
    if (sourceId === "") {
      toast.error("Choose a document to read first.");
      return;
    }
    try {
      const result = await generate.mutateAsync({
        assetId: sourceId as Id<"assets">,
        count: Number(count) || 8,
      });
      toast.success(
        result.discarded === 0
          ? `${result.questionCount} questions drafted for review.`
          : `${result.questionCount} drafted — ${result.discarded} discarded as ungradable.`,
      );
      setTab("queue");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Generation failed.");
    }
  }

  return (
    <AdminShell>
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">AI Question Review Queue</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Questions are drafted from a module&rsquo;s own documents. Nothing reaches a teacher
              without your approval.
            </p>
          </div>

          <div className="flex items-center gap-1 rounded-xl border border-border bg-card p-1">
            {(["queue", "generate"] as const).map((id) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all",
                  tab === id
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {id === "generate" && <Sparkles className="h-4 w-4" />}
                {id === "queue" ? "Review Queue" : "Generate"}
              </button>
            ))}
          </div>
        </div>

        {data.configured ? null : (
          <div className="flex items-start gap-3 rounded-2xl border border-gold/40 bg-gold-soft/40 p-5">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-primary-deep" />
            <div>
              <p className="text-sm font-semibold text-foreground">Generation is not configured</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Set <code className="font-mono text-xs">OPENROUTER_API_KEY</code> on the deployment
                to draft questions. The review queue below still works.
              </p>
            </div>
          </div>
        )}

        {tab === "queue" ? (
          <>
            <div className="flex flex-wrap gap-3">
              {data.summary.map((chip) => (
                <span
                  key={chip.label}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold",
                    chip.tone,
                  )}
                >
                  <span className={cn("h-1.5 w-1.5 rounded-full", chip.dot)} />
                  {chip.value} {chip.label}
                </span>
              ))}
            </div>

            {data.questions.length === 0 ? (
              <section className="rounded-3xl border border-dashed border-border bg-card p-10 text-center">
                <h2 className="text-lg font-bold text-foreground">Nothing to review</h2>
                <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                  Generate questions from a module document and they will appear here as drafts.
                </p>
              </section>
            ) : (
              <div className="space-y-4">
                {data.questions.map((question) => (
                  <article
                    key={question.id}
                    className={cn(
                      "rounded-2xl border bg-card p-6 shadow-sm transition-opacity",
                      question.isPending ? "border-border" : "border-border opacity-70",
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-gold" />
                        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                          AI draft · {question.moduleTitle}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                          {question.difficulty}
                        </span>
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-0.5 text-[10px] font-bold",
                            question.confidenceTone,
                          )}
                          title="How well the source document supports this question"
                        >
                          Confidence {question.confidencePercent}%
                        </span>
                        {question.isPending ? null : (
                          <span
                            className={cn(
                              "rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase",
                              question.statusTone,
                            )}
                          >
                            {question.statusLabel}
                          </span>
                        )}
                      </div>
                    </div>

                    {editing?.id === question.id ? (
                      <textarea
                        value={editing.prompt}
                        onChange={(e) => setEditing({ id: question.id, prompt: e.target.value })}
                        className="mt-4 min-h-24 w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none focus:border-primary"
                      />
                    ) : (
                      <h3 className="mt-4 text-lg font-bold text-foreground">{question.prompt}</h3>
                    )}

                    <ul className="mt-4 space-y-2">
                      {question.options.map((option) => (
                        <li
                          key={option.id}
                          className={cn(
                            "flex items-center gap-3 rounded-xl border px-4 py-3 text-sm",
                            option.isCorrect
                              ? "border-success/60 bg-success/10 font-semibold text-foreground"
                              : "border-border text-foreground",
                          )}
                        >
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-bold text-muted-foreground">
                            {option.key}
                          </span>
                          <span className="flex-1">{option.text}</span>
                          {option.isCorrect && <Check className="h-4 w-4 text-success" />}
                        </li>
                      ))}
                    </ul>

                    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                      <p className="text-xs text-muted-foreground">{question.reviewedLabel}</p>
                      <div className="flex flex-wrap items-center gap-2">
                        {editing?.id === question.id ? (
                          <>
                            <button
                              onClick={() => setEditing(null)}
                              className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
                            >
                              Cancel
                            </button>
                            <button
                              disabled={decide.isPending || editing.prompt.trim().length === 0}
                              onClick={() =>
                                void run("Edited and approved.", async () => {
                                  await decide.mutateAsync({
                                    questionId: question.id as Id<"aiQuestions">,
                                    decision: "edited",
                                    editedPrompt: editing.prompt,
                                  });
                                  setEditing(null);
                                })
                              }
                              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-deep disabled:opacity-60"
                            >
                              <Check className="h-4 w-4" /> Save and approve
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() =>
                                setEditing({ id: question.id, prompt: question.prompt })
                              }
                              className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
                            >
                              <Pencil className="h-4 w-4" /> Edit
                            </button>
                            <button
                              disabled={decide.isPending}
                              onClick={() =>
                                void run("Question rejected.", () =>
                                  decide.mutateAsync({
                                    questionId: question.id as Id<"aiQuestions">,
                                    decision: "rejected",
                                  }),
                                )
                              }
                              className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted hover:text-destructive disabled:opacity-60"
                            >
                              <X className="h-4 w-4" /> Reject
                            </button>
                            <button
                              disabled={decide.isPending}
                              onClick={() =>
                                void run("Approved and added to the module.", () =>
                                  decide.mutateAsync({
                                    questionId: question.id as Id<"aiQuestions">,
                                    decision: "approved",
                                  }),
                                )
                              }
                              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-deep disabled:opacity-60"
                            >
                              <Check className="h-4 w-4" /> Approve
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {question.moduleSlug === "" ? null : (
                      <Link
                        to="/academy/admin/modules/$moduleSlug/assessment"
                        params={{ moduleSlug: question.moduleSlug }}
                        className="mt-3 inline-block text-xs font-semibold text-gold hover:underline"
                      >
                        Open this module&rsquo;s assessment
                      </Link>
                    )}
                  </article>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold">
                Draft from a document
              </p>
              <h2 className="mt-2 text-xl font-bold text-foreground">
                Read a module document and write questions about it
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                The whole document is read in one pass — nothing is summarised or chunked first.
                Questions arrive as drafts for review, never in a live assessment.
              </p>

              {data.sources.length === 0 ? (
                <div className="mt-6 rounded-2xl border border-dashed border-border bg-background p-6 text-center">
                  <FileText className="mx-auto h-6 w-6 text-muted-foreground" />
                  <p className="mt-3 text-sm font-semibold text-foreground">
                    No readable documents yet
                  </p>
                  <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
                    Upload a document or worksheet to a module, then come back. Only assets with a
                    file attached can be read.
                  </p>
                </div>
              ) : (
                <div className="mt-6 grid gap-4 sm:grid-cols-[1fr_auto_auto]">
                  <label className="space-y-2">
                    <span className="block text-xs font-bold uppercase tracking-widest text-muted-foreground">
                      Document
                    </span>
                    <select
                      value={sourceId}
                      onChange={(e) => setSourceId(e.target.value)}
                      className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none focus:border-primary"
                    >
                      <option value="">Choose a document…</option>
                      {data.sources.map((source) => (
                        <option key={source.assetId} value={source.assetId}>
                          {source.moduleTitle} — {source.title}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-2">
                    <span className="block text-xs font-bold uppercase tracking-widest text-muted-foreground">
                      Questions
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={count}
                      onChange={(e) => setCount(e.target.value)}
                      className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none focus:border-primary sm:w-24"
                    />
                  </label>

                  <div className="flex items-end">
                    <button
                      onClick={onGenerate}
                      disabled={generate.isPending || !data.configured}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary-deep disabled:opacity-60"
                    >
                      {generate.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" /> Reading the document…
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4" /> Draft questions
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </section>

            {data.generations.length === 0 ? null : (
              <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold">
                  Recent runs
                </p>
                <div className="mt-4 space-y-2">
                  {data.generations.map((run) => (
                    <div
                      key={run.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-background px-4 py-3"
                    >
                      <div>
                        <p className="text-sm font-semibold text-foreground">{run.fileName}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{run.startedLabel}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        {run.errorMessage === null ? null : (
                          <span className="max-w-md text-xs text-destructive">
                            {run.errorMessage}
                          </span>
                        )}
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase",
                            run.tone,
                          )}
                        >
                          {run.statusLabel}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </AdminShell>
  );
}
