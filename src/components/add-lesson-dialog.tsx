import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, BookOpen, Video, Headphones, Target, Users } from "lucide-react";
import type { ModuleLessonKind } from "@/domain/academy/entities";

export function AddLessonDialog({
  children,
  onAddLesson,
}: {
  children: React.ReactNode;
  onAddLesson?: (lesson: {
    title: string;
    meta: string;
    description: string;
    kind: ModuleLessonKind;
  }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [selectedType, setSelectedType] = useState<ModuleLessonKind>("video");

  // All five ModuleLessonKind values. `case-study` was missing, even though the
  // seeded scenario lessons use it, so it could not be created through the UI.
  const types: { id: ModuleLessonKind; label: string; icon: typeof Video; desc: string }[] = [
    { id: "video", label: "Video Lesson", icon: Video, desc: "Standard recorded lesson" },
    { id: "reading", label: "Reading", icon: BookOpen, desc: "Text and documents" },
    { id: "audio", label: "Audio", icon: Headphones, desc: "Narration or podcast style" },
    { id: "case-study", label: "Case Study", icon: Users, desc: "Scenario and reflection" },
    { id: "assessment", label: "Assessment", icon: Target, desc: "Quiz or sign-off" },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-2xl gap-0 p-0 overflow-hidden border-border bg-card">
        <DialogHeader className="border-b border-border bg-gradient-to-br from-primary via-primary-deep to-[#173650] px-6 py-6 sm:px-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold text-primary-deep shadow-lg">
            <Plus className="h-6 w-6" />
          </div>
          <DialogTitle className="mt-4 text-2xl font-bold text-white">Add a new lesson</DialogTitle>
          <DialogDescription className="mt-2 text-primary-foreground/80">
            Define the structure and format for this lesson block. You can attach content and media
            later in the lesson editor.
          </DialogDescription>
        </DialogHeader>

        <div className="p-6 sm:p-8 space-y-6">
          <label className="block space-y-2">
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Lesson title
            </span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Introduction to Policy Guidelines"
              className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none transition-colors focus:border-primary"
            />
          </label>

          <div className="space-y-3">
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Lesson format
            </span>
            <div className="grid gap-3 sm:grid-cols-2">
              {types.map((type) => {
                const isSelected = selectedType === type.id;
                return (
                  <button
                    key={type.id}
                    onClick={() => setSelectedType(type.id)}
                    className={`flex items-start gap-3 rounded-2xl border p-4 text-left transition-all ${
                      isSelected
                        ? "border-primary bg-primary-soft ring-1 ring-primary"
                        : "border-border bg-background hover:border-primary/50 hover:bg-muted/50"
                    }`}
                  >
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      <type.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h4
                        className={`font-semibold ${isSelected ? "text-primary-deep" : "text-foreground"}`}
                      >
                        {type.label}
                      </h4>
                      <p className="mt-1 text-xs text-muted-foreground">{type.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <label className="block space-y-2">
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Short summary
            </span>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Briefly describe what the staff member will learn in this lesson..."
              className="min-h-24 w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none transition-colors focus:border-primary"
            />
          </label>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-border bg-muted/20 px-6 py-4 sm:px-8">
          <button
            onClick={() => setOpen(false)}
            className="rounded-2xl border border-border px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (onAddLesson) {
                const typeObj = types.find((t) => t.id === selectedType);
                onAddLesson({
                  title: title || "New Lesson",
                  meta: `${typeObj?.label} placeholder`,
                  description: summary,
                  kind: selectedType,
                });
              }
              setOpen(false);
              setTitle("");
              setSummary("");
            }}
            className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-deep"
          >
            Create lesson
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
