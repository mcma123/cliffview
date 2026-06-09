import { createFileRoute } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin-shell";
import { Sparkles, Check, X, Pencil } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/academy/admin/ai-review")({
  head: () => ({ meta: [{ title: "AI Review Queue · Cliffview Academy" }] }),
  component: AIReview,
});

const questions = [
  {
    id: 1,
    label: "AI Draft · Disciplinary Hearings",
    difficulty: "Medium",
    confidence: 94,
    q: "Which document must be served before a disciplinary hearing under SASA?",
    options: [
      { k: "A", t: "Notice of Hearing", correct: true },
      { k: "B", t: "Verbal warning letter" },
      { k: "C", t: "School circular" },
      { k: "D", t: "Email summary" },
    ],
  },
  {
    id: 2,
    label: "AI Draft · Safeguarding & Reporting",
    difficulty: "Hard",
    confidence: 89,
    q: "A learner discloses abuse outside school hours. Within what timeframe must you report?",
    options: [
      { k: "A", t: "24 hours" },
      { k: "B", t: "Immediately", correct: true },
      { k: "C", t: "End of next school day" },
      { k: "D", t: "After confirming with parents" },
    ],
  },
];

type Action = "pending" | "approved" | "rejected" | "edited";

function AIReview() {
  const [actions, setActions] = useState<Record<number, Action>>({});
  const set = (id: number, a: Action) => setActions((p) => ({ ...p, [id]: a }));

  return (
    <AdminShell>
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">AI Question Review Queue</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            AI drafts questions from module content. Nothing goes live without your approval.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <span className="inline-flex items-center gap-2 rounded-full bg-gold-soft px-3 py-1 text-xs font-bold text-primary-deep">
            <span className="h-1.5 w-1.5 rounded-full bg-gold" /> 8 pending
          </span>
          <span className="inline-flex items-center gap-2 rounded-full bg-success/15 px-3 py-1 text-xs font-bold text-success">
            <span className="h-1.5 w-1.5 rounded-full bg-success" /> 142 approved
          </span>
          <span className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs font-bold text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" /> 12 edited
          </span>
        </div>

        <div className="space-y-4">
          {questions.map((q) => {
            const status = actions[q.id];
            return (
              <article key={q.id} className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-gold" />
                    <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                      {q.label}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                      {q.difficulty}
                    </span>
                    <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-[10px] font-bold text-primary">
                      AI Confidence: {q.confidence}%
                    </span>
                  </div>
                </div>

                <h3 className="mt-4 text-lg font-bold text-foreground">{q.q}</h3>

                <ul className="mt-4 space-y-2">
                  {q.options.map((o) => (
                    <li
                      key={o.k}
                      className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm ${
                        o.correct
                          ? "border-success/60 bg-success/10 font-semibold text-foreground"
                          : "border-border text-foreground"
                      }`}
                    >
                      <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                        o.correct ? "bg-success text-primary-foreground" : "bg-muted text-muted-foreground"
                      }`}>
                        {o.k}
                      </span>
                      <span className="flex-1">{o.t}</span>
                      {o.correct && <Check className="h-4 w-4 text-success" />}
                    </li>
                  ))}
                </ul>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                  {status ? (
                    <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${
                      status === "approved"
                        ? "bg-success/15 text-success"
                        : status === "rejected"
                          ? "bg-destructive/15 text-destructive"
                          : "bg-primary-soft text-primary"
                    }`}>
                      {status}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Awaiting review</span>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => set(q.id, "edited")}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted"
                    >
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </button>
                    <button
                      onClick={() => set(q.id, "rejected")}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-card px-3 py-2 text-xs font-semibold text-destructive hover:bg-destructive/10"
                    >
                      <X className="h-3.5 w-3.5" /> Reject
                    </button>
                    <button
                      onClick={() => set(q.id, "approved")}
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
      </div>
    </AdminShell>
  );
}