import { Link, useRouterState } from "@tanstack/react-router";
import { BarChart3, Users, BookOpen, Sparkles, FileText, ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { CliffviewWordmark } from "./cliffview-logo";
import { cn } from "@/lib/utils";

type NavItem = {
  to: string;
  label: string;
  icon: typeof BarChart3;
  exact?: boolean;
  ready?: boolean;
};
const adminNav: NavItem[] = [
  { to: "/academy/admin", label: "Overview", icon: BarChart3, exact: true, ready: true },
  { to: "/academy/admin/staff", label: "Staff", icon: Users, ready: true },
  { to: "/academy/admin/modules", label: "Modules", icon: BookOpen, ready: true },
  { to: "/academy/admin/ai-review", label: "AI Review", icon: Sparkles, ready: true },
  { to: "/academy/admin/reports", label: "Reports", icon: FileText, ready: true },
];

export function AdminShell({
  children,
  viewer,
}: {
  children: ReactNode;
  /**
   * Optional because this shell renders while the identity query settles, and
   * an avatar is not worth a loading state. It used to read `MN` — a literal,
   * on every admin screen, for whoever was signed in.
   */
  viewer?: { name: string; initials: string };
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col bg-sidebar text-sidebar-foreground lg:flex">
        <div className="border-b border-sidebar-border px-6 py-6">
          <CliffviewWordmark />
          <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-gold px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-deep">
            SMT Admin
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-6">
          {adminNav.map((item) => {
            const active = item.ready
              ? item.exact
                ? pathname === item.to
                : pathname.startsWith(item.to)
              : false;
            const className = cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-gold"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent",
            );
            const inner = (
              <>
                <item.icon className="h-4 w-4" />
                {item.label}
                {!item.ready && (
                  <span className="ml-auto text-[9px] uppercase tracking-wider text-sidebar-foreground/40">
                    soon
                  </span>
                )}
              </>
            );
            return item.ready ? (
              <Link key={item.label} to={item.to} className={className}>
                {inner}
              </Link>
            ) : (
              <a
                key={item.label}
                href={item.to}
                className={className}
                onClick={(e) => e.preventDefault()}
              >
                {inner}
              </a>
            );
          })}
        </nav>
        <div className="border-t border-sidebar-border p-4">
          <Link
            to="/academy/dashboard"
            className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/60 hover:text-gold"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to staff view
          </Link>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur lg:px-8">
          <div className="flex-1">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              SMT Admin Console
            </p>
            <h1 className="text-base font-semibold text-foreground">Cliffview Academy</h1>
          </div>
          {viewer === undefined ? null : (
            <div
              title={viewer.name}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-gold text-sm font-bold text-primary-deep"
            >
              {viewer.initials}
            </div>
          )}
        </header>
        <main className="px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
