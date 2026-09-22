import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Trophy } from "lucide-react";

import { presentLearnerLeaderboard } from "@/application/academy/presenters";
import { PageNotice } from "@/components/page-notice";
import { StaffShell } from "@/components/staff-shell";
import { useStaffViewer } from "@/hooks/use-staff-viewer";
import { errorMessage } from "@/lib/convex-error";
import { api } from "../../convex/_generated/api";

/**
 * The staff leaderboard, from the database.
 *
 * The page this replaces named nine colleagues, five of whom existed nowhere
 * in the system, and told every visitor they were "#1, 60 XP ahead of #2"
 * regardless of who they were. Every row here is a real active staff member,
 * ranked by XP they actually earned.
 *
 * `learn.leaderboard` returns name, phase and XP and nothing else — no email,
 * no compliance figure, no id — because this is the one query in the app that
 * shows one colleague's data to another.
 */
export const Route = createFileRoute("/academy/leaderboard")({
  head: () => ({ meta: [{ title: "Leaderboard · Cliffview Academy" }] }),
  component: LeaderboardPage,
});

function startOfDayUtc(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

function LeaderboardPage() {
  const gate = useStaffViewer();
  const shell = gate.status === "ready" ? gate.shellProps : {};

  const { data, isPending, error } = useQuery({
    ...convexQuery(api.learn.leaderboard, { now: startOfDayUtc() }),
    enabled: gate.status === "ready",
    retry: false,
  });

  if (gate.status === "loading" || (gate.status === "ready" && isPending)) {
    return (
      <StaffShell {...shell}>
        <PageNotice title="Loading the leaderboard…" />
      </StaffShell>
    );
  }
  if (gate.status === "signed-out") {
    return (
      <StaffShell>
        <PageNotice
          title="Sign in to continue"
          action={{ label: "Go to sign in", to: "/academy/sign-in" }}
        />
      </StaffShell>
    );
  }
  if (data === undefined || error !== null) {
    return (
      <StaffShell {...shell}>
        <PageNotice
          title="We could not load the leaderboard"
          body={errorMessage(error, "") || undefined}
        />
      </StaffShell>
    );
  }

  const board = presentLearnerLeaderboard(data);
  // Podium order is 2-1-3 so first place stands in the middle.
  const podiumOrder = [board.podium[1], board.podium[0], board.podium[2]].filter(
    (row) => row !== undefined,
  );

  return (
    <StaffShell {...shell}>
      <div className="mx-auto max-w-4xl space-y-8">
        <header>
          <h1 className="text-3xl font-black tracking-tight text-foreground">Leaderboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {board.standingLabel ?? "Ranked by XP earned across the school."}
          </p>
        </header>

        {board.rows.length === 0 ? (
          <PageNotice
            title="Nobody on the board yet"
            body="XP is earned by completing lessons and modules."
          />
        ) : (
          <>
            <section className="grid gap-4 sm:grid-cols-3">
              {podiumOrder.map((row) => (
                <article
                  key={row.rank}
                  className={`flex flex-col items-center rounded-3xl border p-6 text-center shadow-sm ${
                    row.isMe ? "border-primary bg-primary/5" : "border-border bg-card"
                  } ${row.rank === 1 ? "sm:-mt-4 sm:pb-10" : ""}`}
                >
                  <div className="relative">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-xl font-black text-primary-foreground">
                      {row.initials}
                    </div>
                    {row.rank === 1 && (
                      <Trophy className="absolute -right-2 -top-2 h-6 w-6 text-gold" />
                    )}
                  </div>
                  <p className="mt-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Rank #{row.rank}
                  </p>
                  <p className="mt-1 font-bold text-foreground">{row.name}</p>
                  <p className="text-xs text-muted-foreground">{row.phaseName}</p>
                  <p className="mt-2 text-lg font-black text-foreground">{row.xpTotal} XP</p>
                </article>
              ))}
            </section>

            {board.rest.length === 0 ? null : (
              <section className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="px-6 py-4 font-bold uppercase tracking-wider text-muted-foreground">
                        Rank
                      </th>
                      <th className="px-6 py-4 font-bold uppercase tracking-wider text-muted-foreground">
                        Staff member
                      </th>
                      <th className="px-6 py-4 text-right font-bold uppercase tracking-wider text-muted-foreground">
                        XP
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {board.rest.map((row) => (
                      <tr key={row.rank} className={row.isMe ? "bg-primary/5" : ""}>
                        <td className="px-6 py-4 font-bold text-muted-foreground">#{row.rank}</td>
                        <td className="px-6 py-4">
                          <span className="font-bold text-foreground">{row.name}</span>
                          {row.isMe && (
                            <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-foreground">
                              You
                            </span>
                          )}
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {row.phaseName}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right font-bold text-foreground">
                          {row.xpTotal}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
          </>
        )}
      </div>
    </StaffShell>
  );
}
