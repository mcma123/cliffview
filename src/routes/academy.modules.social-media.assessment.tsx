import { createFileRoute, Link } from "@tanstack/react-router";
import { StaffShell } from "@/components/staff-shell";
import { Sparkles, ArrowLeft, ArrowRight, Check } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/academy/modules/social-media/assessment")({
  head: () => ({ meta: [{ title: "Assessment · Cliffview Academy" }] }),
  component: Quiz,
});

const options = [
  { key: "A", text: "Reply publicly to set the record straight." },
  { key: "B", text: "Report the post to the Principal and document it. Do not engage publicly." },
  { key: "C", text: "Ask colleagues to comment in support to balance the narrative." },
  { key: "D", text: "Ignore it. Social media isn't the school's responsibility." },
];

function Quiz() {
  const [selected, setSelected] = useState("B");
  return (
    <StaffShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Module Assessment · <span className="text-foreground">Social Media Awareness</span>
          </p>
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <span
                key={n}
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                  n < 3
                    ? "bg-success/15 text-success"
                    : n === 3
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {n < 3 ? <Check className="h-3.5 w-3.5" /> : n}
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold text-muted-foreground">Question 3 of 5</p>
            <span className="inline-flex items-center gap-1 rounded-full bg-gold-soft px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary-deep">
              <Sparkles className="h-3 w-3" /> AI-generated · SMT-approved
            </span>
          </div>

          <h2 className="mt-4 text-xl font-bold leading-snug text-foreground sm:text-2xl">
            A parent posts a public complaint about a Cliffview teacher on Facebook. What is the appropriate first response from staff?
          </h2>

          <div className="mt-6 space-y-3">
            {options.map((o) => {
              const isSelected = selected === o.key;
              return (
                <button
                  key={o.key}
                  onClick={() => setSelected(o.key)}
                  className={`flex w-full items-start gap-4 rounded-xl border p-4 text-left transition-all ${
                    isSelected
                      ? "border-primary bg-primary-soft shadow-sm"
                      : "border-border bg-card hover:border-primary/50 hover:bg-muted/40"
                  }`}
                >
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                      isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {o.key}
                  </span>
                  <span className="flex-1 text-sm text-foreground">{o.text}</span>
                  {isSelected && <Check className="h-5 w-5 text-primary" />}
                </button>
              );
            })}
          </div>

          <p className="mt-5 text-xs text-muted-foreground">
            You can change your answer until you submit.
          </p>
        </div>

        <div className="flex items-center justify-between">
          <Link
            to="/academy/modules/social-media/section-3"
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <Link
            to="/academy/modules/social-media/complete"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-deep"
          >
            Submit Answer <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </StaffShell>
  );
}