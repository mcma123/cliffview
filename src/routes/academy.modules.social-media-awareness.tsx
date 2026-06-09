import { createFileRoute, Link } from "@tanstack/react-router";
import { StaffShell } from "@/components/staff-shell";
import { ArrowRight, ChevronRight, Clock, Award, Target, BookOpen, Headphones, FileText, ClipboardCheck } from "lucide-react";

export const Route = createFileRoute("/academy/modules/social-media-awareness")({
  head: () => ({ meta: [{ title: "Social Media Awareness · Cliffview Academy" }] }),
  component: ModuleOverview,
});

const sections = [
  { n: 1, title: "Why this matters", meta: "Narrated intro · 4 min", icon: Headphones },
  { n: 2, title: "What is acceptable use?", meta: "Narrated + visuals · 8 min", icon: BookOpen },
  { n: 3, title: "Real-world scenarios", meta: "Case studies · 6 min", icon: FileText, current: true },
  { n: 4, title: "Your responsibilities", meta: "Narrated summary · 5 min", icon: Headphones },
  { n: 5, title: "Module Assessment", meta: "5 AI-generated questions · Pass mark 80%", icon: ClipboardCheck, assessment: true },
];

function ModuleOverview() {
  return (
    <StaffShell>
      <div className="mx-auto max-w-6xl space-y-6">
        <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link to="/academy/modules" className="hover:text-foreground">Modules</Link>
          <ChevronRight className="h-3 w-3" />
          <span>Core Policies</span>
          <ChevronRight className="h-3 w-3" />
          <span className="font-medium text-foreground">Social Media Awareness</span>
        </nav>

        <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-primary-deep p-8 text-primary-foreground sm:p-10">
          <p className="text-xs font-bold uppercase tracking-widest text-gold">
            Module 02 · Core Policies
          </p>
          <h1 className="mt-3 text-3xl font-bold sm:text-4xl">Social Media Awareness</h1>
          <p className="mt-4 max-w-2xl text-sm text-primary-foreground/85">
            How Cliffview staff represent the school online — what's expected, what's not, and how to respond when things go sideways.
          </p>
        </section>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              What You'll Cover
            </p>
            <ol className="mt-4 space-y-3">
              {sections.map((s) => (
                <li
                  key={s.n}
                  className={`flex items-start gap-4 rounded-xl border p-4 ${
                    s.current
                      ? "border-primary bg-primary-soft"
                      : s.assessment
                        ? "border-gold/40 bg-gold-soft/40"
                        : "border-border bg-card"
                  }`}
                >
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                    s.assessment ? "bg-gold text-primary-deep" : "bg-primary text-primary-foreground"
                  }`}>
                    <s.icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-foreground">{s.title}</h4>
                    <p className="mt-0.5 text-xs text-muted-foreground">{s.meta}</p>
                  </div>
                  {s.current && (
                    <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase text-primary-foreground">
                      Current
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </div>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-border bg-card p-5">
              <p className="text-xs font-bold uppercase tracking-widest text-gold">Module Details</p>
              <dl className="mt-4 space-y-3 text-sm">
                {[
                  { icon: Clock, label: "Duration", value: "23 min" },
                  { icon: BookOpen, label: "Sections", value: "4 + assessment" },
                  { icon: Award, label: "CPTD Points", value: "3 points" },
                  { icon: Target, label: "Pass Mark", value: "80%" },
                  { icon: ClipboardCheck, label: "Format", value: "Self-paced" },
                ].map((d) => (
                  <div key={d.label} className="flex items-center justify-between">
                    <dt className="flex items-center gap-2 text-muted-foreground">
                      <d.icon className="h-3.5 w-3.5" /> {d.label}
                    </dt>
                    <dd className="font-semibold text-foreground">{d.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <Link
              to="/academy/modules/social-media/section-3"
              className="group flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3.5 text-sm font-semibold text-primary-foreground hover:bg-primary-deep"
            >
              Start Module
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </aside>
        </div>
      </div>
    </StaffShell>
  );
}