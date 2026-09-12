import { ArrowDown, ArrowUp, Check, CircleDot, ListChecks, Plus, X } from "lucide-react";
import { useState } from "react";

import { type QuestionDraft, emptyDraft } from "@/components/assessment-question-draft";
import type { AssessmentQuestionKind } from "@/domain/academy/entities";
import { cn } from "@/lib/utils";

/**
 * One question, editable in place.
 *
 * Prop-driven and Convex-free like every other component here: the route owns
 * `api.questions.save` and hands the result back through `onSave`.
 *
 * The form deliberately cannot express a shape the server would reject.
 * Choosing "True or false" collapses the answer list to the two fixed rows the
 * server normalises to, and the correct answer is a radio rather than a
 * checkbox, so "exactly one correct" is true by construction rather than by
 * validation. The server still enforces both — this only stops the admin
 * finding that out after typing a paragraph.
 */

const TRUE_FALSE: Array<{ text: string; isCorrect: boolean }> = [
  { text: "True", isCorrect: true },
  { text: "False", isCorrect: false },
];

const MAX_OPTIONS = 6;

const KINDS: Array<{
  id: AssessmentQuestionKind;
  label: string;
  icon: typeof ListChecks;
  desc: string;
}> = [
  {
    id: "multiple_choice",
    label: "Multiple choice",
    icon: ListChecks,
    desc: "Two to six answers, one of them right",
  },
  {
    id: "true_false",
    label: "True or false",
    icon: CircleDot,
    desc: "Two fixed answers",
  },
];

export function AssessmentQuestionEditor({
  questionNumber,
  initial,
  saveLabel = "Save question",
  onSave,
  onRemove,
  onMoveUp,
  onMoveDown,
  resetAfterSave = false,
}: {
  questionNumber: number;
  initial: QuestionDraft;
  saveLabel?: string;
  /** Awaited, and rethrows: the card keeps its values when the server refuses. */
  onSave: (draft: QuestionDraft) => Promise<void>;
  onRemove?: () => Promise<void>;
  onMoveUp?: () => Promise<void>;
  onMoveDown?: () => Promise<void>;
  /** The "new question" card clears itself; an existing one keeps its values. */
  resetAfterSave?: boolean;
}) {
  const [draft, setDraft] = useState<QuestionDraft>(initial);
  const [saving, setSaving] = useState(false);

  const correctIndex = draft.options.findIndex((option) => option.isCorrect);

  /**
   * Why the save button is disabled, or null when it is not.
   *
   * A reason rather than a bare boolean, because a greyed-out button that says
   * nothing reads as broken — which is exactly how the first one was reported.
   * These mirror the refusals in `questions.save`, so the admin is told before
   * a round trip what the server would have told them after one.
   */
  const blockedReason: string | null = (() => {
    if (draft.prompt.trim().length === 0) return "Write the question first.";
    const blank = draft.options.findIndex((option) => option.text.trim().length === 0);
    if (blank !== -1) {
      return `Fill in answer ${String.fromCharCode(65 + blank)} before saving.`;
    }
    if (correctIndex === -1) return "Tap an answer's letter to mark it correct.";
    const texts = draft.options.map((option) => option.text.trim().toLowerCase());
    if (new Set(texts).size !== texts.length) return "Two answers read the same.";
    return null;
  })();

  function setKind(kind: AssessmentQuestionKind) {
    setDraft((current) => ({
      ...current,
      kind,
      // Switching to true/false replaces the answers outright rather than
      // trying to preserve typed text that is about to be overwritten by the
      // server anyway.
      options:
        kind === "true_false"
          ? TRUE_FALSE.map((option, index) => ({
              ...option,
              isCorrect: index === Math.max(0, Math.min(1, correctIndex)),
            }))
          : current.kind === "true_false"
            ? emptyDraft().options
            : current.options,
    }));
  }

  function setOptionText(index: number, text: string) {
    setDraft((current) => ({
      ...current,
      options: current.options.map((option, i) => (i === index ? { ...option, text } : option)),
    }));
  }

  function setCorrect(index: number) {
    setDraft((current) => ({
      ...current,
      options: current.options.map((option, i) => ({ ...option, isCorrect: i === index })),
    }));
  }

  function addOption() {
    setDraft((current) =>
      current.options.length >= MAX_OPTIONS
        ? current
        : { ...current, options: [...current.options, { text: "", isCorrect: false }] },
    );
  }

  function removeOption(index: number) {
    setDraft((current) => {
      if (current.options.length <= 2) return current;
      const options = current.options.filter((_, i) => i !== index);
      // Removing the correct answer would leave none, which the server refuses.
      return options.some((option) => option.isCorrect)
        ? { ...current, options }
        : { ...current, options: options.map((o, i) => ({ ...o, isCorrect: i === 0 })) };
    });
  }

  async function save() {
    setSaving(true);
    try {
      await onSave(draft);
      if (resetAfterSave) setDraft(emptyDraft());
    } catch {
      // The route has already surfaced the server's message. Swallowing here
      // keeps the card open with the admin's text intact — losing a whole
      // question to one refusal is worse than the refusal.
    } finally {
      setSaving(false);
    }
  }

  const isTrueFalse = draft.kind === "true_false";

  return (
    <article className="rounded-3xl border border-border bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold">
          Question {questionNumber}
        </p>
        <div className="flex items-center gap-1">
          {onMoveUp === undefined ? null : (
            <button
              onClick={() => void onMoveUp()}
              aria-label={`Move question ${questionNumber} up`}
              className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          )}
          {onMoveDown === undefined ? null : (
            <button
              onClick={() => void onMoveDown()}
              aria-label={`Move question ${questionNumber} down`}
              className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ArrowDown className="h-4 w-4" />
            </button>
          )}
          {onRemove === undefined ? null : (
            <button
              onClick={() => void onRemove()}
              className="rounded-lg px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-destructive"
            >
              Remove
            </button>
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {KINDS.map((option) => {
          const active = draft.kind === option.id;
          return (
            <button
              key={option.id}
              onClick={() => setKind(option.id)}
              className={cn(
                "flex items-start gap-3 rounded-2xl border p-4 text-left transition-colors",
                active
                  ? "border-primary bg-primary-soft"
                  : "border-border bg-background hover:border-primary/50",
              )}
            >
              <option.icon
                className={cn("mt-0.5 h-5 w-5", active ? "text-primary" : "text-muted-foreground")}
              />
              <span>
                <span className="block text-sm font-semibold text-foreground">{option.label}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{option.desc}</span>
              </span>
            </button>
          );
        })}
      </div>

      <label className="mt-5 block space-y-2">
        <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Question
        </span>
        <textarea
          value={draft.prompt}
          onChange={(e) => setDraft((c) => ({ ...c, prompt: e.target.value }))}
          placeholder="e.g. A parent posts a complaint about a teacher on Facebook. What comes first?"
          className="min-h-24 w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none transition-colors focus:border-primary"
        />
      </label>

      <div className="mt-5 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Answers
          </span>
          <span className="text-xs text-muted-foreground">Select the correct one</span>
        </div>

        {draft.options.map((option, index) => {
          const selected = option.isCorrect;
          return (
            <div key={index} className="flex items-center gap-2">
              <button
                onClick={() => setCorrect(index)}
                aria-label={`Mark answer ${String.fromCharCode(65 + index)} correct`}
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-colors",
                  selected
                    ? "bg-success text-white"
                    : "bg-muted text-muted-foreground hover:bg-primary-soft hover:text-primary",
                )}
              >
                {selected ? <Check className="h-4 w-4" /> : String.fromCharCode(65 + index)}
              </button>
              <input
                value={option.text}
                readOnly={isTrueFalse}
                onChange={(e) => setOptionText(index, e.target.value)}
                placeholder={`Answer ${String.fromCharCode(65 + index)}`}
                className={cn(
                  "w-full rounded-2xl border border-input bg-background px-4 py-2.5 text-sm outline-none transition-colors focus:border-primary",
                  isTrueFalse && "text-muted-foreground",
                )}
              />
              {isTrueFalse || draft.options.length <= 2 ? (
                <span className="w-9 shrink-0" />
              ) : (
                <button
                  onClick={() => removeOption(index)}
                  aria-label={`Remove answer ${String.fromCharCode(65 + index)}`}
                  className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-destructive"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          );
        })}

        {isTrueFalse || draft.options.length >= MAX_OPTIONS ? null : (
          <button
            onClick={addOption}
            className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted"
          >
            <Plus className="h-4 w-4" /> Add answer
          </button>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4">
        {blockedReason === null ? null : (
          <p className="mr-auto text-xs font-semibold text-muted-foreground">{blockedReason}</p>
        )}
        <button
          onClick={save}
          disabled={blockedReason !== null || saving}
          className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-deep disabled:opacity-60"
        >
          {saving ? "Saving…" : saveLabel}
        </button>
      </div>
    </article>
  );
}
