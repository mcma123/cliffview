import { createFileRoute } from "@tanstack/react-router";
import { StaffShell } from "@/components/staff-shell";
import { Trophy, Flame } from "lucide-react";

export const Route = createFileRoute("/academy/leaderboard")({
  head: () => ({ meta: [{ title: "Leaderboard · Cliffview Academy" }] }),
  component: Leaderboard,
});

const top3 = [
  { rank: 2, name: "Mr. van Wyk", xp: 1180, initials: "VW" },
  { rank: 1, name: "Ms. Naidoo", xp: 1240, initials: "MN" },
  { rank: 3, name: "Mrs. Dlamini", xp: 1095, initials: "ND" },
];

const rows = [
  { rank: 4, name: "Mr. Pillay", dept: "Maths Dept", xp: 970 },
  { rank: 5, name: "Ms. Roberts", dept: "English Dept", xp: 910 },
  { rank: 6, name: "Mrs. Khumalo", dept: "Intersen", xp: 845 },
  { rank: 7, name: "Mr. de Beer", dept: "Foundation", xp: 790 },
  { rank: 8, name: "Ms. Adams", dept: "Foundation", xp: 720 },
  { rank: 9, name: "Mr. Sithole", dept: "Maths Dept", xp: 680 },
];

function Leaderboard() {
  return (
    <StaffShell>
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Leaderboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            How Cliffview staff are stacking up this month.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {["This Month", "All Time", "Foundation Phase"].map((f, i) => (
            <button
              key={f}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold ${
                i === 0
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-card text-muted-foreground hover:text-primary"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Motivational */}
        <div className="flex items-center gap-3 rounded-2xl border border-gold/40 bg-gold-soft/50 p-4">
          <Flame className="h-6 w-6 text-gold" />
          <p className="text-sm font-semibold text-primary-deep">
            You're currently #1 — 60 XP ahead of #2. Keep the streak going!
          </p>
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-gold">🏆 Top Performers</p>
          <div className="mt-4 grid items-end gap-3 sm:grid-cols-3">
            {top3.map((p) => {
              const isFirst = p.rank === 1;
              return (
                <div
                  key={p.rank}
                  className={`rounded-2xl border border-border bg-card p-6 text-center ${
                    isFirst ? "sm:-translate-y-4 border-gold bg-gradient-to-b from-gold-soft to-card shadow-xl" : "shadow-sm"
                  }`}
                >
                  <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full text-base font-bold ${
                    isFirst ? "bg-gold text-primary-deep" : "bg-primary text-primary-foreground"
                  }`}>
                    {p.initials}
                  </div>
                  <p className="mt-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Rank #{p.rank}
                  </p>
                  <p className="mt-1 font-bold text-foreground">{p.name}</p>
                  <p className="mt-2 text-lg font-bold text-primary">{p.xp} <span className="text-xs text-muted-foreground">XP</span></p>
                  {isFirst && <Trophy className="mx-auto mt-2 h-5 w-5 text-gold" />}
                </div>
              );
            })}
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-5 py-3">Rank</th>
                <th className="px-5 py-3">Staff Member</th>
                <th className="px-5 py-3 text-right">XP</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.rank} className="border-t border-border">
                  <td className="px-5 py-3 font-bold text-muted-foreground">#{r.rank}</td>
                  <td className="px-5 py-3">
                    <div className="font-semibold text-foreground">{r.name}</div>
                    <div className="text-xs text-muted-foreground">{r.dept}</div>
                  </td>
                  <td className="px-5 py-3 text-right font-bold text-foreground">{r.xp}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </StaffShell>
  );
}