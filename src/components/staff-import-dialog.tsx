import { useState } from "react";
import { AlertTriangle, CheckCircle2, Download, Loader2, Upload, Users } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DragAndDropZone } from "@/components/drag-and-drop-zone";
import { cn } from "@/lib/utils";

/** One row's verdict, as the server returned it. */
export type ImportVerdict = {
  line: number;
  name: string;
  email: string;
  outcome: "ready" | "skipped" | "invalid";
  reason: string | null;
};

export type ImportReport = {
  ready: number;
  skipped: number;
  invalid: number;
  rows: ImportVerdict[];
};

/**
 * Import a staff roster from a spreadsheet.
 *
 * Prop-driven and Convex-free: the route owns parsing and both calls, this owns
 * the three steps. `onFile` parses and asks the server for a verdict; `onImport`
 * commits it.
 *
 * Nothing is written until the admin has seen the verdicts. That is not
 * ceremony — a roster arrives with a misspelled phase or a stale address in it
 * roughly always, and finding out afterwards means unpicking real profiles.
 */
export function StaffImportDialog({
  children,
  onFile,
  onImport,
  onTemplate,
}: {
  children: React.ReactNode;
  /** Parse and preview. Returns null when the file could not be read. */
  onFile: (file: File) => Promise<ImportReport | null>;
  onImport: () => Promise<ImportReport | null>;
  onTemplate: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"idle" | "reading" | "importing">("idle");
  const [fileName, setFileName] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [done, setDone] = useState<ImportReport | null>(null);

  function reset() {
    setBusy("idle");
    setFileName(null);
    setReport(null);
    setDone(null);
  }

  async function pick(file: File) {
    setBusy("reading");
    setDone(null);
    try {
      const next = await onFile(file);
      setReport(next);
      setFileName(next === null ? null : file.name);
    } finally {
      setBusy("idle");
    }
  }

  async function commit() {
    if (report === null || report.ready === 0 || busy !== "idle") return;
    setBusy("importing");
    try {
      const result = await onImport();
      if (result !== null) {
        setDone(result);
        setReport(null);
      }
    } finally {
      setBusy("idle");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy !== "idle") return;
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-3xl gap-0 overflow-hidden border-border bg-card p-0">
        <DialogHeader className="border-b border-border bg-gradient-to-br from-primary via-primary-deep to-[#173650] px-6 py-6 sm:px-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold text-primary-deep shadow-lg">
            <Users className="h-6 w-6" />
          </div>
          <DialogTitle className="mt-4 text-2xl font-bold text-white">Import staff</DialogTitle>
          <DialogDescription className="mt-2 text-primary-foreground/80">
            Upload the school&apos;s own spreadsheet. Nothing is created until you have seen what it
            found.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto px-6 py-6 sm:px-8">
          {done !== null ? (
            <Finished report={done} onAgain={reset} />
          ) : (
            <>
              <DragAndDropZone
                title={fileName === null ? "Choose a spreadsheet" : "Choose a different file"}
                description="A .csv or .xlsx file. The first row must name the columns."
                icon={Upload}
                acceptedFileTypes=".csv,.xlsx"
                status={busy === "reading" ? "saving" : "idle"}
                uploadedFileName={fileName}
                onUpload={pick}
              />

              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  Not sure of the columns? Start from the template.
                </p>
                <button
                  type="button"
                  onClick={onTemplate}
                  className="inline-flex shrink-0 items-center gap-2 rounded-2xl border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
                >
                  <Download className="h-4 w-4" /> Download template
                </button>
              </div>

              {report === null ? null : <Preview report={report} />}
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/30 px-6 py-4 sm:px-8">
          <p className="text-xs text-muted-foreground">
            {/*
              Said here because it differs from Add staff, which does invite.
              An admin who assumes otherwise waits for logins that never come.
            */}
            No invitation emails are sent. Invite people from their profile when you are ready.
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={busy !== "idle"}
              className="rounded-2xl border border-border px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-60"
            >
              {done === null ? "Cancel" : "Close"}
            </button>
            {done !== null ? null : (
              <button
                type="button"
                onClick={commit}
                disabled={report === null || report.ready === 0 || busy !== "idle"}
                className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-deep disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy === "importing" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Importing…
                  </>
                ) : (
                  <>Import {report?.ready ?? 0} staff</>
                )}
              </button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Counts, then every row and what will happen to it. */
function Preview({ report }: { report: ImportReport }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <Tally label="Ready" value={report.ready} tone="ready" />
        <Tally label="Already on the system" value={report.skipped} tone="skipped" />
        <Tally label="Cannot import" value={report.invalid} tone="invalid" />
      </div>

      {report.ready === 0 ? (
        <div className="flex items-start gap-3 rounded-2xl border border-gold/40 bg-gold-soft/40 p-5">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-primary-deep" />
          <div>
            <p className="text-sm font-semibold text-foreground">Nothing to import</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Every row is either already on the system or needs fixing first.
            </p>
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-border">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-xs">
                <th className="whitespace-nowrap px-4 py-3 font-bold uppercase tracking-wider text-muted-foreground">
                  Row
                </th>
                <th className="px-4 py-3 font-bold uppercase tracking-wider text-muted-foreground">
                  Person
                </th>
                <th className="px-4 py-3 font-bold uppercase tracking-wider text-muted-foreground">
                  What happens
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {report.rows.map((row) => (
                <tr key={row.line} className={cn(row.outcome === "invalid" && "bg-destructive/5")}>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums text-muted-foreground">
                    {row.line}
                  </td>
                  <td className="px-4 py-3">
                    <span className="block font-medium text-foreground">
                      {row.name === "" ? "—" : row.name}
                    </span>
                    <span className="block text-xs text-muted-foreground">{row.email}</span>
                  </td>
                  <td className="px-4 py-3">
                    {row.outcome === "ready" ? (
                      <span className="inline-flex items-center gap-1.5 text-success">
                        <CheckCircle2 className="h-4 w-4" /> Will be created
                      </span>
                    ) : (
                      <span
                        className={cn(
                          "text-sm",
                          row.outcome === "invalid" ? "text-destructive" : "text-muted-foreground",
                        )}
                      >
                        {row.reason}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Finished({ report, onAgain }: { report: ImportReport; onAgain: () => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-2xl border border-success/40 bg-success/10 p-5">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
        <div>
          <p className="text-sm font-semibold text-foreground">
            {report.ready} staff member{report.ready === 1 ? "" : "s"} added
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {report.skipped === 0
              ? "Everything in the file was new."
              : `${report.skipped} were already on the system and were left alone.`}
            {report.invalid === 0
              ? ""
              : ` ${report.invalid} could not be imported — fix those rows and import the file again.`}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onAgain}
        className="inline-flex items-center gap-2 rounded-2xl border border-border px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted"
      >
        <Upload className="h-4 w-4" /> Import another file
      </button>
    </div>
  );
}

function Tally({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "ready" | "skipped" | "invalid";
}) {
  return (
    <div className="rounded-2xl border border-border bg-background p-4">
      <p
        className={cn(
          "text-2xl font-black tabular-nums",
          tone === "ready" && value > 0 && "text-success",
          tone === "invalid" && value > 0 && "text-destructive",
          (value === 0 || tone === "skipped") && "text-foreground",
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
