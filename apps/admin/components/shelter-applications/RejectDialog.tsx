"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ShelterApplicationRejectionCode } from "@/lib/admin-api";

const CODES: {
  value: ShelterApplicationRejectionCode;
  label: string;
  hint: string;
}[] = [
  {
    value: "invalid_registration",
    label: "Invalid registration",
    hint: "Number couldn't be verified against the public register."
  },
  {
    value: "documents_unclear",
    label: "Documents unclear",
    hint: "Photo or scan is too low quality to verify."
  },
  {
    value: "jurisdiction_mismatch",
    label: "Jurisdiction mismatch",
    hint: "Entity type doesn't match the country's accepted list."
  },
  {
    value: "duplicate",
    label: "Duplicate",
    hint: "Already exists on Fetcht under another record."
  },
  {
    value: "out_of_scope",
    label: "Out of scope",
    hint: "Not a shelter/rescue we cover right now."
  },
  { value: "other", label: "Other", hint: "Use the note to explain." }
];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (
    code: ShelterApplicationRejectionCode,
    note: string
  ) => Promise<void>;
  pending?: boolean;
  applicantName?: string;
};

export function RejectDialog({
  open,
  onOpenChange,
  onConfirm,
  pending,
  applicantName
}: Props) {
  const [code, setCode] = useState<ShelterApplicationRejectionCode | "">("");
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);

  const noteOverflow = note.length > 500;
  const hasCode = code !== "";
  const canSubmit = hasCode && !noteOverflow && !pending;

  const handleSubmit = async () => {
    setTouched(true);
    if (!hasCode || noteOverflow || pending) return;
    await onConfirm(code as ShelterApplicationRejectionCode, note.trim());
    // Reset for next use
    setCode("");
    setNote("");
    setTouched(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Reject application</DialogTitle>
          <DialogDescription>
            {applicantName
              ? `Let ${applicantName} know why. They'll see this exact wording on their status page.`
              : "They'll see this wording on their status page."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="reject-reason-code">Reason</Label>
            <Select
              value={code}
              onValueChange={(v) =>
                setCode(v as ShelterApplicationRejectionCode)
              }
            >
              <SelectTrigger id="reject-reason-code">
                <SelectValue placeholder="Pick a reason" />
              </SelectTrigger>
              <SelectContent>
                {CODES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    <div className="flex flex-col">
                      <span className="font-medium">{c.label}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {c.hint}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {touched && code === "" && (
              <p className="text-xs text-destructive">Pick a reason.</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reject-note">Note (optional, ≤500 chars)</Label>
            <Textarea
              id="reject-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={5}
              placeholder="Add context the applicant can act on. E.g. 'The registration photo is blurred — please re-upload a clear scan.'"
            />
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>Shown verbatim to the applicant.</span>
              <span className={noteOverflow ? "text-destructive" : ""}>
                {note.length} / 500
              </span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {pending ? (
              <>
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                Rejecting…
              </>
            ) : (
              "Reject application"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
