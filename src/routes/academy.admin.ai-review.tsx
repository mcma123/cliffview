import { createFileRoute } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin-shell";
import type { ReviewDecision } from "@/domain/academy/entities";
import { academyCommands, academyQueries } from "@/infrastructure/academy/container";
import {
  Sparkles,
  Check,
  X,
  Pencil,
  Upload,
  Bot,
  FileText,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { useState, useEffect } from "react";
import { DragAndDropZone } from "@/components/drag-and-drop-zone";

export const Route = createFileRoute("/academy/admin/ai-review")({
  head: () => ({ meta: [{ title: "AI Review Queue · Cliffview Academy" }] }),
  loader: () => academyQueries.getAiReviewQueue(),
  component: AIReview,
});

function AIReview() {
  const data = Route.useLoaderData();
  const [activeTab, setActiveTab] = useState<"queue" | "generate">("queue");
  const [actions, setActions] = useState<Record<number, ReviewDecision>>({});
  const [questions, setQuestions] = useState(data.questions);

  // Simulation State
  const [isGenerating, setIsGenerating] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stepText, setStepText] = useState("Idle");

  useEffect(() => {
    if (isGenerating) {
      let currentProgress = 0;
      const interval = setInterval(() => {
        currentProgress += 2;
        setProgress(currentProgress);

        if (currentProgress < 30) setStepText("Extracting text from uploaded documents...");
        else if (currentProgress < 60) setStepText("Identifying key learning objectives...");
        else if (currentProgress < 90) setStepText("Drafting assessment questions...");
        else setStepText("Finalizing formatting...");

        if (currentProgress >= 100) {
          clearInterval(interval);
          setIsGenerating(false);
          setIsComplete(true);

          // Add 2 new mock questions
          setQuestions((prev) => [
            {
              id: Date.now(),
              moduleTitle: "New Uploaded Document",
              prompt:
                "What is the recommended first step when dealing with an escalated situation?",
              difficulty: "Medium",
              confidencePercent: 95,
              options: [
                { key: "A", text: "Immediately inform the principal", isCorrect: false },
                {
                  key: "B",
                  text: "Acknowledge the concern and move the conversation offline",
                  isCorrect: true,
                },
                { key: "C", text: "Ignore the message until the end of the day", isCorrect: false },
                {
                  key: "D",
                  text: "Reply with a detailed defense of the school's actions",
                  isCorrect: false,
                },
              ],
            },
            {
              id: Date.now() + 1,
              moduleTitle: "New Uploaded Document",
              prompt: "Which communication channel should be used for formal disciplinary notices?",
              difficulty: "Hard",
              confidencePercent: 88,
              options: [
                { key: "A", text: "WhatsApp group chat", isCorrect: false },
                {
                  key: "B",
                  text: "A phone call followed by an official school email",
                  isCorrect: true,
                },
                { key: "C", text: "A handwritten note in the student's diary", isCorrect: false },
                { key: "D", text: "A casual conversation during pick-up time", isCorrect: false },
              ],
            },
            ...prev,
          ]);
        }
      }, 100);
      return () => clearInterval(interval);
    }
  }, [isGenerating]);

  const handleUpload = (file: File) => {
    setIsGenerating(true);
    setIsComplete(false);
    setProgress(0);
  };

  const setDecision = (id: number, decision: Exclude<ReviewDecision, "pending">) =>
    setActions((current) => academyCommands.applyAiReviewDecision(current, id, decision));

  return (
    <AdminShell>
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">AI Question Review Queue</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              AI drafts questions from module content. Nothing goes live without your approval.
            </p>
          </div>

          <div className="flex items-center gap-1 rounded-xl border border-border bg-card p-1">
            <button
              onClick={() => setActiveTab("queue")}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
                activeTab === "queue"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              Review Queue
            </button>
            <button
              onClick={() => setActiveTab("generate")}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
                activeTab === "generate"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Sparkles className="h-4 w-4" /> AI Generation
            </button>
          </div>
        </div>

        {activeTab === "queue" ? (
          <>
            <div className="flex flex-wrap gap-3">
              <span className="inline-flex items-center gap-2 rounded-full bg-gold-soft px-3 py-1 text-xs font-bold text-primary-deep">
                <span className="h-1.5 w-1.5 rounded-full bg-gold" /> {data.summary.pendingCount}{" "}
                pending
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-success/15 px-3 py-1 text-xs font-bold text-success">
                <span className="h-1.5 w-1.5 rounded-full bg-success" />{" "}
                {data.summary.approvedCount} approved
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs font-bold text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" /> {data.summary.editedCount}{" "}
                edited
              </span>
            </div>

            <div className="space-y-4">
              {questions.map((question) => {
                const status = actions[question.id];

                return (
                  <article
                    key={question.id}
                    className="rounded-2xl border border-border bg-card p-6 shadow-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-gold" />
                        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                          AI Draft · {question.moduleTitle}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                          {question.difficulty}
                        </span>
                        <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-[10px] font-bold text-primary">
                          AI Confidence: {question.confidencePercent}%
                        </span>
                      </div>
                    </div>

                    <h3 className="mt-4 text-lg font-bold text-foreground">{question.prompt}</h3>

                    <ul className="mt-4 space-y-2">
                      {question.options.map((option) => (
                        <li
                          key={option.key}
                          className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm ${
                            option.isCorrect
                              ? "border-success/60 bg-success/10 font-semibold text-foreground"
                              : "border-border text-foreground"
                          }`}
                        >
                          <span
                            className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                              option.isCorrect
                                ? "bg-success text-primary-foreground"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {option.key}
                          </span>
                          <span className="flex-1">{option.text}</span>
                          {option.isCorrect && <Check className="h-4 w-4 text-success" />}
                        </li>
                      ))}
                    </ul>

                    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                      {status ? (
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${
                            status === "approved"
                              ? "bg-success/15 text-success"
                              : status === "rejected"
                                ? "bg-destructive/15 text-destructive"
                                : "bg-primary-soft text-primary"
                          }`}
                        >
                          {status}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Awaiting review</span>
                      )}
                      <div className="flex gap-2">
                        <button
                          onClick={() => setDecision(question.id, "edited")}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted"
                        >
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </button>
                        <button
                          onClick={() => setDecision(question.id, "rejected")}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-card px-3 py-2 text-xs font-semibold text-destructive hover:bg-destructive/10"
                        >
                          <X className="h-3.5 w-3.5" /> Reject
                        </button>
                        <button
                          onClick={() => setDecision(question.id, "approved")}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary-deep"
                        >
                          <Check className="h-3.5 w-3.5" /> Approve
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        ) : (
          <div className="mx-auto max-w-3xl space-y-6">
            <div className="rounded-3xl border border-border bg-card p-8 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gold text-primary-deep shadow-lg">
                  <Bot className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-foreground">Generate mock questions</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Upload policy documents, handbooks, or lesson notes. Our AI will ingest the
                    context and automatically draft assessment questions for you to review.
                  </p>
                </div>
              </div>

              <div className="mt-8">
                {isGenerating ? (
                  <div className="rounded-2xl border border-primary/20 bg-primary-soft/30 p-8 text-center">
                    <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                    <h3 className="mt-4 text-lg font-bold text-foreground">AI is working...</h3>
                    <p className="mt-1 text-sm font-semibold text-primary">{stepText}</p>

                    <div className="mx-auto mt-6 h-2 w-full max-w-md overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-primary to-gold transition-all duration-300 ease-out"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                ) : isComplete ? (
                  <div className="rounded-2xl border border-success/30 bg-success/5 p-8 text-center">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/20 text-success">
                      <Check className="h-8 w-8" />
                    </div>
                    <h3 className="mt-4 text-xl font-bold text-foreground">
                      Questions generated successfully!
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      The AI extracted the key concepts and drafted 2 new questions for your review
                      queue.
                    </p>
                    <button
                      onClick={() => setActiveTab("queue")}
                      className="mx-auto mt-6 inline-flex items-center gap-2 rounded-2xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary-deep"
                    >
                      View in Review Queue <ArrowRight className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => {
                        setIsComplete(false);
                        setProgress(0);
                      }}
                      className="mt-3 block w-full text-xs font-semibold text-muted-foreground hover:text-foreground"
                    >
                      Upload another document
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <DragAndDropZone
                      title="Upload source material"
                      description="Drag and drop PDFs, DOCX, or text files here to begin."
                      icon={FileText}
                      acceptedFileTypes=".pdf,.docx,.txt"
                      onUpload={handleUpload}
                    />
                    <p className="text-center text-[10px] uppercase tracking-widest text-muted-foreground">
                      Max file size: 10MB per document
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
