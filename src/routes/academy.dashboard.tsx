import { createFileRoute, Link } from "@tanstack/react-router";
import { StaffShell } from "@/components/staff-shell";
import { Play, Clock, ArrowRight, BookOpen, Trophy, Flame, Award, Sparkles } from "lucide-react";

export const Route = createFileRoute("/academy/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard · Cliffview Academy" }] }),
  component: Dashboard,
});

const stats = [
  { label: "Modules", value: "3 / 12", sub: "complete", icon: BookOpen },
  { label: "XP Earned", value: "1,240", sub: "this month", icon: Sparkles },
  { label: "CPTD Points", value: "12", sub: "year-to-date", icon: Award },
  { label: "Streak", value: "7 days", sub: "🔥 keep going", icon: Flame },
];

const upNext = [
  { title: "Learner Discipline", meta: "≈ 25 min · 4 sections" },
  { title: "Health & Safety", meta: "≈ 20 min · 3 sections" },
];

const leaders = [
  { rank: 1, name: "Ms. Naidoo (you)", xp: 1240, me: true },
  { rank: 2, name: "Mr. van Wyk", xp: 1180 },
  { rank: 3, name: "Mrs. Dlamini", xp: 1095 },
  { rank: 4, name: "Mr. Pillay", xp: 970 },
];

const badges = ["First Module", "3-Day Streak", "Top 5"];

function Dashboard() {
  return (
    <StaffShell>
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Greeting */}
        <section className="rounded-2xl bg-gradient-to-br from-primary to-primary-deep p-6 text-primary-foreground shadow-lg sm:p-8">
          <h2 className="text-2xl font-bold sm:text-3xl">Welcome back, Ms. Naidoo 👋</h2>
          <p className="mt-2 text-sm text-primary-foreground/80">
            Foundation Phase · Wednesday, 19 May 2026
          </p>
        </section>

        {/* Stats */}
        <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {s.label}
                </p>
                <s.icon className="h-4 w-4 text-gold" />
              </div>
              <p className="mt-3 text-2xl font-bold text-foreground sm:text-3xl">{s.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{s.sub}</p>
            </div>
          ))}
        </section>

        {/* Continue learning */}
        <section className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
              <p className="text-xs font-bold uppercase tracking-widest text-gold">Continue Learning</p>
              <h3 className="mt-2 text-2xl font-bold text-foreground">Social Media Awareness</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Module 2 of 12 · Section 3 of 4: Real-world scenarios
              </p>

              <div className="mt-6">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">65% complete</span>
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> ≈ 12 min remaining</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-gradient-to-r from-primary to-gold" style={{ width: "65%" }} />
                </div>
              </div>

              <Link
                to="/academy/modules/social-media/section-3"
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary-deep"
              >
                <Play className="h-4 w-4 fill-current" /> Resume
              </Link>
            </div>

            <div className="mt-6">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Up Next in Your Pathway
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {upNext.map((m) => (
                  <div key={m.title} className="rounded-xl border border-border bg-card p-4 hover:border-primary">
                    <h4 className="font-semibold text-foreground">{m.title}</h4>
                    <p className="mt-1 text-xs text-muted-foreground">{m.meta}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            {/* Leaderboard preview */}
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-widest text-gold">This Month</p>
                <Link to="/academy/leaderboard" className="text-xs font-semibold text-primary hover:underline">
                  View all →
                </Link>
              </div>
              <ul className="mt-4 space-y-2.5">
                {leaders.map((l) => (
                  <li
                    key={l.rank}
                    className={`flex items-center gap-3 rounded-lg px-2 py-2 text-sm ${l.me ? "bg-gold-soft" : ""}`}
                  >
                    <span className="w-6 text-xs font-bold text-muted-foreground">#{l.rank}</span>
                    <Trophy className={`h-3.5 w-3.5 ${l.rank === 1 ? "text-gold" : "text-muted-foreground/40"}`} />
                    <span className="flex-1 truncate font-medium text-foreground">{l.name}</span>
                    <span className="text-xs font-semibold text-muted-foreground">{l.xp} XP</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Achievements */}
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-widest text-gold">Recent Achievements</p>
              <div className="mt-4 space-y-3">
                {badges.map((b) => (
                  <div key={b} className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gold-soft">
                      <Award className="h-5 w-5 text-gold" />
                    </div>
                    <span className="text-sm font-medium text-foreground">{b}</span>
                  </div>
                ))}
              </div>
            </div>

            <Link to="/academy/admin" className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-border px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:border-primary hover:text-primary">
              View SMT Admin Console <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </section>
      </div>
    </StaffShell>
  );
}