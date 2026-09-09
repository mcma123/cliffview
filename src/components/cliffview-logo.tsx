import { cn } from "@/lib/utils";

export function CliffviewShield({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex h-12 w-12 items-center justify-center rounded-md overflow-hidden bg-transparent shadow-sm",
        className,
      )}
    >
      <img src="/logo.jpg" alt="Cliffview Academy Logo" className="h-full w-full object-contain" />
    </div>
  );
}

export function CliffviewWordmark({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <CliffviewShield className="h-10 w-10" />
      <div className="leading-tight">
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold">Cliffview</div>
        <div className="text-sm font-bold tracking-wide text-sidebar-foreground">Academy</div>
      </div>
    </div>
  );
}
