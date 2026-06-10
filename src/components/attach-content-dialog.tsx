import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Paperclip, FileText } from "lucide-react";
import { DragAndDropZone } from "./drag-and-drop-zone";

export function AttachContentDialog({ children, defaultTitle }: { children: React.ReactNode, defaultTitle?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-2xl gap-0 p-0 overflow-hidden border-border bg-card">
        <DialogHeader className="border-b border-border bg-card px-6 py-6 sm:px-8">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-soft text-primary-deep">
              <Paperclip className="h-6 w-6" />
            </div>
            <div>
              <DialogTitle className="text-2xl font-bold text-foreground">Attach resource</DialogTitle>
              <DialogDescription className="mt-1 text-sm text-muted-foreground">
                Upload a document, template, or media file to attach directly to {defaultTitle ? `"${defaultTitle}"` : "this lesson"}.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="p-6 sm:p-8 space-y-6">
          <DragAndDropZone 
            title="Upload resource" 
            description="Drag and drop a PDF, Word doc, or media file here"
            icon={FileText}
          />

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Resource Name
              </span>
              <input
                placeholder="e.g. Policy Guidelines 2026"
                className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none transition-colors focus:border-primary"
              />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Type
              </span>
              <select className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none transition-colors focus:border-primary appearance-none">
                <option>PDF Document</option>
                <option>Word Template</option>
                <option>Spreadsheet</option>
                <option>External Link</option>
              </select>
            </label>
          </div>

          <label className="block space-y-2">
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Description (Optional)
            </span>
            <textarea
              placeholder="Add context on how staff should use this resource..."
              className="min-h-20 w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none transition-colors focus:border-primary"
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
            onClick={() => setOpen(false)}
            className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-deep"
          >
            Attach file
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
