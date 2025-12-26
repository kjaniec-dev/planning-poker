"use client";

import type React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

type ConfirmDialogProps = {
  trigger: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  cancelLabel?: string;
  onAction: () => void;
  actionVariant?: React.ComponentProps<typeof Button>["variant"];
  actionSize?: React.ComponentProps<typeof Button>["size"];
  actionDisabled?: boolean;
};

export function ConfirmDialog({
  trigger,
  title,
  description,
  actionLabel = "Confirm",
  cancelLabel = "Cancel",
  onAction,
  actionVariant,
  actionSize,
  actionDisabled,
}: ConfirmDialogProps) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && (
            <AlertDialogDescription>{description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              size={actionSize}
              variant={actionVariant}
              disabled={actionDisabled}
              onClick={onAction}
            >
              {actionLabel}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
