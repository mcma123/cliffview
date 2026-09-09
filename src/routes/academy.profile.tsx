import { createFileRoute } from "@tanstack/react-router";
import { StaffShell } from "@/components/staff-shell";
import { Award, Download, Star, Lock } from "lucide-react";

export const Route = createFileRoute("/academy/profile")({
  head: () => ({ meta: [{ title: "My Profile · Cliffview Academy" }] }),
  component: Profile,
});

const badges = [
  { name: "First Steps", desc: "Complete 1 module", earned: true },
  { name: "3-Day Streak", desc: "Login 3 days", earned: true },
  { name: "Quiz Ace", desc: "100% on a quiz", earned: true },
  { name: "Top 5", desc: "Hit top 5 leaderboard", earned: true },
  { name: "Half Way", desc: "Complete 6 modules", earned: false },
  { name: "7-Day Streak", desc: "Login 7 days", earned: false },
  { name: "Mentor", desc: "Help 3 colleagues", earned: false },
  { name: "Cliffview Legend", desc: "Complete all 12", earned: false },
];

const ledger = [
  { title: "Social Media Awareness", date: "12 May 2026", pts: 3 },
  { title: "School Code of Conduct", date: "28 Apr 2026", pts: 4 },
  { title: "Onboarding & Orientation", date: "14 Apr 2026", pts: 5 },
];

function Profile() {
  return (
    <StaffShell>
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header */}
        <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-primary-deep p-6 text-primary-foreground sm:p-8">
          <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gold text-2xl font-bold text-primary-deep shadow-lg">
              MN
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold sm:text-3xl">Ms. M. Naidoo</h1>
              <p className="mt-1 text-sm text-primary-foreground/80">
                Foundation Phase · Joined Feb 2026 · m.naidoo@cliffview.co.za
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-gold px-3 py-1 text-xs font-bold uppercase tracking-wider text-primary-deep">
                  <Star className="h-3 w-3 fill-current" /> Gold Tier
                </span>
                <span className="text-sm font-semibold">12 CPTD points · year-to-date</span>
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Badges */}
          <section className="rounded-2xl border border-border bg-card p-6 lg:col-span-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-gold">
                  Badges Earned
                </p>
                <p className="mt-1 text-xs text-muted-foreground">4 of 12 unlocked</p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {badges.map((b) => (
                <div
                  key={b.name}
                  className={`flex flex-col items-center rounded-xl border p-4 text-center ${
                    b.earned
                      ? "border-gold/40 bg-gold-soft/40"
                      : "border-border bg-muted/30 opacity-60"
                  }`}
                >
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-full ${
                      b.earned ? "bg-gold text-primary-deep" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {b.earned ? <Award className="h-6 w-6" /> : <Lock className="h-5 w-5" />}
                  </div>
                  <p className="mt-2 text-xs font-bold text-foreground">{b.name}</p>
                  <p className="text-[10px] text-muted-foreground">{b.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Ledger */}
          <section className="rounded-2xl border border-border bg-card p-6">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-widest text-gold">CPTD Ledger</p>
              <button className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                Download <Download className="h-3 w-3" />
              </button>
            </div>
            <ul className="mt-4 space-y-3">
              {ledger.map((l) => (
                <li
                  key={l.title}
                  className="flex items-center justify-between border-b border-border pb-3 last:border-0 last:pb-0"
                >
                  <div>
                    <p className="text-sm font-semibold text-foreground">{l.title}</p>
                    <p className="text-xs text-muted-foreground">{l.date}</p>
                  </div>
                  <span className="rounded-full bg-success/15 px-2.5 py-1 text-xs font-bold text-success">
                    +{l.pts} pts
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-5 rounded-xl bg-primary-soft p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Total Year-to-Date
              </p>
              <p className="mt-1 text-2xl font-bold text-primary-deep">12 points</p>
            </div>
          </section>
        </div>
      </div>
    </StaffShell>
  );
}
