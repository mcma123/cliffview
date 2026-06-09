import { createFileRoute, Link } from "@tanstack/react-router";
import { StaffShell } from "@/components/staff-shell";
import { Play, ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/academy/modules/social-media/section-3")({
  head: () => ({ meta: [{ title: "Real-world scenarios · Cliffview Academy" }] }),
  component: LessonPlayer,
});

const sections = [
  { n: 1, title: "Why this matters", meta: "4 min", done: true },
  { n: 2, title: "What is acceptable use?", meta: "8 min", done: true },
  { n: 3, title: "Real-world scenarios", meta: "6 min", current: true },
  { n: 4, title: "Your responsibilities", meta: "5 min" },
  { n: 5, title: "Module Assessment", meta: "Quiz", quiz: true },
];

function LessonPlayer() {
  return (
    <StaffShell>
      <div className="mx-auto max-w-7xl">
        <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-gold">
          Social Media Awareness
        </p>

        <div className="mt-4 grid gap-6 lg:grid-cols-[280px_1fr]">
          {/* Sidebar */}
          <aside className="rounded-2xl border border-border bg-card p-4">
            <p className="px-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Sections
            </p>
            <ol className="mt-3 space-y-1">
              {sections.map((s) => (
                <li
                  key={s.n}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${
                    s.current ? "bg-primary-soft font-semibold text-primary-deep" : "text-foreground hover:bg-muted"
                  }`}
                >
                  {s.done ? (
                    <CheckCircle2 className="h-4 w-4 text-success" />
                  ) : (
                    <span className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold ${
                      s.current ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground"
                    }`}>
                      {s.n}
                    </span>
                  )}
                  <div className="flex-1">
                    <div className="leading-tight">{s.title}</div>
                    <div className="text-[10px] text-muted-foreground">{s.meta}</div>
                  </div>
                </li>
              ))}
            </ol>
          </aside>

          <div className="space-y-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Section 3 of 4
              </p>
              <h1 className="mt-1 text-3xl font-bold text-foreground sm:text-4xl">Real-world scenarios</h1>
            </div>

            {/* Player */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary-deep to-primary p-8 text-primary-foreground sm:p-12">
              <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-gold/20 blur-3xl" />
              <div className="relative flex items-center gap-6">
                <button className="flex h-16 w-16 items-center justify-center rounded-full bg-gold text-primary-deep shadow-lg transition-transform hover:scale-105">
                  <Play className="h-7 w-7 fill-current" />
                </button>
                <div className="flex-1">
                  <div className="h-1.5 overflow-hidden rounded-full bg-primary-foreground/20">
                    <div className="h-full rounded-full bg-gold" style={{ width: "40%" }} />
                  </div>
                  <p className="mt-2 text-xs text-primary-foreground/80">2:24 / 6:00</p>
                </div>
              </div>
            </div>

            {/* Scenario */}
            <article className="rounded-2xl border border-border bg-card p-6 sm:p-8">
              <p className="text-xs font-bold uppercase tracking-widest text-gold">Scenario</p>
              <h2 className="mt-2 text-2xl font-bold text-foreground">The viral parent post</h2>
              <p className="mt-4 text-[15px] leading-relaxed text-foreground">
                A parent posts a complaint about Cliffview on a community Facebook group. Within an hour it has 200 shares. Three staff members have already been tagged in the comments.
              </p>
              <div className="mt-6 rounded-xl border-l-4 border-gold bg-gold-soft/50 p-5">
                <p className="text-[11px] font-bold uppercase tracking-widest text-primary-deep">
                  What would you do?
                </p>
                <p className="mt-2 text-sm italic text-primary-deep/90">
                  Take a moment before the next slide. The right move isn't the loudest one.
                </p>
              </div>
            </article>

            <div className="flex items-center justify-between">
              <button className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-muted">
                <ArrowLeft className="h-4 w-4" /> Previous
              </button>
              <Link
                to="/academy/modules/social-media/assessment"
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-deep"
              >
                Next <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </StaffShell>
  );
}