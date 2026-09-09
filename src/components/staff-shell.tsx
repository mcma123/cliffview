import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, BookOpen, Trophy, User, Shield, Menu, Bell, Flame } from "lucide-react";
import { useState, type ReactNode } from "react";
import { CliffviewWordmark } from "./cliffview-logo";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/academy/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/academy/modules", label: "Modules", icon: BookOpen },
  { to: "/academy/leaderboard", label: "Leaderboard", icon: Trophy },
  { to: "/academy/profile", label: "Profile", icon: User },
] as const;

export function StaffShell({ children, title }: { children: ReactNode; title?: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col bg-sidebar text-sidebar-foreground lg:flex">
        <div className="px-6 py-6 border-b border-sidebar-border">
          <CliffviewWordmark />
        </div>
        <nav className="flex-1 space-y-1 px-3 py-6">
          {nav.map((item) => {
            const active = pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-gold"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-sidebar-border p-4">
          <Link
            to="/academy/admin"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/60 hover:text-gold"
          >
            <Shield className="h-3.5 w-3.5" /> Switch to SMT
          </Link>
        </div>
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <aside className="absolute inset-y-0 left-0 w-64 bg-sidebar text-sidebar-foreground">
            <div className="px-6 py-6 border-b border-sidebar-border">
              <CliffviewWordmark />
            </div>
            <nav className="space-y-1 p-3">
              {nav.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent"
                >
                  <item.icon className="h-4 w-4" /> {item.label}
                </Link>
              ))}
            </nav>
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur lg:px-8">
          <button
            onClick={() => setOpen(true)}
            className="rounded-md p-2 text-foreground hover:bg-muted lg:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex-1">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Welcome to Cliffview Academy · Staff Training Portal
            </p>
            {title && <h1 className="text-base font-semibold text-foreground">{title}</h1>}
          </div>
          <div className="hidden items-center gap-1 rounded-full bg-gold-soft px-3 py-1 text-xs font-semibold text-primary-deep sm:flex">
            <Flame className="h-3.5 w-3.5" /> 7-day streak
          </div>
          <button className="rounded-full p-2 hover:bg-muted">
            <Bell className="h-5 w-5 text-muted-foreground" />
          </button>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
            MN
          </div>
        </header>

        <main className="px-4 py-6 pb-24 lg:px-8 lg:py-8 lg:pb-8">{children}</main>

        {/* Mobile bottom nav */}
        <nav className="fixed bottom-0 left-0 right-0 z-30 flex border-t border-border bg-card lg:hidden">
          {nav.map((item) => {
            const active = pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
