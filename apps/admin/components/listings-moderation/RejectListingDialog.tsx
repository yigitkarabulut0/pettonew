"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import type { ListingRejectionCode } from "@petto/contracts";
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
import { REJECTION_CODES } from "@/lib/api/listings-moderation";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (code: ListingRejectionCode, noteToShelter: string, internalNote: string) => Promise<void>;
  pending?: boolean;
  petName?: string;
};

export function RejectListingDialog({ open, onOpenChange, onConfirm, pending, petName }: Props) {
  const [code, setCode] = useState<ListingRejectionCode | "">("");
  const [noteToShelter, setNoteToShelter] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [touched, setTouched] = useState(false);

  const noteOverflow = noteToShelter.length > 500;
  const internalOverflow = internalNote.length > 500;
  const canSubmit = code !== "" && !noteOverflow && !internalOverflow && !pending;

  const handleSubmit = async () => {
    setTouched(true);
    if (!canSubmit) return;
    await onConfirm(code as ListingRejectionCode, noteToShelter.trim(), internalNote.trim());
    setCode("");
    setNoteToShelter("");
    setInternalNote("");
    setTouched(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Reject listing</DialogTitle>
          <DialogDescription>
            {petName
              ? `A DSA Art. 17 statement of reasons will be generated for "${petName}" and the shelter will see the reason inline in the editor.`
              : "A DSA Art. 17 statement of reasons will be generated and the shelter will see the reason inline in the editor."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="listing-reject-code">Reason</Label>
            <Select value={code} onValueChange={(v) => setCode(v as ListingRejectionCode)}>
              <SelectTrigger id="listing-reject-code">
                <SelectValue placeholder="Pick a reason" />
              </SelectTrigger>
              <SelectContent>
                {REJECTION_CODES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    <div className="flex flex-col">
                      <span className="font-medium">{c.label}</span>
                      <span className="text-[11px] text-muted-foreground">{c.hint}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {touched && code === "" && <p className="text-xs text-destructive">Pick a reason.</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="listing-reject-note">Note to shelter (≤500)</Label>
            <Textarea
              id="listing-reject-note"
              value={noteToShelter}
              onChange={(e) => setNoteToShelter(e.target.value)}
              rows={4}
              placeholder="Shown to the shelter inline in the editor. Be specific: 'Listing titled a pitbull — please re-list under a non-restricted breed or remove.'"
            />
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>Sent to shelter.</span>
              <span className={noteOverflow ? "text-destructive" : ""}>{noteToShelter.length} / 500</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="listing-internal-note">Internal note (≤500, not sent)</Label>
            <Textarea
              id="listing-internal-note"
              value={internalNote}
              onChange={(e) => setInternalNote(e.target.value)}
              rows={3}
              placeholder="Optional context kept in the audit log for other moderators."
            />
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>Moderators only.</span>
              <span className={internalOverflow ? "text-destructive" : ""}>{internalNote.length} / 500</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleSubmit} disabled={!canSubmit}>
            {pending ? (
              <>
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                Rejecting…
              </>
            ) : (
              "Reject listing"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
