"use client";

import * as React from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  requireReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  onConfirm: (reason: string) => Promise<unknown> | unknown;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive,
  requireReason,
  reasonLabel = "Reason",
  reasonPlaceholder = "Explain why…",
  onConfirm
}: ConfirmDialogProps) {
  const [reason, setReason] = React.useState("");
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setReason("");
      setPending(false);
    }
  }, [open]);

  const handleConfirm = async () => {
    if (requireReason && !reason.trim()) {
      toast.error("Please add a reason before continuing.");
      return;
    }
    try {
      setPending(true);
      await onConfirm(reason.trim());
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setPending(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? <AlertDialogDescription>{description}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        {requireReason ? (
          <div className="flex flex-col gap-1.5">
            <Label>{reasonLabel}</Label>
            <Textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={reasonPlaceholder}
              rows={3}
            />
          </div>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              handleConfirm();
            }}
            disabled={pending}
            className={destructive ? "!bg-red-600 hover:!bg-red-700" : undefined}
          >
            {pending ? "Working…" : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

interface ConfirmState extends Omit<ConfirmDialogProps, "open" | "onOpenChange"> {
  open: boolean;
}

export function useConfirm() {
  const [state, setState] = React.useState<ConfirmState | null>(null);

  const confirm = React.useCallback(
    (opts: Omit<ConfirmDialogProps, "open" | "onOpenChange">) => {
      return new Promise<void>((resolve, reject) => {
        setState({
          ...opts,
          open: true,
          onConfirm: async (reason) => {
            try {
              await opts.onConfirm(reason);
              resolve();
            } catch (err) {
              reject(err);
              throw err;
            }
          }
        });
      });
    },
    []
  );

  const node = state ? (
    <ConfirmDialog
      {...state}
      onOpenChange={(open) => {
        if (!open) setState(null);
      }}
    />
  ) : null;

  return { confirm, node };
}
