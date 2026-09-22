import { convexQuery, useConvexMutation } from "@convex-dev/react-query";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Check, Target } from "lucide-react";
import { toast } from "sonner";

import { presentAdminAssessment } from "@/application/academy/presenters";
import { AdminShell } from "@/components/admin-shell";
import { useAdminViewer } from "@/hooks/use-admin-viewer";
import { type QuestionDraft, emptyDraft } from "@/components/assessment-question-draft";
import { AssessmentQuestionEditor } from "@/components/assessment-question-editor";
import { errorMessage } from "@/lib/convex-error";
import { api } from "../../convex/_generated/api";

/**
 * The assessment builder for one module.
 *
 * Its own route rather than a sixth section in the module editor, which is
 * already 618 lines across five concerns. It also means its own Convex
 * subscription: the builder does not repaint when somebody reorders a lesson,
 * and the module editor does not repaint on every question save.
 */
export const Route = createFileRoute("/academy/admin/modules/$moduleSlug/assessment")({
  head: () => ({ meta: [{ title: "Assessment · Cliffview Academy" }] }),
  // No loader prefetch: admin screens are client-rendered behind the gate in
  // `academy.admin.tsx`, and a gated query has no identity on the server.
  loader: () => ({ now: Date.now() }),
  component: AdminAssessment,
});

function AdminAssessment() {
  const viewer = useAdminViewer();
  const { moduleSlug } = Route.useParams();
  const { now } = Route.useLoaderData();
  const { data: detail } = useSuspenseQuery(convexQuery(api.questions.adminList, { moduleSlug }));
  const data = presentAdminAssessment(detail, now);
  const moduleId = detail.module._id;

  const saveQuestion = useMutation({ mutationFn: useConvexMutation(api.questions.save) });
  const removeQuestion = useMutation({ mutationFn: useConvexMutation(api.questions.remove) });
  const reorderQuestions = useMutation({ mutationFn: useConvexMutation(api.questions.reorder) });

  /** Run a mutation, surfacing the server message rather than a generic toast. */
  async function run(label: string, action: () => Promise<unknown>) {
    try {
      await action();
      toast.success(label);
    } catch (caught) {
      toast.error(errorMessage(caught, "That did not work."));
      // Rethrown so an editor card knows the save failed and keeps its values.
      throw caught;
    }
  }

  const ids = data.questions.map((question) => question.id);

  function move(index: number, direction: -1 | 1) {
    const next = [...ids];
    const target = index + direction;
    [next[index], next[target]] = [next[target], next[index]];
    return run("Order updated.", () =>
      reorderQuestions.mutateAsync({ moduleId, orderedIds: next }),
    );
  }

  async function save(questionId: string | undefined, draft: QuestionDraft) {
    await run(questionId === undefined ? "Question added." : "Question saved.", () =>
      saveQuestion.mutateAsync({
        moduleId,
        ...(questionId === undefined
          ? {}
          : { questionId: questionId as (typeof detail.questions)[number]["question"]["_id"] }),
        kind: draft.kind,
        prompt: draft.prompt,
        options: draft.options,
      }),
    );
  }

  return (
    <AdminShell viewer={viewer}>
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <Link
            to="/academy/admin/modules/$moduleSlug"
            params={{ moduleSlug }}
            className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-gold"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to {data.moduleTitle}
          </Link>
          <h1 className="mt-4 text-3xl font-bold text-foreground">Module assessment</h1>
          <p className="mt-3 text-sm text-muted-foreground">{data.passMarkHint}</p>
        </div>

        <section
          className={`rounded-3xl border p-5 ${
            data.hasAssessmentLesson ? "border-border bg-card" : "border-gold/40 bg-gold-soft/40"
          }`}
        >
          <div className="flex items-start gap-3">
            <Target
              className={`mt-0.5 h-5 w-5 shrink-0 ${
                data.hasAssessmentLesson ? "text-primary" : "text-primary-deep"
              }`}
            />
            <div>
              <p className="text-sm font-semibold text-foreground">{data.sittingLabel}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Staff answer these inside the module&rsquo;s assessment lesson. Passing is what
                marks that lesson complete.
              </p>
            </div>
          </div>
        </section>

        {data.questions.length === 0 ? (
          <section className="rounded-3xl border border-dashed border-border bg-card p-8 text-center">
            <h2 className="text-lg font-bold text-foreground">No questions yet</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Write the first one below. A module with a published assessment lesson cannot be
              published until it has at least one question.
            </p>
          </section>
        ) : (
          <div className="space-y-4">
            {data.questions.map((question, index) => (
              <div key={question.id} className="space-y-2">
                <AssessmentQuestionEditor
                  questionNumber={question.number}
                  initial={{
                    kind: question.kind,
                    prompt: question.prompt,
                    options: question.options.map((option) => ({
                      text: option.text,
                      isCorrect: option.isCorrect,
                    })),
                  }}
                  onSave={(draft) => save(question.id, draft)}
                  onRemove={() =>
                    run("Question removed.", () =>
                      removeQuestion.mutateAsync({ questionId: question.id }),
                    )
                  }
                  onMoveUp={question.isFirst ? undefined : () => move(index, -1)}
                  onMoveDown={question.isLast ? undefined : () => move(index, 1)}
                />
                <p className="px-2 text-xs text-muted-foreground">
                  {question.kindLabel} · {question.updatedLabel} · Correct answer:{" "}
                  <span className="inline-flex items-center gap-1 font-semibold text-success">
                    <Check className="h-3 w-3" />
                    {question.options.find((option) => option.isCorrect)?.key}
                  </span>
                </p>
              </div>
            ))}
          </div>
        )}

        <div className="border-t border-border pt-6">
          <h2 className="text-lg font-black tracking-tight text-foreground">Add a question</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Saved questions appear above, in the order staff will answer them.
          </p>
          <div className="mt-4">
            <AssessmentQuestionEditor
              // Remounts after each save so the blank card is genuinely blank.
              key={data.questions.length}
              questionNumber={data.questions.length + 1}
              initial={emptyDraft()}
              saveLabel="Add question"
              resetAfterSave
              onSave={(draft) => save(undefined, draft)}
            />
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
