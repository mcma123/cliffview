import type { AssessmentQuestionKind } from "@/domain/academy/entities";

/**
 * The shape the question editor edits, and its blank value.
 *
 * Its own module because a component file that also exports a constant trips
 * `react-refresh/only-export-components`, and both the editor and the route
 * that mounts it need this.
 */
export type QuestionDraft = {
  kind: AssessmentQuestionKind;
  prompt: string;
  options: Array<{ text: string; isCorrect: boolean }>;
};

/** A fresh blank question. A function, so no caller can mutate a shared array. */
export function emptyDraft(): QuestionDraft {
  return {
    kind: "multiple_choice",
    prompt: "",
    options: [
      { text: "", isCorrect: true },
      { text: "", isCorrect: false },
    ],
  };
}
