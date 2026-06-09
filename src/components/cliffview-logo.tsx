import { cn } from "@/lib/utils";

export function CliffviewShield({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex h-12 w-12 items-center justify-center rounded-md bg-gold text-primary-deep shadow-md",
        className,
      )}
    >
      <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2 4 5v7c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V5l-8-3z" fill="currentColor" opacity="0.15" />
        <path d="M12 2 4 5v7c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V5l-8-3z" />
        <path d="M9 11l3-4 3 4-3 6-3-6z" fill="currentColor" />
      </svg>
    </div>
  );
}

export function CliffviewWordmark({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <CliffviewShield className="h-10 w-10" />
      <div className="leading-tight">
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold">
          Cliffview
        </div>
        <div className="text-sm font-bold tracking-wide text-sidebar-foreground">Academy</div>
      </div>
    </div>
  );
}